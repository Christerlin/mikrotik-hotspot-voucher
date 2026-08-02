# =====================================================================
# Essai gratuit — L009UiGS-RM
#
# A importer apres le script reseau principal (reimportable sans risque) :
#   /import hotspot-essai-gratuit.rsc
#
# Ce que ca fait : un appareil qui n'a jamais paye peut se connecter
# 5 minutes par jour, sans code. Le lien apparait tout seul sur la page
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
# idle-timeout / keepalive-timeout : sans eux, une session dont l'appareil
# s'eteint ne se fermerait jamais et mangerait les 5 minutes offertes.
# Cree ou met a jour : ce fichier peut etre reimporte sans erreur (un "add"
# sur un nom deja pris arreterait l'import, et le profil ne peut pas etre
# supprime tant que des comptes T-<mac> l'utilisent).
#
# Pas de "comment=" ici : contrairement a la plupart des menus, /ip hotspot
# user profile n'accepte pas ce parametre ("bad parameter comment").
# Le nom "essai" suffit a l'identifier.
:if ([:len [/ip hotspot user profile find name=essai]] = 0) do={
  /ip hotspot user profile add name=essai shared-users=1 rate-limit="1M/2M" idle-timeout=5m keepalive-timeout=2m
} else={
  /ip hotspot user profile set [find name=essai] shared-users=1 rate-limit="1M/2M" idle-timeout=5m keepalive-timeout=2m
}

# --- Activation de l'essai sur le serveur hotspot ----------------------
# trial-uptime = duree offerte / periode avant remise a zero.
#   5m/1d  -> 5 minutes par jour et par appareil
#
# ATTENTION - l'essai est compte par adresse MAC, et les telephones
# modernes changent la leur : iOS 18+ choisit "Rotating" par defaut sur
# les reseaux ouverts (nouvelle MAC toutes les 2 semaines), et n'importe
# qui peut basculer "Adresse Wi-Fi privee" pour en obtenir une neuve tout
# de suite. L'essai n'est donc PAS infalsifiable : c'est une depense de
# publicite, pas un controle d'acces. D'ou 5 minutes -- assez pour montrer
# que le reseau marche, trop peu pour valoir la peine d'etre contourne.
# Les codes vendus, eux, ne dependent pas de la MAC : ils restent surs.
# On AJOUTE "trial" aux methodes de connexion existantes sans toucher aux
# autres (cookie et mac-cookie assurent la reconnexion sans retaper le code).
/ip hotspot profile
set [find name=hsprof1] login-by=cookie,http-chap,http-pap,mac-cookie,trial trial-uptime=5m/1d trial-user-profile=essai

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
