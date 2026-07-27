// Règlement d'une commande (modèle "pull" / Starlink CGNAT).
// Le backend NE contacte PAS le routeur : il se contente de vérifier Pay'm,
// de réclamer la commande de façon atomique et de générer le code voucher.
// C'est le routeur qui, ensuite, récupère le code via /api/router/next et crée
// l'utilisateur hotspot, puis confirme via /api/router/ack (statut -> DELIVERED).

import { verifyPayment } from "./paym.js";
import { claimPaid, getOrder } from "./db.js";
import { generateVoucherCode } from "./voucher.js";

// Traite une commande côté paiement. Renvoie l'état courant.
// `voucherCode` n'est renvoyé au client QUE lorsque le routeur a confirmé
// la création (status DELIVERED) — le code ne marche pas avant.
export async function processOrder(order) {
  if (order.status === "DELIVERED") {
    return { status: "DELIVERED", voucherCode: order.voucher_code };
  }
  if (order.status === "EXPIRED" || order.status === "FAILED") {
    return { status: order.status };
  }
  if (order.status === "PAID") {
    // Payé, code généré, en attente de création par le routeur.
    return { status: "PAID" };
  }

  // PENDING -> on demande à Pay'm.
  const result = await verifyPayment(order.reference);
  if (!result.paid) return { status: "PENDING" };

  // Anti-sous-paiement.
  if (!(result.amountHtg >= order.amount_htg)) {
    console.warn(
      `[deliver] Sous-paiement ${order.reference} : payé ${result.amountHtg}, attendu ${order.amount_htg}`
    );
    return { status: "PENDING", underpaid: true };
  }

  // Réclamation atomique + génération du code (une seule fois).
  // On réessaie si le code tiré entre en collision avec un autre (index unique).
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateVoucherCode(8);
    try {
      const won = await claimPaid(order.reference, result.transactionId, code);
      if (!won) {
        // Un autre process a déjà réclamé -> on relit l'état final.
        const fresh = await getOrder(order.reference);
        return { status: fresh.status };
      }
      return { status: "PAID" }; // le routeur prendra le relais
    } catch (err) {
      if (String(err.code) === "23505") continue; // collision de code -> nouveau tirage
      throw err;
    }
  }
  throw new Error(`Impossible de générer un code unique pour ${order.reference}`);
}
