// Configuration centrale : variables d'environnement + définition des forfaits.
// Aucune valeur secrète n'est codée en dur ici — tout vient de l'environnement.

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT || 3000),

  // Pay'm (agrégateur MonCash / NatCash / Kashpaw)
  paym: {
    baseUrl: process.env.PAYM_BASE_URL || "https://plopplop.solutionip.app",
    clientId: required("PAYM_CLIENT_ID"),
    // clientSecret n'est nécessaire que pour les payouts (cash-out), pas pour le cash-in.
    clientSecret: process.env.PAYM_CLIENT_SECRET || null,
  },

  // Modèle "pull" (Starlink/CGNAT) : c'est le ROUTEUR qui appelle le backend
  // (sortant, traverse le NAT). Le backend ne se connecte jamais au routeur.
  // Ce jeton protège les endpoints /api/router/* que seul le routeur utilise.
  routerPullToken: required("ROUTER_PULL_TOKEN"),

  // Sécurité / comportement
  orderExpiryMinutes: Number(process.env.ORDER_EXPIRY_MINUTES || 15),
  reconcileIntervalMs: Number(process.env.RECONCILE_INTERVAL_MS || 120000), // 2 min

  // CORS : le portail est servi par le routeur -> on n'autorise que ces origines.
  // Adaptez CORS_ORIGINS si le portail utilise un autre dns-name / IP.
  corsOrigins: (process.env.CORS_ORIGINS || "http://lambda.connect,http://172.17.10.1")
    .split(",").map((s) => s.trim()).filter(Boolean),
  // Nombre de proxys de confiance devant l'app (Render = 1) pour lire req.ip sûrement.
  trustProxy: Number(process.env.TRUST_PROXY || 1),
  // Anti-martèlement de Pay'm : intervalle mini entre deux verify d'une même commande.
  verifyThrottleMs: Number(process.env.VERIFY_THROTTLE_MS || 4000),

  databaseUrl: required("DATABASE_URL"),
};

// Forfaits — doivent rester alignés avec hotspot/prix.html.
// `uptime` utilise le format de durée RouterOS (3d = 3 jours).
export const PLANS = {
  "3j": { label: "3 jours", htg: 25, uptime: "3d" },
  "7j": { label: "7 jours", htg: 200, uptime: "7d" },
  "15j": { label: "15 jours", htg: 500, uptime: "15d" },
  "30j": { label: "30 jours", htg: 800, uptime: "30d" },
};

export const METHODS = new Set(["moncash", "natcash", "kashpaw", "all"]);
