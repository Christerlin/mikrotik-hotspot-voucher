# Points d'accès UniFi derrière le hotspot MikroTik

Comment ajouter des bornes WiFi UniFi (testé avec des **UAP-AC-M**) à un site
dont le portail captif tourne sur un MikroTik. Écrit après une installation
réelle à trois bornes ; les pièges décrits ici ont tous coûté du temps.

## Le principe : les bornes ne décident de rien

Les UniFi sont de **simples points d'accès** — elles diffusent le SSID et
pontent le trafic vers le MikroTik. C'est le hotspot MikroTik qui fait le
portail, l'authentification, le décompte du temps et les forfaits.

Il ne faut donc **jamais** activer le portail invité UniFi : deux portails se
disputeraient les mêmes clients et aucun ne fonctionnerait. Pas de VLAN, pas
de DHCP, pas de « Guest Policy » côté UniFi.

```
Internet ─ MikroTik (hotspot, DHCP, portail) ─ ether2..5 ─ switch PoE ─ AP ×3
                                               bridge hello-h
```

Toutes les bornes doivent être sur **le même segment L2 que le hotspot**
(bridge `hello-h`, 172.17.10.0/24 dans la config de référence). C'est ce qui
rend le déplacement d'un client d'une borne à l'autre transparent.

## Alimentation

Vérifié sur les fiches constructeur :

- **L009UiGS-RM** : PoE-out sur **ether8 uniquement**, en **PoE passif**,
  1 A au total. Et dans la config de référence, ether8 appartient au bridge
  `LAN` (administration), pas au hotspot.
- **UAP-AC-M** : accepte le **PoE passif 24 V** et le **802.3af Alt A**. Les
  boîtes à l'unité contiennent un injecteur ; les packs de 5, non.

Conclusion pratique : au-delà d'une borne, passez par un **switch PoE** ou par
les injecteurs fournis. Ne comptez pas sur le PoE du routeur.

## L'étape qu'on oublie : sortir les bornes du portail

Les bornes vivent sur le réseau du hotspot. Le hotspot les voit donc comme des
clients non authentifiés et **intercepte leur trafic** — y compris les
messages qu'elles envoient au contrôleur toutes les 30 secondes.

Symptôme : le WiFi marche parfaitement, les clients voient le portail, mais le
contrôleur affiche les bornes **hors ligne**. On soupçonne le matériel alors
que c'est le portail qui les bâillonne.

Relevez leurs adresses MAC (OUI Ubiquiti : `24:5A:4C`, `78:8A:20`, `F0:9F:C2`,
`04:18:D6`, `74:83:C2`, `E0:63:DA`) :

```
/ip dhcp-server lease print where server=dhcp1
```

Puis dispensez-les du portail, et fixez leur adresse :

```
/ip hotspot ip-binding
add mac-address=XX:XX:XX:XX:XX:XX type=bypassed comment="UniFi AP 1"

/ip dhcp-server lease
add address=172.17.10.11 mac-address=XX:XX:XX:XX:XX:XX server=dhcp1 comment="AP 1"
```

**Cette dispense n'ouvre pas le réseau.** Elle ne vaut que pour l'adresse MAC
citée. Les bornes pontent sans faire de NAT : l'adresse MAC de chaque
téléphone traverse et arrive telle quelle au MikroTik, qui continue de
réclamer un code à chacun. Seule la borne elle-même est dispensée.

Le contrôleur, s'il tourne sur un portable connecté au WiFi du hotspot, a
besoin de la même dispense. Sur le bridge `LAN`, il n'en a pas besoin.

## Meshing : à couper quand tout est câblé

Le **meshing est actif par défaut**. Si une borne perd son lien filaire, elle
se rabat automatiquement sur un lien radio vers une voisine.

Sur une installation entièrement câblée, cette bonne intention se retourne :
un câble qui faiblit — connecteur desserré, port de switch capricieux — fait
basculer la borne en radio **sans rien signaler**. Elle reste « en ligne »,
mais elle partage désormais la même radio entre ses clients et son propre
backhaul. Le débit s'effondre de moitié et rien n'explique pourquoi.

Meshing coupé, le même câble défaillant fait tomber la borne franchement.
C'est visible, et on sait quoi réparer.

Donc, quand chaque borne a son câble :

1. supprimer l'uplink radio forcé sur les bornes « enfants » — chaque fiche
   doit afficher `Uplink: Wired` ;
2. supprimer le rôle de parent de mesh ;
3. désactiver **Wireless Meshing** globalement.

Ce qu'on perd : plus de reprise automatique si un câble meurt. Ce qu'on
gagne : tout le débit radio pour les clients, et des pannes lisibles.

## Meshing et itinérance sont deux choses différentes

Deux réglages aux noms voisins, souvent confondus :

- **Uplink / mesh** : comment la *borne* rejoint le réseau (câble ou radio).
- **Itinérance** : comment le *téléphone* passe d'une borne à l'autre.

Couper le meshing **n'affecte pas** les clients qui se déplacent. Un
téléphone qui change de borne garde son adresse IP et son adresse MAC — or
c'est là-dessus que repose la session hotspot, qui ne s'aperçoit donc de rien.
Aucun code à ressaisir. Et si la session tombait malgré tout, `login-by`
contient `cookie` et `mac-cookie` : la reconnexion est automatique.

Ce qui améliore vraiment l'itinérance, côté contrôleur :

- **Minimum RSSI** (par exemple −75 dBm) : force un téléphone à lâcher une
  borne trop lointaine au lieu de s'y accrocher. C'est le remède au classique
  « j'ai du signal mais ça ne marche pas ».
- **Fast Roaming (802.11r)** : plus rapide, mais certains vieux appareils le
  supportent mal. À n'activer que si vous pouvez tester.

## Vérification

1. Contrôleur : les bornes sont **en ligne**, chacune en `Uplink: Wired`.
2. `/ip hotspot ip-binding print` : une ligne `bypassed` par borne.
3. `/ip hotspot active print` : les bornes **n'y figurent pas** — elles sont
   dispensées, ce ne sont pas des clients.
4. Marcher d'une borne à l'autre pendant une vidéo : aucune coupure, aucune
   demande de code.
5. Avec un téléphone sans code, sur chaque borne : le portail s'ouvre, l'essai
   gratuit apparaît, l'achat fonctionne.

## Si une borne reste « hors ligne »

Dans l'ordre :

1. la dispense `ip-binding` est-elle bien posée sur **sa** MAC ?
2. a-t-elle une adresse dans le bon sous-réseau
   (`/ip dhcp-server lease print`) ?
3. le contrôleur est-il joignable depuis ce sous-réseau ?
