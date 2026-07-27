# =====================================================================
# Mikrovoucher - Agent "pull" de paiement Pay'm (Starlink / CGNAT)
# RouterOS v7 - EXEMPLE : copiez ce fichier vers paym-pull-agent.rsc
# et remplacez <BACKEND> et <TOKEN> par vos valeurs.
#
# Principe : le routeur APPELLE le backend (trafic sortant, qui traverse
# le CGNAT de Starlink), recupere les vouchers payes, cree les
# utilisateurs hotspot, puis confirme. Aucune connexion entrante vers le
# routeur n'est necessaire, aucun port a ouvrir.
#
#   <BACKEND> = https://votre-backend.onrender.com   (SANS slash final)
#   <TOKEN>   = la meme valeur que ROUTER_PULL_TOKEN cote backend
#               (generez-la avec : openssl rand -hex 24)
#
# Prerequis device-mode :  /system device-mode print
#   hotspot=yes fetch=yes scheduler=yes
#   (sinon : /system device-mode update hotspot=yes fetch=yes scheduler=yes
#    puis confirmation physique - couper/rebrancher l'alimentation)
# =====================================================================

# --- 1. Script qui traite la file de vouchers -------------------------------
/system script
add name=paym-pull dont-require-permissions=no source={
  :local backend "<BACKEND>";
  :local token "<TOKEN>";
  :local more true;
  # On draine jusqu'a 10 vouchers par execution (rafales de ventes).
  :for i from=1 to=10 do={
    :if ($more) do={
      :local body "";
      :do {
        :set body ([/tool fetch url=("$backend/api/router/next") \
          http-header-field=("x-router-token: $token") \
          http-method=get output=user as-value]->"data");
      } on-error={ :set body ""; }
      :if ([:len $body] = 0) do={ :set more false; } else={
        # Format recu : reference|code|uptime
        :local p1 [:find $body "|"];
        :local ref [:pick $body 0 $p1];
        :local rest [:pick $body ($p1 + 1) [:len $body]];
        :local p2 [:find $rest "|"];
        :local code [:pick $rest 0 $p2];
        :local uptime [:pick $rest ($p2 + 1) [:len $rest]];
        # Cree l'utilisateur seulement s'il n'existe pas deja (idempotent).
        :if ([:len [/ip hotspot user find name=$code]] = 0) do={
          :do { /ip hotspot user add name=$code password=$code \
            limit-uptime=$uptime comment=("paym $ref"); } on-error={}
        }
        # Confirme au backend (statut -> DELIVERED).
        :do {
          /tool fetch url=("$backend/api/router/ack?ref=$ref") \
            http-header-field=("x-router-token: $token") \
            http-method=get keep-result=no;
        } on-error={}
      }
    }
  }
}

# --- 2. Planificateur : execute l'agent toutes les 15 secondes ---------------
/system scheduler
add name=paym-pull-sched interval=15s on-event="/system script run paym-pull" \
  comment="Mikrovoucher : recupere les vouchers payes"

# --- 3. Walled-garden : le CLIENT (pas encore connecte) doit pouvoir payer ---
# (Le fetch de l'agent, lui, est emis par le routeur et n'est pas filtre.)
/ip hotspot walled-garden
add dst-host=*.onrender.com comment="backend paiement"
# add dst-host=<votre-domaine-backend>          ;# si domaine personnalise
add dst-host=*.solutionip.app comment="Pay'm"
add dst-host=plopplop.solutionip.app comment="Pay'm"
add dst-host=paymplopplop.com comment="Pay'm (page retour/merci)"
add dst-host=*.paymplopplop.com comment="Pay'm (page retour/merci)"
add dst-host=*.moncashbutton.digicelgroup.com comment="MonCash"
add dst-host=*.digicelgroup.com comment="MonCash"
add dst-host=*.natcash.ht comment="NatCash"
add dst-host=*.natcom.com.ht comment="NatCash"

# --- 3b. IMPORTANT : autorisation par IP (le filtrage par nom d'hote est
# peu fiable pour le HTTPS sur certaines versions de RouterOS).
# Resolvez les IP reelles et ajoutez-les :
#   :put [:resolve votre-backend.onrender.com]
#   :put [:resolve merchantpay.natcom.com.ht]
# puis, pour chaque IP obtenue :
#   /ip hotspot walled-garden ip add action=accept dst-address=<IP> comment="..."
# Exemples observes en production (a verifier chez vous, elles changent) :
# /ip hotspot walled-garden ip add action=accept dst-address=216.24.57.0/24 comment="render"
# /ip hotspot walled-garden ip add action=accept dst-address=190.102.95.42 comment="natcash"

# Astuce diagnostic : si une page de paiement reste bloquee, pendant le blocage
#   /ip firewall connection print where dst-port=443
# les connexions du client marquees "d" (DSTNAT) qui passent de established a
# close en boucle designent l'IP a autoriser.
