// Couche base de données (PostgreSQL).
// La table `orders` est la source de vérité pour éviter toute double-livraison.

import { readFileSync } from "node:fs";
import pg from "pg";
import { config } from "./config.js";

// TLS pour PostgreSQL. Ordre de préférence :
//   1) DATABASE_CA_CERT (PEM ou chemin) -> vérification complète (recommandé en prod)
//   2) connexion locale -> pas de SSL
//   3) DATABASE_SSL_INSECURE=true -> accepte le cert du fournisseur sans le vérifier
//      (Render/Railway utilisent des certs internes ; à n'utiliser qu'en dernier recours)
//   4) sinon -> SSL standard avec vérification
function buildDbSsl() {
  const ca = process.env.DATABASE_CA_CERT;
  if (ca) {
    const pem = ca.includes("BEGIN CERTIFICATE") ? ca : readFileSync(ca, "utf8");
    return { ca: pem };
  }
  if (config.databaseUrl.includes("localhost") || config.databaseUrl.includes("127.0.0.1")) {
    return false;
  }
  if (String(process.env.DATABASE_SSL_INSECURE || "false") === "true") {
    console.warn("[db] ATTENTION : SSL PostgreSQL sans vérification (DATABASE_SSL_INSECURE).");
    return { rejectUnauthorized: false };
  }
  return true;
}

const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: buildDbSsl(),
  // Échouer vite plutôt que pendre : sur les offres gratuites la base
  // s'endort, et une requête bloquée sur le chemin d'un client qui vient de
  // payer se voit tout de suite (page qui charge sans fin).
  connectionTimeoutMillis: 5000,
  statement_timeout: 8000,
  idle_in_transaction_session_timeout: 8000,
});

// Un pool qui émet 'error' sans écouteur ferait planter le process.
pool.on("error", (err) => console.error("[db] erreur du pool:", err.message));

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      reference           TEXT PRIMARY KEY,
      plan_id             TEXT NOT NULL,
      amount_htg          INTEGER NOT NULL,
      method              TEXT NOT NULL,
      claim_hash          TEXT NOT NULL,
      retrieval_pin       TEXT,
      status              TEXT NOT NULL DEFAULT 'PENDING',
      paym_transaction_id TEXT,
      voucher_code        TEXT,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      paid_at             TIMESTAMPTZ,
      delivered_at        TIMESTAMPTZ
    );
    -- Migrations pour les bases déjà créées (CREATE TABLE IF NOT EXISTS n'ajoute
    -- pas les colonnes ajoutées après coup).
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS claim_hash TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS retrieval_pin TEXT;
    -- Jeton de passation (Return URL) : haché, à durée de vie courte.
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS handoff_hash TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS handoff_expires TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status);
    CREATE INDEX IF NOT EXISTS orders_handoff_hash_idx
      ON orders (handoff_hash) WHERE handoff_hash IS NOT NULL;
    -- Le code voucher doit être unique (évite deux commandes avec le même code).
    CREATE UNIQUE INDEX IF NOT EXISTS orders_voucher_code_idx
      ON orders (voucher_code) WHERE voucher_code IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS orders_retrieval_pin_idx
      ON orders (retrieval_pin) WHERE retrieval_pin IS NOT NULL;
  `);
}

export async function createOrder({ reference, planId, amountHtg, method, claimHash, retrievalPin, transactionId }) {
  await pool.query(
    `INSERT INTO orders (reference, plan_id, amount_htg, method, claim_hash, retrieval_pin, paym_transaction_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [reference, planId, amountHtg, method, claimHash, retrievalPin, transactionId]
  );
}

export async function getOrder(reference) {
  const { rows } = await pool.query(`SELECT * FROM orders WHERE reference = $1`, [reference]);
  return rows[0] || null;
}

export async function getOrderByPin(pin) {
  const { rows } = await pool.query(`SELECT * FROM orders WHERE retrieval_pin = $1`, [pin]);
  return rows[0] || null;
}

// --- Jeton de passation (handoff) : remis au portail au retour de paiement -----
// On ne stocke que son empreinte, et il expire vite : même intercepté, il ne
// donne accès qu'à une seule commande, et seulement quelques minutes.
export async function setHandoff(reference, handoffHash, expiresAt) {
  await pool.query(
    `UPDATE orders SET handoff_hash = $2, handoff_expires = $3 WHERE reference = $1`,
    [reference, handoffHash, expiresAt]
  );
}

export async function getOrderByHandoff(handoffHash) {
  const { rows } = await pool.query(
    `SELECT * FROM orders
      WHERE handoff_hash = $1 AND handoff_expires IS NOT NULL AND handoff_expires > now()`,
    [handoffHash]
  );
  return rows[0] || null;
}

// Récupère les commandes encore en attente et non expirées (pour le cron).
export async function getPendingOrders() {
  const { rows } = await pool.query(
    `SELECT * FROM orders
     WHERE status = 'PENDING'
       AND created_at > now() - ($1 || ' minutes')::interval`,
    [config.orderExpiryMinutes]
  );
  return rows;
}

// Réclamation ATOMIQUE PENDING -> PAID, en fixant le code voucher au même instant.
// Renvoie true seulement pour l'appelant qui a gagné la course (0 ligne = déjà pris).
export async function claimPaid(reference, transactionId, voucherCode) {
  const { rowCount } = await pool.query(
    `UPDATE orders
        SET status = 'PAID', paid_at = now(), voucher_code = $3,
            paym_transaction_id = COALESCE(paym_transaction_id, $2)
      WHERE reference = $1 AND status = 'PENDING'`,
    [reference, transactionId, voucherCode]
  );
  return rowCount === 1;
}

// Travaux à créer sur le routeur : commandes payées, code généré, pas encore posées.
export async function getRouterJobs(limit = 20) {
  const { rows } = await pool.query(
    `SELECT reference, voucher_code, plan_id
       FROM orders
      WHERE status = 'PAID' AND voucher_code IS NOT NULL
      ORDER BY paid_at ASC
      LIMIT $1`,
    [limit]
  );
  return rows;
}

// Confirmation par le routeur que l'utilisateur hotspot a bien été créé.
export async function markDelivered(reference) {
  const { rowCount } = await pool.query(
    `UPDATE orders
        SET status = 'DELIVERED', delivered_at = now()
      WHERE reference = $1 AND status = 'PAID'`,
    [reference]
  );
  return rowCount === 1;
}

// Expire les commandes trop vieilles restées en attente (le cron confirme d'abord
// via Pay'm qu'elles ne sont PAS payées avant d'appeler ceci).
export async function expireOrder(reference) {
  await pool.query(
    `UPDATE orders SET status = 'EXPIRED' WHERE reference = $1 AND status = 'PENDING'`,
    [reference]
  );
}

export { pool };
