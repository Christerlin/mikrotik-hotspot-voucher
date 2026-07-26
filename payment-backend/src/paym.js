// Client Pay'm — cash-in (collecte) uniquement.
// Points clés (voir doc/paym-api-integration.md) :
//   - header d'auth : x-access-token (pas Authorization: Bearer) — inutile pour le cash-in
//   - montant en gourdes ENTIÈRES (NatCash rejette les décimales) -> Math.ceil
//   - champ de référence mal orthographié : refference_id (double f) — volontaire
//   - pas de webhook -> on POLL /api/paiement-verify

import { config } from "./config.js";

async function post(path, body) {
  const res = await fetch(`${config.paym.baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    // On journalise l'erreur complète : le message générique cache la vraie cause.
    throw new Error(`Pay'm ${path} ${res.status}: ${text.slice(0, 300)}`);
  }
  return json;
}

// Crée un paiement et renvoie l'URL de redirection Pay'm.
export async function createPayment({ reference, montantHtg, method }) {
  const montant = Math.ceil(montantHtg); // gourdes entières (obligatoire NatCash)
  if (montant < 20) throw new Error("Montant minimum : 20 HTG");

  const j = await post("/api/paiement-marchand", {
    client_id: config.paym.clientId,
    refference_id: reference,
    montant,
    payment_method: method, // moncash | natcash | kashpaw | all
  });

  if (!j.url) throw new Error(`Pay'm : pas d'URL de redirection (${JSON.stringify(j).slice(0, 200)})`);
  return { redirectUrl: j.url, transactionId: j.transaction_id || null };
}

// Vérifie l'état d'un paiement (à interroger en boucle).
export async function verifyPayment(reference) {
  const j = await post("/api/paiement-verify", {
    client_id: config.paym.clientId,
    refference_id: reference,
  });
  return {
    paid: j.trans_status === "ok", // "no" = pas encore payé, "ok" = payé
    amountHtg: Number(j.montant), // renvoyé en string -> Number()
    method: j.method || null,
    transactionId: j.id_transaction || null,
    raw: j,
  };
}
