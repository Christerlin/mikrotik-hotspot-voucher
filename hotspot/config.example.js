// =====================================================================
// Configuration locale du portail — COPIEZ ce fichier vers config.js
// puis remplissez vos valeurs. config.js n'est pas versionné (gitignore)
// pour que vos vraies valeurs ne finissent jamais sur GitHub.
//
// N'oubliez pas d'uploader config.js sur le routeur avec le reste du
// dossier hotspot/ (Files -> /flash/hotspot/).
// =====================================================================

// URL publique de votre backend de paiement (Render/Railway), SANS slash final.
// Doit être autorisée dans le walled-garden du MikroTik.
window.BACKEND_URL = "https://VOTRE-BACKEND.onrender.com";

// Numéro WhatsApp (format international sans + ni espaces, ex : 509XXXXXXXX).
// Utilisé pour le plan personnalisé et comme secours si le paiement échoue.
window.WHATSAPP_NUMBER = "509XXXXXXXX";
