# Mikrovoucher – Portail captif MikroTik avec vouchers et paiement mobile

Mikrovoucher est un portail captif complet pour le **Hotspot MikroTik** :
les clients achètent un code d'accès (voucher) **directement depuis le portail**
avec **Moncash, Natcash ou Kashpaw** (via l'agrégateur Pay'm),
et sont connectés automatiquement après le paiement. La vente manuelle
(WhatsApp) reste possible.

Conçu et testé en production en Haïti, derrière **Starlink (CGNAT)** — aucun
port à ouvrir, aucune IP publique nécessaire.

## Fonctionnalités
- Connexion par code voucher (username = password, 8 caractères)
- **Paiement en ligne** Moncash / Natcash / Kashpaw, livraison automatique du code
- Connexion automatique après paiement (le client ne tape rien)
- Code de récupération (PIN) si la session du navigateur est perdue
- Design cohérent « billet d'accès » sur toutes les pages, responsive
- Modèle « pull » : le routeur va chercher les vouchers payés (compatible CGNAT)

## Structure du dépôt

| Dossier | Contenu |
|---|---|
| [`hotspot/`](hotspot/) | Le portail (pages HTML/CSS à copier dans `/flash/hotspot/`) |
| [`payment-backend/`](payment-backend/) | Backend Node.js (Pay'm + livraison des vouchers), à déployer sur Render/Railway |
| [`routers/L009UiGS-RM/`](routers/L009UiGS-RM/) | Config du routeur principal (hotspot, DHCP, NAT) + agent de paiement |
| [`routers/hAP-lite/`](routers/hAP-lite/) | Config du hAP lite en point d'accès WiFi transparent |
| [`doc/`](doc/) | Guide de déploiement pas à pas + notes d'intégration Pay'm (testées en production) |

## Démarrage rapide

1. **Routeur principal** (L009UiGS-RM ou similaire) :
   importez [`routers/L009UiGS-RM/hello-connect-L009-RM.rsc`](routers/L009UiGS-RM/hello-connect-L009-RM.rsc)
   sur un routeur remis à zéro.
2. **Backend** : déployez [`payment-backend/`](payment-backend/) sur Render
   (voir [`doc/DEPLOIEMENT-paiement.md`](doc/DEPLOIEMENT-paiement.md)) et
   configurez chez Pay'm la Return URL vers `https://votre-backend/return`.
3. **Portail** : copiez `hotspot/config.example.js` vers `hotspot/config.js`,
   remplissez vos valeurs, puis copiez tout le dossier `hotspot/` dans
   `/flash/hotspot/` du routeur.
4. **Agent de paiement** : copiez
   [`routers/L009UiGS-RM/paym-pull-agent.example.rsc`](routers/L009UiGS-RM/paym-pull-agent.example.rsc)
   vers `paym-pull-agent.rsc`, remplacez `<BACKEND>` et `<TOKEN>`, importez-le.
5. **WiFi** : branchez un hAP lite configuré avec
   [`routers/hAP-lite/hap-lite-ap.example.rsc`](routers/hAP-lite/hap-lite-ap.example.rsc)
   sur un port du bridge hotspot.

Le guide complet (avec le dépannage réel : walled-garden par IP, DNS,
device-mode, CGNAT…) est dans [`doc/DEPLOIEMENT-paiement.md`](doc/DEPLOIEMENT-paiement.md).
Les pièges de l'API Pay'm relevés en production sont documentés dans
[`doc/paym-api-integration.md`](doc/paym-api-integration.md).

## Fichiers locaux non versionnés

Les valeurs propres à votre déploiement (URL du backend, jeton du routeur,
numéro WhatsApp) ne sont **jamais** committées (voir `.gitignore`) :

| Fichier local | Modèle à copier |
|---|---|
| `hotspot/config.js` | `hotspot/config.example.js` |
| `routers/L009UiGS-RM/paym-pull-agent.rsc` | `paym-pull-agent.example.rsc` |
| `routers/hAP-lite/hap-lite-ap.rsc` | `hap-lite-ap.example.rsc` |
| `payment-backend/.env` | `payment-backend/.env.example` |

## 🤝 Contribution
Les contributions sont les bienvenues ! Vous pouvez proposer des améliorations
ou de nouveaux designs via Pull Requests.

## 📜 Licence
Ce projet est sous licence MIT – libre d'utilisation et de modification.

## 👤 Auteur
Développé par Christerlin Joseph

📧 Contacts : christerlin.joseph@student.ueh.edu.ht, christerlin.joseph@icloud.com, christerlin16@gmail.com
