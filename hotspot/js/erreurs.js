// Traduction des erreurs du hotspot MikroTik.
//
// Le routeur renvoie des messages anglais et techniques ("invalid username or
// password"). Un client qui lit ca ne sait pas quoi faire : il doit savoir si
// son code est faux, epuise, ou deja pris, et, quand c'est le cas, ou en
// acheter un. Partage par login.html et error.html pour que les deux pages ne
// disent jamais deux choses differentes du meme incident.

window.messageErreur = function (brut) {
  var raw = String(brut || "").toLowerCase();
  if (raw.length === 0) return null;

  // Ordre important : "simultaneous session limit" contient aussi "limit".
  // Le cas "deja utilise" doit passer en premier, sinon on annoncerait a
  // tort au client que son code est epuise.
  if (raw.indexOf("session") >= 0 || raw.indexOf("already") >= 0 ||
      raw.indexOf("simultaneous") >= 0) {
    return { texte: "Ce code est déjà utilisé sur un autre appareil.", acheter: false };
  }
  if (raw.indexOf("uptime") >= 0 || raw.indexOf("traffic") >= 0 ||
      raw.indexOf("limit") >= 0) {
    return { texte: "Ce code est épuisé.", acheter: true };
  }
  if (raw.indexOf("trial") >= 0) {
    return { texte: "Votre essai gratuit est terminé pour aujourd’hui.", acheter: true };
  }
  if (raw.indexOf("invalid") >= 0 || raw.indexOf("password") >= 0) {
    return { texte: "Code incorrect. Vérifiez et réessayez.", acheter: false };
  }
  // Erreur inconnue : rester vague plutot que mentir sur la cause.
  return { texte: "Connexion impossible. Réessayez.", acheter: false };
};

// Applique la traduction : #errBox recoit le texte, #errRaw porte le message
// d'origine (cache), #errBuy n'apparait que si acheter un code est la reponse.
window.appliquerErreur = function () {
  var box = document.getElementById("errBox");
  var raw = document.getElementById("errRaw");
  if (!box || !raw) return;
  var r = window.messageErreur(raw.textContent);
  if (!r) return;
  box.textContent = r.texte;
  if (r.acheter) {
    var b = document.getElementById("errBuy");
    if (b) b.style.display = "";
  }
};
