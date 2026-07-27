# =====================================================================
# hAP lite (RB941-2nD) en HOTSPOT AUTONOME - EXEMPLE
# Copiez ce fichier vers hap-lite-captive.rsc (non versionne) et
# remplacez le SSID et CHANGEZ_MOI par vos valeurs.
#
# Le hAP lite est ici un routeur captif complet : il gère lui-même le
# WiFi, le DHCP, le NAT et le portail voucher. Utilisable seul, pour un petit commerce.
#
# Branchement :  ether1 = INTERNET (box/Starlink/partage)
#                ether2-3 + WiFi = clients hotspot (portail captif)
#                ether4 = port LIBRE (internet direct + gestion, sans portail)
#
# À appliquer sur un hAP lite remis à zéro :
#    /system reset-configuration no-defaults=yes skip-backup=yes
#    (le routeur redémarre, puis) /import hap-lite-captive.rsc
# Ensuite : copier le dossier hotspot/ (personnalise) dans /flash/hotspot/
# et créer les vouchers manuellement (IP > Hotspot > Users, user=pass,
# 8 caractères, limit-uptime selon le plan vendu).
# =====================================================================

# --- 1. Pont hotspot : WiFi + ether2-4 ---------------------------------------
/interface bridge
add name=hs-bridge

# --- 2. WiFi ouvert (le portail contrôle l'accès) ----------------------------
/interface wireless security-profiles
set [ find default=yes ] mode=none
/interface wireless
set [ find default-name=wlan1 ] mode=ap-bridge ssid="MonHotspot" \
    band=2ghz-b/g/n frequency=auto wireless-protocol=802.11 \
    default-forwarding=yes disabled=no

/interface bridge port
add bridge=hs-bridge interface=ether2
add bridge=hs-bridge interface=ether3
add bridge=hs-bridge interface=wlan1
# (ether4 volontairement HORS du bridge : port libre, voir section 3b)

# --- 3. Adressage / DHCP -----------------------------------------------------
# Sous-réseau distinct de LambdaWifi (172.17.10.x) pour éviter tout conflit.
/ip address
add address=172.20.10.1/24 interface=hs-bridge network=172.20.10.0
/ip pool
add name=hs-pool ranges=172.20.10.2-172.20.10.254
/ip dhcp-server
add address-pool=hs-pool interface=hs-bridge name=hs-dhcp disabled=no
/ip dhcp-server network
add address=172.20.10.0/24 gateway=172.20.10.1 dns-server=172.20.10.1

# --- 3b. Port LIBRE (ether4) : internet direct + gestion, sans portail -------
/ip address
add address=192.168.88.1/24 interface=ether4 network=192.168.88.0
/ip pool
add name=free-pool ranges=192.168.88.10-192.168.88.100
/ip dhcp-server
add address-pool=free-pool interface=ether4 name=free-dhcp disabled=no
/ip dhcp-server network
add address=192.168.88.0/24 gateway=192.168.88.1 dns-server=192.168.88.1

# Internet par ether1 (DHCP client)
/ip dhcp-client
add interface=ether1 disabled=no

# DNS : obligatoire pour que les clients résolvent les noms.
/ip dns
set allow-remote-requests=yes

# --- 4. NAT ------------------------------------------------------------------
/ip firewall nat
add action=masquerade chain=srcnat out-interface=ether1

# --- 5. Hotspot --------------------------------------------------------------
/ip hotspot profile
add dns-name=tm.connect hotspot-address=172.20.10.1 \
    login-by=cookie,http-chap,http-pap,mac-cookie name=tm-prof
/ip hotspot
add address-pool=hs-pool addresses-per-mac=1 disabled=no \
    interface=hs-bridge name=tm-hotspot profile=tm-prof

# --- 6. Horloge / NTP (pas de RTC : indispensable après coupure) -------------
/system clock
set time-zone-name=America/Port-au-Prince
# RouterOS v7 :
/system ntp client
set enabled=yes
/system ntp client servers
add address=pool.ntp.org
# (RouterOS v6, si besoin :
#  /system ntp client set enabled=yes server-dns-names=pool.ntp.org)

# --- 7. Sécurité -------------------------------------------------------------
/user
set admin password=CHANGEZ_MOI

/system identity
set name=MonHotspot
# =====================================================================
