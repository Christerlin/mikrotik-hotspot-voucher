// Génération d'un code voucher de 8 caractères (username = password).
// On évite les caractères ambigus (0/O, 1/I/L) pour faciliter la saisie.
import { randomInt, randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateVoucherCode(length = 8) {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

// Référence de commande unique (identifiant, réutilisé comme refference_id Pay'm).
// NB : la référence n'est PAS un secret (elle transite par Pay'm) — l'accès au
// voucher est protégé par un claim token distinct (voir generateClaimToken).
export function generateReference() {
  const d = new Date();
  const stamp = d.toISOString().slice(0, 10).replace(/-/g, "");
  let rand = "";
  for (let i = 0; i < 8; i++) rand += ALPHABET[randomInt(ALPHABET.length)];
  return `VCH-${stamp}-${rand}`;
}

// Secret opaque remis au client au checkout (>=128 bits). Il faut le présenter
// pour récupérer le code voucher -> empêche l'énumération des références.
export function generateClaimToken() {
  return randomBytes(32).toString("base64url");
}

// Code de récupération court, à noter par le client AVANT de payer. Sert de
// solution de secours quand le mini-navigateur captif n'a pas gardé la session.
// 9 caractères sur cet alphabet (32 symboles) -> ~45 bits d'entropie ; combiné
// au verrouillage par PIN côté serveur (voir server.js), le brute force est
// impraticable tout en restant raisonnable à recopier à la main.
export function generateRetrievalPin(length = 9) {
  let pin = "";
  for (let i = 0; i < length; i++) pin += ALPHABET[randomInt(ALPHABET.length)];
  return pin;
}
