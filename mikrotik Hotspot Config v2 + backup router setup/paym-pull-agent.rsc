# =====================================================================
# Mikrovoucher – Agent "pull" de paiement (Starlink / CGNAT)
# RouterOS v7
#
# Le routeur APPELLE le backend (sortant -> traverse le CGNAT Starlink),
# récupère les vouchers payés, crée les utilisateurs hotspot, puis confirme.
# Aucune connexion entrante vers le routeur n'est nécessaire.
#
# ⚠️ Remplacez <BACKEND> et <TOKEN> avant d'appliquer.
#    <BACKEND> = https://xxx.onrender.com   (SANS slash final)
#    <TOKEN>   = la même valeur que ROUTER_PULL_TOKEN côté backend
# =====================================================================

# --- 1. Script qui traite la file de vouchers -------------------------------
/system script
add name=paym-pull dont-require-permissions=no source={
  :local backend "https://lambdawifi-deploy.onrender.com";
  :local token "8441ee2c72a58c7819d3ed905c96ea7e68b0918f2ee3635a";
  :local more true;
  # On draine jusqu'à 10 vouchers par exécution (rafales de ventes).
  :for i from=1 to=10 do={
    :if ($more) do={
      :local body "";
      :do {
        :set body ([/tool fetch url=("$backend/api/router/next") \
          http-header-field=("x-router-token: $token") \
          http-method=get output=user as-value]->"data");
      } on-error={ :set body ""; }
      :if ([:len $body] = 0) do={ :set more false; } else={
        # Format reçu : reference|code|uptime
        :local p1 [:find $body "|"];
        :local ref [:pick $body 0 $p1];
        :local rest [:pick $body ($p1 + 1) [:len $body]];
        :local p2 [:find $rest "|"];
        :local code [:pick $rest 0 $p2];
        :local uptime [:pick $rest ($p2 + 1) [:len $rest]];
        # Crée l'utilisateur seulement s'il n'existe pas déjà (idempotent).
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

# --- 2. Planificateur : exécute l'agent toutes les 15 secondes ---------------
/system scheduler
add name=paym-pull-sched interval=15s on-event="/system script run paym-pull" \
  comment="Mikrovoucher : récupère les vouchers payés"

# --- 3. Walled-garden : le CLIENT (pas encore connecté) doit pouvoir payer ---
# (Le fetch de l'agent, lui, est émis par le routeur et n'est pas filtré.)
/ip hotspot walled-garden
add dst-host=*.onrender.com comment="backend paiement"
# add dst-host=<votre-domaine-backend>          ;# si domaine personnalisé
add dst-host=*.solutionip.app comment="Pay'm"
add dst-host=plopplop.solutionip.app comment="Pay'm"
add dst-host=paymplopplop.com comment="Pay'm (page pub/merci)"
add dst-host=*.paymplopplop.com comment="Pay'm (page pub/merci)"
add dst-host=*.moncashbutton.digicelgroup.com comment="MonCash"
add dst-host=*.digicelgroup.com comment="MonCash"
add dst-host=*.natcash.ht comment="NatCash"
add dst-host=*.natcom.com.ht comment="NatCash"

# Astuce : si une page de paiement reste bloquée, repérez l'hôte appelé
#   /log print where topics~"hotspot"
# puis ajoutez le dst-host manquant ci-dessus.
