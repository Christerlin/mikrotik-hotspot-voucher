import express from "express";
import cors from "cors";
import { timingSafeEqual, createHash } from "node:crypto";
import { config, PLANS, METHODS } from "./config.js";
import {
  initDb,
  createOrder,
  getOrder,
  getOrderByPin,
  setHandoff,
  getOrderByHandoff,
  getPendingOrders,
  expireOrder,
  getRouterJobs,
  markDelivered,
} from "./db.js";
import { createPayment, verifyPayment } from "./paym.js";
import { generateReference, generateClaimToken, generateRetrievalPin } from "./voucher.js";
import { processOrder } from "./deliver.js";

const app = express();
app.use(express.json());
// Derrière le proxy de Render : nécessaire pour que req.ip lise l'X-Forwarded-For
// de façon fiable (et non une valeur usurpée par le client).
app.set("trust proxy", config.trustProxy);
// Le portail est servi par le routeur : on n'autorise que ces origines (CORS).
app.use(cors({
  origin: config.corsOrigins,
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "x-claim-token"],
}));

function sha256(s) {
  return createHash("sha256").update(String(s)).digest();
}
// Comparaison à temps constant de deux buffers (longueurs potentiellement différentes).
function safeEqual(aBuf, bBuf) {
  return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
}

// --- Limiteur de débit en mémoire (par IP, via req.ip fiable) ---
const hits = new Map();
function rateLimit(max) {
  return function (req, res, next) {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const rec = hits.get(ip) || { count: 0, reset: now + 60_000 };
    if (now > rec.reset) {
      rec.count = 0;
      rec.reset = now + 60_000;
    }
    rec.count += 1;
    hits.set(ip, rec);
    if (rec.count > max) return res.status(429).json({ error: "Trop de tentatives, réessayez dans une minute." });
    next();
  };
}

// Jeton du routeur : accepté UNIQUEMENT via l'en-tête (jamais en query string,
// qui fuiterait dans les logs). Comparaison à temps constant.
function checkRouterToken(req, res) {
  const provided = req.headers["x-router-token"] || "";
  if (!safeEqual(Buffer.from(String(provided)), Buffer.from(config.routerPullToken))) {
    res.status(403).json({ error: "forbidden" });
    return false;
  }
  return true;
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/api/plans", (_req, res) => {
  res.json(Object.entries(PLANS).map(([id, p]) => ({ id, label: p.label, htg: p.htg })));
});

// 1) Créer un paiement -> URL de redirection Pay'm + claim token (secret client).
app.post("/api/checkout", rateLimit(12), async (req, res) => {
  try {
    const { planId, method } = req.body || {};
    const plan = PLANS[planId];
    if (!plan) return res.status(400).json({ error: "Forfait invalide." });
    if (!METHODS.has(method)) return res.status(400).json({ error: "Méthode de paiement invalide." });

    const reference = generateReference();
    const claimToken = generateClaimToken();
    const retrievalPin = generateRetrievalPin();
    const { redirectUrl, transactionId } = await createPayment({
      reference,
      montantHtg: plan.htg,
      method,
    });
    await createOrder({
      reference,
      planId,
      amountHtg: plan.htg,
      method,
      claimHash: sha256(claimToken).toString("hex"),
      retrievalPin,
      transactionId,
    });
    // claimToken + retrievalPin renvoyés une seule fois ici.
    res.json({ reference, claimToken, retrievalPin, redirectUrl });
  } catch (err) {
    console.error("[checkout]", err.message);
    res.status(502).json({ error: "Échec de la création du paiement. Réessayez." });
  }
});

// 2) Statut d'une commande (le client interroge en boucle après la redirection).
//    Protégé par le claim token (empêche l'énumération des références).
const lastVerify = new Map(); // reference -> timestamp du dernier verify Pay'm
app.get("/api/order/:reference", rateLimit(40), async (req, res) => {
  try {
    const order = await getOrder(req.params.reference);
    // Claim token requis : réponse 404 uniforme si absent/incorrect (pas d'oracle).
    const claim = req.headers["x-claim-token"] || "";
    if (
      !order ||
      !safeEqual(sha256(claim), Buffer.from(order.claim_hash, "hex"))
    ) {
      return res.status(404).json({ error: "Commande introuvable." });
    }

    // Throttle : on ne re-vérifie Pay'm que si l'intervalle mini est écoulé.
    if (order.status === "PENDING") {
      const last = lastVerify.get(order.reference) || 0;
      if (Date.now() - last < config.verifyThrottleMs) {
        return res.json({ status: "PENDING" });
      }
      lastVerify.set(order.reference, Date.now());
    }
    res.json(await processOrder(order));
  } catch (err) {
    console.error("[order]", err.message);
    res.status(502).json({ error: "Vérification indisponible, réessayez." });
  }
});

// 2b) Récupération par code court (PIN) — solution de secours quand le
//     mini-navigateur captif n'a pas gardé la session. Le PIN fait office de
//     secret ; protégé par rate-limit IP + verrou global par tentative de PIN
//     (empêche un attaquant distribué de forcer un PIN précis).
const pinFails = new Map(); // pin essayé -> { count, lockUntil }
const PIN_MAX_ATTEMPTS = 8;
const PIN_LOCK_MS = 15 * 60_000;
function pinLocked(pin) {
  const rec = pinFails.get(pin);
  return !!(rec && rec.count >= PIN_MAX_ATTEMPTS && Date.now() < rec.lockUntil);
}
function recordPinFailure(pin) {
  const rec = pinFails.get(pin) || { count: 0, lockUntil: 0 };
  rec.count += 1;
  rec.lockUntil = Date.now() + PIN_LOCK_MS;
  pinFails.set(pin, rec);
}
app.get("/api/retrieve/:pin", rateLimit(15), async (req, res) => {
  try {
    const pin = String(req.params.pin || "").toUpperCase().replace(/\s+/g, "");
    if (!pin) return res.status(404).json({ error: "Code introuvable." });
    if (pinLocked(pin)) {
      return res.status(429).json({ error: "Trop de tentatives pour ce code. Réessayez plus tard." });
    }
    const order = await getOrderByPin(pin);
    if (!order) {
      recordPinFailure(pin);
      return res.status(404).json({ error: "Code introuvable." });
    }
    pinFails.delete(pin); // code valide -> on lève le verrou pour ce PIN
    if (order.status === "PENDING") {
      const last = lastVerify.get(order.reference) || 0;
      if (Date.now() - last < config.verifyThrottleMs) return res.json({ status: "PENDING" });
      lastVerify.set(order.reference, Date.now());
    }
    res.json(await processOrder(order));
  } catch (err) {
    console.error("[retrieve]", err.message);
    res.status(502).json({ error: "Vérification indisponible, réessayez." });
  }
});

// 2c) Return URL configurée chez Pay'm. Le client y atterrit après le paiement
//     (à la place de la page pub). Cette URL doit être publique + HTTPS, d'où le
//     passage par le backend, qui renvoie ensuite vers le portail captif.
// Observé en production (non documenté par Pay'm) — query string reçue ici :
//   { statut: "ok", id_transaction: "...", refference_id: "VCH-..." }
// (visite directe de l'URL = objet vide)
app.get("/return", rateLimit(30), async (req, res) => {
  console.log("[return] query:", JSON.stringify(req.query));

  // RÈGLE : ce endpoint est sur le chemin critique d'un client qui vient de
  // payer. Il doit TOUJOURS rediriger vite, même si la base est lente, froide
  // ou indisponible. Le jeton de passation est un confort, pas une condition :
  // sans lui le portail retombe sur sa session locale, puis sur le PIN.
  let target = config.portalReturnUrl;
  try {
    const reference = Object.values(req.query)
      .map((v) => String(v))
      .find((v) => /^VCH-\d{8}-[A-Z0-9]+$/.test(v));

    if (reference) {
      // On ne met JAMAIS le PIN (ni le code) dans l'URL : la référence transite
      // par le navigateur et n'est pas secrète, donc quiconque la connaît
      // pourrait rejouer cette URL. À la place, un jeton à usage court (256
      // bits, stocké haché) valable seulement quelques minutes.
      const handoff = generateClaimToken();
      const expiresAt = new Date(Date.now() + config.handoffTtlMs);
      // Course contre la montre : au-delà du délai, on part sans jeton.
      const stored = await Promise.race([
        setHandoff(reference, sha256(handoff).toString("hex"), expiresAt).then(() => true),
        new Promise((resolve) => setTimeout(() => resolve(false), config.returnDbTimeoutMs)),
      ]);
      if (stored) {
        target += (target.includes("?") ? "&" : "?") + "t=" + encodeURIComponent(handoff);
      } else {
        console.warn("[return] base trop lente, redirection sans jeton:", reference);
      }
    }
  } catch (err) {
    // Un échec ici ne doit jamais bloquer le retour du client vers le portail.
    console.error("[return]", err.message);
  }
  res.redirect(302, target);
});

// 2d) Échange du jeton de passation contre l'état de la commande (même forme de
//     réponse que /api/order). Le jeton expire vite et ne vaut que pour une
//     commande : il ne permet aucune énumération.
app.get("/api/handoff/:token", rateLimit(40), async (req, res) => {
  try {
    const token = String(req.params.token || "");
    const order = token ? await getOrderByHandoff(sha256(token).toString("hex")) : null;
    if (!order) return res.status(404).json({ error: "Lien expiré ou invalide." });

    if (order.status === "PENDING") {
      const last = lastVerify.get(order.reference) || 0;
      if (Date.now() - last < config.verifyThrottleMs) return res.json({ status: "PENDING" });
      lastVerify.set(order.reference, Date.now());
    }
    res.json(await processOrder(order));
  } catch (err) {
    console.error("[handoff]", err.message);
    res.status(502).json({ error: "Vérification indisponible, réessayez." });
  }
});

// --- Endpoints réservés au ROUTEUR (modèle pull, Starlink/CGNAT) ---------------
// Le routeur appelle ces URLs en sortant (via /tool fetch), donc traverse le NAT.

// 3a) Prochain voucher à créer. Réponse texte simple : "reference|code|uptime"
//     (ou corps vide s'il n'y a rien) — trivial à parser en script RouterOS.
app.get("/api/router/next", async (req, res) => {
  if (!checkRouterToken(req, res)) return;
  try {
    const jobs = await getRouterJobs(1);
    res.type("text/plain");
    if (jobs.length === 0) return res.send("");
    const job = jobs[0];
    const uptime = PLANS[job.plan_id]?.uptime || "1d";
    res.send(`${job.reference}|${job.voucher_code}|${uptime}`);
  } catch (err) {
    console.error("[router/next]", err.message);
    res.status(502).send("");
  }
});

// 3b) Le routeur confirme que l'utilisateur hotspot a été créé -> DELIVERED.
app.get("/api/router/ack", async (req, res) => {
  if (!checkRouterToken(req, res)) return;
  try {
    const ref = String(req.query.ref || "");
    if (!ref) return res.status(400).send("missing ref");
    await markDelivered(ref);
    res.type("text/plain").send("ok");
  } catch (err) {
    console.error("[router/ack]", err.message);
    res.status(502).send("");
  }
});

// --- Cron de réconciliation : règle les commandes des clients non revenus -------
async function reconcile() {
  let pending;
  try {
    pending = await getPendingOrders();
  } catch (err) {
    return console.error("[reconcile] lecture:", err.message);
  }
  for (const order of pending) {
    try {
      await processOrder(order); // vérifie Pay'm + passe en PAID (le routeur créera le voucher)
    } catch (err) {
      console.error(`[reconcile] ${order.reference}:`, err.message);
    }
  }
  // Expire les commandes trop vieilles UNIQUEMENT si Pay'm confirme "non payé".
  const ageMs = config.orderExpiryMinutes * 60_000;
  for (const order of pending) {
    if (Date.now() - new Date(order.created_at).getTime() < ageMs) continue;
    try {
      const { paid } = await verifyPayment(order.reference);
      if (!paid) await expireOrder(order.reference);
    } catch {
      /* on réessaiera au prochain tour */
    }
  }
}

async function main() {
  await initDb();
  setInterval(reconcile, config.reconcileIntervalMs);
  app.listen(config.port, () => console.log(`Backend Mikrovoucher sur le port ${config.port}`));
}

main().catch((err) => {
  console.error("Échec du démarrage :", err);
  process.exit(1);
});
