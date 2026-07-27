# Déploiement — Paiement en ligne (Pay'm) + vouchers automatiques

**Contexte réseau : le FAI est Starlink (CGNAT)** → le routeur n'a pas d'IP
publique et n'est pas joignable depuis Internet. On utilise donc le **modèle
« pull »** : c'est le **routeur qui appelle le backend** (trafic sortant, qui
traverse le CGNAT). Aucune connexion entrante vers le routeur n'est requise.

```
Client (portail captif)  ──►  Backend (Render/Railway)  ──►  Pay'm (MonCash/NatCash/Kashpaw)
                                     ▲   │
      Routeur MikroTik  ────────────┘   │  (le routeur "pull" les vouchers payés
      (scheduler /tool fetch, sortant) ◄┘   toutes les 15 s, crée les users, confirme)
```

Flux : le client paie sur `prix.html` → le backend vérifie Pay'm et génère le
code → le routeur récupère le code, crée l'utilisateur hotspot, confirme → le
portail affiche le code au client.

---

## Étape 1 — Déployer le backend sur Render (ou Railway)

Dossier : [`../payment-backend/`](../payment-backend/)

1. Poussez ce dépôt sur GitHub.
2. Render → **New → Web Service**, *Root Directory* =
   `mikrotik-hotspot-voucher/payment-backend`
   - Build : `npm install`  ·  Start : `npm start`
3. Render → **New → PostgreSQL**, copiez son `DATABASE_URL`.
4. Générez le jeton du routeur : `openssl rand -hex 24`
5. Variables d'environnement (voir [`../payment-backend/.env.example`](../payment-backend/.env.example)) :

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | l'URL de la base Render |
| `PAYM_CLIENT_ID` | votre `pp_...` |
| `ROUTER_PULL_TOKEN` | le jeton généré (identique côté routeur) |

> Plan gratuit Render : le service « s'endort ». Le routeur le réveille à chaque
> `fetch`, mais pour fiabiliser le **cron de réconciliation**, préférez un petit
> plan payant ou un UptimeRobot qui ping `/health`.

6. Notez l'URL publique `https://xxx.onrender.com`.

---

## Étape 2 — Configurer le routeur (RouterOS v7)

Éditez [`../mikrotik Hotspot Config v2 + backup router setup/paym-pull-agent.rsc`](../mikrotik%20Hotspot%20Config%20v2%20+%20backup%20router%20setup/paym-pull-agent.rsc) :

- Remplacez `<BACKEND>` par `https://xxx.onrender.com` (sans slash final).
- Remplacez `<TOKEN>` par la **même** valeur que `ROUTER_PULL_TOKEN`.

Ce fichier installe :
1. un **script** `paym-pull` (récupère les vouchers payés, crée les users, confirme) ;
2. un **scheduler** qui l'exécute toutes les **15 s** ;
3. le **walled-garden** (backend + Pay'm + MonCash + NatCash) — indispensable pour
   qu'un client **pas encore connecté** puisse payer.

Appliquez-le : Winbox → **Files** (glisser le `.rsc`) → **New Terminal** →
`/import paym-pull-agent.rsc`  (ou copier-coller le contenu dans le terminal).

Vérifier :
```
/system scheduler print         # paym-pull-sched doit être actif
/system script run paym-pull    # test manuel
/log print where topics~"script"
```

---

## Étape 3 — Configurer le portail captif

Dans [`../hotspot/prix.html`](../hotspot/prix.html), en haut du `<head>` :

```js
window.BACKEND_URL = "https://xxx.onrender.com"; // votre backend
window.WHATSAPP_NUMBER = "509XXXXXXXX";          // repli WhatsApp
```

Puis copiez tout le dossier `hotspot/` dans `/flash/hotspot/` du routeur.

---

## Étape 4 — Tester (vrai argent, pas de sandbox)

1. Connectez un téléphone au WiFi → la page de connexion s'ouvre.
2. `prix.html` → **Payer en ligne** → MonCash/NatCash → payez le plus petit
   montant possible.
3. De retour sur le portail, le portail *poll* le backend ; dès que le routeur a
   créé le voucher (≤ ~15 s), le code s'affiche.
4. Vérifiez : `/ip hotspot user print` → l'utilisateur existe.
5. Saisissez le code sur `login.html` → connexion.

### Dépannage
- **Paiement ne s'ouvre pas** → hôte manquant dans le walled-garden
  (`/log print where topics~"hotspot"`).
- **Payé mais pas de code** → `/system script run paym-pull` puis
  `/log print where topics~"script"` ; vérifiez `<BACKEND>` et `<TOKEN>`.
- **`403` sur /api/router/** → le `<TOKEN>` du routeur ≠ `ROUTER_PULL_TOKEN`.
- **`503 ERR_PARAMETERS_INVALID`** → montant décimal envoyé à NatCash (le backend
  arrondit déjà, ne pas contourner).

---

## Sécurité
- Secrets Pay'm et `ROUTER_PULL_TOKEN` : **uniquement** côté backend / routeur,
  jamais dans les fichiers HTML.
- Les endpoints `/api/router/*` sont protégés par le jeton (comparaison à temps
  constant) et ne sont utilisés que par le routeur.
- `reference` unique + réclamation atomique `PENDING→PAID` + index unique sur le
  code → aucune double-création de voucher.
