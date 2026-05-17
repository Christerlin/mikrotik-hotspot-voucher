# HelloConnect Configuration - v3 (compatible)
# Model: L009UiGS-2HaxD
#
/interface bridge
add name=LAN
add name=hello-h
/interface wifi
set [ find default-name=wifi1 ] configuration.mode=ap .ssid=HelloConnect disabled=no
/interface ethernet
set [ find default-name=ether1 ] name=WAN
/ip pool
add name=dhcp_pool0 ranges=172.17.10.2-172.17.10.254
add name=dhcp_pool1 ranges=192.168.150.2-192.168.150.254
/ip dhcp-server
add address-pool=dhcp_pool0 interface=hello-h name=dhcp1
add address-pool=dhcp_pool1 interface=LAN name=dhcp2
/interface bridge port
add bridge=hello-h interface=ether2
add bridge=hello-h interface=ether3
add bridge=hello-h interface=ether4
add bridge=hello-h interface=ether5
add bridge=hello-h interface=wifi1
add bridge=LAN interface=ether7
add bridge=LAN interface=ether8
/ip address
add address=172.17.10.1/24 interface=hello-h network=172.17.10.0
add address=192.168.150.1/24 interface=LAN network=192.168.150.0
/ip dhcp-client
add interface=WAN
/ip dhcp-server network
add address=172.17.10.0/24 gateway=172.17.10.1
add address=192.168.150.0/24 gateway=192.168.150.1
/ip firewall nat
add action=masquerade chain=srcnat out-interface=WAN
add action=masquerade chain=srcnat src-address=172.17.10.0/24
/ip hotspot profile
add dns-name=hello.connect hotspot-address=172.17.10.1 login-by=cookie,http-chap,http-pap,mac-cookie name=hsprof1
/ip hotspot
add address-pool=dhcp_pool0 addresses-per-mac=1 disabled=no interface=hello-h name=hotspot1 profile=hsprof1
/ip hotspot user
add name=admin509
/system clock
set time-zone-name=America/Port-au-Prince
/system identity
set name=HelloConnect
