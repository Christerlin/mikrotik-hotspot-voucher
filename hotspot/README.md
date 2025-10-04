# Mikrovoucher – Portail captif avec vouchers pour MikroTik

Mikrovoucher est une interface web personnalisée pour le **Hotspot MikroTik**, permettant aux utilisateurs de se connecter via des **vouchers (tickets prépayés)**.  
Le design est moderne, responsive et facile à modifier.

## ✨ Fonctionnalités
- 🎟️ Connexion via code voucher
- 📱 Design responsive (compatible mobile, tablette, PC)
- 🎨 Interface moderne et élégante
- 🌍 Langue : Français
- ⚡ Simple à déployer sur MikroTik

## 📂 Contenu
- `login.html` → Page de connexion
- `status.html` → Page d’état après connexion
- `logout.html` → Page de déconnexion
- `prix.html` → Page des prix (plans d’accès)
- `api.json` → Fichier de configuration/JSON
- `redirect.html` → Page temporaire qui redirige l’utilisateur vers la page appropriée
- `rlogin.html` → Variante de la page de connexion
- `md5.js` → Script JavaScript permettant de chiffrer le mot de passe ou le voucher en MD5 avant l’envoi au serveur MikroTik, pour plus de sécurité.
- `radvert.html` → Page réservée aux publicités ou annonces.
- `error.txt` →  Fichier texte contenant les messages d’erreur standards
etc.....
## 🚀 Installation
1. Téléchargez ou clonez le projet :
     git clone https://github.com/Christerlin/mikrotik-hotspot-voucher.git

2. Copiez les fichiers HTML/CSS/JS dans le dossier hotspot de votre MikroTik :
    /flash/hotspot/
3. Configurez vos profils Hotspot et vos vouchers dans Mikhmon ou Userman.  
    NB : il faut générer des vouchers de 8 caractères, et le nom d'utilisateur doit être le même que le mot de passe pour que cela fonctionne.

🤝 Contribution
Les contributions sont les bienvenues ! Vous pouvez proposer des améliorations ou de nouveaux designs via Pull Requests.

📜 Licence
Ce projet est sous licence MIT – libre d’utilisation et de modification.

👤 Auteur
Développé par Christerlin Joseph
📧 Contacts : christerlin.joseph@student.ueh.edu.ht , christerlin.joseph@icloud.com, christerlin16@gmail.com 
