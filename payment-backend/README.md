# Mikrovoucher — Backend de paiement

Petit service Node.js qui encaisse les paiements **Pay'm** (MonCash / NatCash /
Kashpaw) et génère les **vouchers hotspot**. Le FAI étant **Starlink (CGNAT)**, on
utilise le **modèle « pull »** : le routeur MikroTik appelle le backend (sortant)
pour récupérer les vouchers payés et créer lui-même les utilisateurs hotspot.

## Endpoints
| Méthode | Route | Rôle |
|---|---|---|
| `GET`  | `/health` | sonde de vie |
| `GET`  | `/api/plans` | liste des forfaits |
| `POST` | `/api/checkout` | crée un paiement → `{ reference, redirectUrl }` |
| `GET`  | `/api/order/:reference` | statut + `voucherCode` une fois livré |
| `GET`  | `/api/router/next` | *(routeur)* prochain voucher : `reference\|code\|uptime` |
| `GET`  | `/api/router/ack` | *(routeur)* confirme la création → `DELIVERED` |

Les deux derniers exigent `?token=ROUTER_PULL_TOKEN`.

## Lancer en local
```bash
cp .env.example .env   # puis remplir les valeurs
npm install
npm start
```
Nécessite un PostgreSQL accessible via `DATABASE_URL`.

## Points clés
- **Pas de webhook Pay'm** → statut obtenu par *polling* (client + cron interne).
- **CGNAT-friendly** : le backend ne se connecte jamais au routeur ; c'est le
  routeur qui « pull » (script + scheduler RouterOS, voir `../mikrotik .../paym-pull-agent.rsc`).
- **Sécurité argent** : `reference` unique + réclamation atomique `PENDING → PAID`
  + index unique sur le code → aucune double-livraison.
- Secrets (`PAYM_*`, `ROUTER_PULL_TOKEN`) **uniquement** ici, jamais dans le portail.

Déploiement complet (Render/Railway + routeur + walled-garden) :
voir [`../doc/DEPLOIEMENT-paiement.md`](../doc/DEPLOIEMENT-paiement.md).
