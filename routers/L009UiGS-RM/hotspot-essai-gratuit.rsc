# =====================================================================
# Essai gratuit — L009UiGS-RM
#
# A importer UNE FOIS, apres le script reseau principal :
#   /import hotspot-essai-gratuit.rsc
#
# Ce que ca fait : un appareil qui n'a jamais paye peut se connecter
# 20 minutes par jour, sans code. Le lien apparait tout seul sur la page
# de connexion ($(if trial == 'yes')) et disparait quand le quota est
# epuise. But : laisser le client constater que le reseau marche avant
# de lui demander de l'argent.
#
# Ne contient aucun secret : ce fichier peut rester dans le depot.
# =====================================================================

# --- Profil applique aux utilisateurs d'essai --------------------------
# Meme debit que les forfaits d'entree de gamme : un essai bride ne vend
# rien, il prouve juste que le reseau est lent. C'est la DUREE qui limite,
# pas la vitesse.
/ip hotspot user profile
add name=essai shared-users=1 rate-limit="1M/2M" \
    comment="Essai gratuit - genere automatiquement (utilisateurs T-<mac>)"

# --- Activation de l'essai sur le serveur hotspot ----------------------
# trial-uptime = duree offerte / periode avant remise a zero.
#   20m/1d  -> 20 minutes par jour et par appareil
# On AJOUTE "trial" aux methodes de connexion existantes sans toucher aux
# autres (cookie et mac-cookie assurent la reconnexion sans retaper le code).
/ip hotspot profile
set [find name=hsprof1] \
    login-by=cookie,http-chap,http-pap,mac-cookie,trial \
    trial-uptime=20m/1d \
    trial-user-profile=essai

# --- Verification ------------------------------------------------------
# /ip hotspot profile print detail        -> doit lister "trial"
# /ip hotspot user print where profile=essai
#     -> les comptes T-<mac> apparaissent au fur et a mesure des essais
# /ip hotspot active print where user~"^T-"
#     -> qui est en essai en ce moment
#
# Pour arreter l'essai (retirer "trial" de la liste) :
#   /ip hotspot profile set [find name=hsprof1] \
#       login-by=cookie,http-chap,http-pap,mac-cookie
#
# Pour rendre un essai a un appareil avant la fin de la journee :
#   /ip hotspot user remove [find name="T-AA:BB:CC:DD:EE:FF"]
