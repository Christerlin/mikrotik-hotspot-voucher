// Sponsors : commerces du quartier qui paient une place sur le portail.
//
// Tout est facultatif. Si le gestionnaire est injoignable, ou s'il n'y a
// aucun contrat en cours, la page ne change pas d'un pixel : un encart de
// publicite ne doit jamais empecher un client de se connecter.

window.afficherSponsors = function (ou, cible) {
  var base = (window.BACKEND_URL || "").replace(/\/$/, "");
  var slug = window.ROUTER_SLUG || "";
  var hote = document.getElementById(cible);
  if (!base || !slug || !hote) return;

  fetch(base + "/api/portal/" + encodeURIComponent(slug) + "/sponsors?ou=" + encodeURIComponent(ou))
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (liste) {
      if (!liste || liste.length === 0) return;
      // Un seul a la fois, tire au hasard : deux encarts se concurrencent et
      // aucun n'est vu. La rotation repartit les affichages entre contrats.
      var s = liste[Math.floor(Math.random() * liste.length)];

      var bloc = document.createElement("div");
      bloc.className = "sponsor";

      var eyebrow = document.createElement("div");
      eyebrow.className = "sponsor-tag";
      eyebrow.textContent = ou === "trial" ? "Essai offert par" : "Avec le soutien de";
      bloc.appendChild(eyebrow);

      if (s.image) {
        var img = document.createElement("img");
        img.src = s.image;              // fichier local au routeur
        img.alt = s.nom || "";
        img.className = "sponsor-logo";
        img.loading = "lazy";
        bloc.appendChild(img);
      }

      var nom = document.createElement("div");
      nom.className = "sponsor-nom";
      nom.textContent = s.nom || "";
      bloc.appendChild(nom);

      if (s.accroche) {
        var acc = document.createElement("div");
        acc.className = "sponsor-accroche";
        acc.textContent = s.accroche;
        bloc.appendChild(acc);
      }

      if (s.contact) {
        // Un numero devient un lien WhatsApp. Pour le reste, le schema est
        // verifie contre une liste fermee : pose tel quel, un "javascript:"
        // saisi dans le champ contact deviendrait un lien executable sur la
        // page du portail, pour tous les clients.
        var numero = String(s.contact).replace(/[^0-9]/g, "");
        var cible = null;
        if (/^[0-9+ .-]+$/.test(s.contact) && numero.length >= 8) {
          cible = "https://wa.me/" + numero;
        } else {
          try {
            var u = new URL(s.contact);
            if (["https:", "http:", "mailto:", "tel:"].indexOf(u.protocol) >= 0) cible = u.href;
          } catch (e) { /* pas une URL : on affichera le texte sans lien */ }
        }

        var lien = document.createElement(cible ? "a" : "div");
        lien.className = "sponsor-contact";
        if (cible) {
          lien.href = cible;
          lien.target = "_blank";
          lien.rel = "noopener";
        }
        lien.textContent = s.contact;
        // Compteur seulement s'il y a vraiment un lien : compter un clic sur
        // du texte inerte gonflerait le chiffre qu'on vend au sponsor.
        if (cible) {
          lien.addEventListener("click", function () {
            // Compteur en partance : la navigation ne doit pas l'attendre.
            var url = base + "/api/portal/" + encodeURIComponent(slug) + "/sponsors/" + s.id + "/clic";
            if (navigator.sendBeacon) navigator.sendBeacon(url);
            else fetch(url, { keepalive: true }).catch(function () {});
          });
        }
        bloc.appendChild(lien);
      }

      hote.appendChild(bloc);
      hote.style.display = "";
    })
    .catch(function () { /* pas de sponsor : la page reste telle quelle */ });
};
