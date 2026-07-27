# =====================================================================
# LambdaWifi — hAP lite (RB941-2nD) en POINT D'ACCÈS pour le hotspot
# RouterOS v6/v7 (ancien paquet wireless : /interface wireless)
#
# Rôle : diffuser le WiFi du hotspot. Le hAP lite ne route rien et ne
# gère aucun paiement — il est 100 % transparent (pont de niveau 2).
# C'est le routeur principal (L009UiGS-RM) qui gère hotspot, vouchers,
# DHCP et paiement.
#
# Branchement :  ether1 du hAP lite  ->  un port du bridge hotspot du
# L009 (ether2 à ether5). Les clients WiFi tombent alors directement sur
# le réseau hotspot 172.17.10.0/24 et voient le portail.
#
# EXEMPLE : copiez ce fichier vers hap-lite-ap.rsc (non versionné) et
# remplacez CHANGEZ_MOI par un vrai mot de passe admin.
#
# À appliquer sur un hAP lite remis à zéro :
#    /system reset-configuration no-defaults=yes skip-backup=yes
#    (le routeur redémarre, puis) /import hap-lite-ap.rsc
# =====================================================================

# --- 1. Pont : tous les ports + le WiFi dans un seul bridge transparent ------
/interface bridge
add name=br-ap

# --- 2. WiFi ouvert (PAS de mot de passe WiFi : c'est le portail hotspot
#        qui contrôle l'accès, comme dans un hôtel) -------------------------
/interface wireless security-profiles
set [ find default=yes ] mode=none
/interface wireless
set [ find default-name=wlan1 ] mode=ap-bridge ssid="LambdaWifi" \
    band=2ghz-b/g/n frequency=auto wireless-protocol=802.11 \
    default-forwarding=yes disabled=no

# --- 3. Tout dans le bridge --------------------------------------------------
/interface bridge port
add bridge=br-ap interface=ether1
add bridge=br-ap interface=ether2
add bridge=br-ap interface=ether3
add bridge=br-ap interface=ether4
add bridge=br-ap interface=wlan1

# --- 4. Adresse de gestion : fournie par le DHCP du routeur principal --------
# (Visible dans WinBox > IP > DHCP Server > Leases sur le L009.
#  WinBox par MAC fonctionne toujours, même sans IP.)
/ip dhcp-client
add interface=br-ap disabled=no

# --- 5. Divers ---------------------------------------------------------------
/system identity
set name=LambdaWifi-AP
/system clock
set time-zone-name=America/Port-au-Prince

# --- 6. SÉCURITÉ : mot de passe admin (obligatoire avant de brancher) --------
/user
set admin password=CHANGEZ_MOI

#
# Notes :
#  - Plusieurs hAP lite peuvent être branchés (un par zone à couvrir) avec
#    cette même config ; changez juste "set name=" pour les distinguer.
#  - Le hAP lite est 2.4 GHz uniquement, ~30 clients max en pratique.
#  - Aucun paramètre du hotspot/paiement n'est nécessaire ici : tout vit
#    sur le routeur principal.
# =====================================================================
