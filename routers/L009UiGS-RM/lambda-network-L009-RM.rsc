# =====================================================================
# Lambda Network — Configuration pour L009UiGS-RM  (SANS WiFi)
# RouterOS v7
#
# Adapté au modèle RM (pas de radio WiFi) :
#   - lignes /interface wifi retirées
#   - mot de passe ajouté au compte admin509 (sinon accès gratuit possible)
#   - client NTP activé (pas de RTC : indispensable après une coupure de courant)
#
# Le WiFi est fourni par un hAP lite en mode point d'accès
# (config : ../hAP-lite/hap-lite-ap.rsc), branché sur un port du bridge
# hotspot (ether2–5).
#
# À appliquer sur un routeur remis à zéro :
#    /system reset-configuration no-defaults=yes skip-backup=yes
#    (le routeur redémarre, puis) /import lambda-network-L009-RM.rsc
# =====================================================================

/interface bridge
add name=LAN
add name=hello-h

/interface ethernet
set [ find default-name=ether1 ] name=WAN

/ip pool
add name=dhcp_pool0 ranges=172.17.10.2-172.17.10.254
add name=dhcp_pool1 ranges=192.168.150.2-192.168.150.254

/ip dhcp-server
add address-pool=dhcp_pool0 interface=hello-h name=dhcp1
add address-pool=dhcp_pool1 interface=LAN name=dhcp2

/interface bridge port
# --- Rezo HOTSPOT (kliyan) : ether2–5. Branche le hAP lite (AP) sur l'un d'eux. ---
add bridge=hello-h interface=ether2
add bridge=hello-h interface=ether3
add bridge=hello-h interface=ether4
add bridge=hello-h interface=ether5
# --- Rezo LAN prive (jesyon) : ether7–8 ---
add bridge=LAN interface=ether7
add bridge=LAN interface=ether8

/ip address
add address=172.17.10.1/24 interface=hello-h network=172.17.10.0
add address=192.168.150.1/24 interface=LAN network=192.168.150.0

/ip dhcp-client
add interface=WAN

# DNS : indispensable pour le hotspot -> les clients doivent pouvoir résoudre
# les noms (portail, Pay'm, MonCash...). Sans ceci, le walled-garden ne sert à rien.
/ip dns
set allow-remote-requests=yes

/ip dhcp-server network
add address=172.17.10.0/24 gateway=172.17.10.1 dns-server=172.17.10.1
add address=192.168.150.0/24 gateway=192.168.150.1 dns-server=192.168.150.1

/ip firewall nat
add action=masquerade chain=srcnat out-interface=WAN
add action=masquerade chain=srcnat src-address=172.17.10.0/24

/ip hotspot profile
add dns-name=lambda.connect hotspot-address=172.17.10.1 \
    login-by=cookie,http-chap,http-pap,mac-cookie name=hsprof1

/ip hotspot
add address-pool=dhcp_pool0 addresses-per-mac=1 disabled=no interface=hello-h \
    name=hotspot1 profile=hsprof1

/ip hotspot user
# METTRE un vrai mot de passe (sans mot de passe = accès gratuit pour tous).
add name=admin509 password=CHANGEZ_MOI comment="acces admin"

# --- Horloge / NTP : essentiel (pas de RTC ; coupures de courant fréquentes) ---
/system clock
set time-zone-name=America/Port-au-Prince
/system ntp client
set enabled=yes
/system ntp client servers
add address=pool.ntp.org

/system identity
set name=LambdaNetwork

# =====================================================================
# ÉTAPES SUIVANTES (après import)
#   1) Copier le dossier  hotspot/  dans  /flash/hotspot/   (portail + paiement)
#      — y compris hotspot/config.js (copié depuis config.example.js)
#   2) Copier paym-pull-agent.example.rsc vers paym-pull-agent.rsc, remplacer
#      <BACKEND> et <TOKEN>, puis l'importer (script pull + walled-garden)
#   3) Brancher le hAP lite (../hAP-lite/hap-lite-ap.rsc) sur ether2–5 pour le WiFi
# =====================================================================
