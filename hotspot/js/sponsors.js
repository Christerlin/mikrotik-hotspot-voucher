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
        var lien = document.createElement("a");
        lien.className = "sponsor-contact";
        // Un numero devient un lien WhatsApp ; le reste est pris tel quel.
        var numero = String(s.contact).replace(/[^0-9]/g, "");
        lien.href = /^[0-9+ .-]+$/.test(s.contact) && numero.length >= 8
          ? "https://wa.me/" + numero
          : s.contact;
        lien.target = "_blank";
        lien.rel = "noopener";
        lien.textContent = s.contact;
        lien.addEventListener("click", function () {
          // Compteur en partance : la navigation ne doit pas l'attendre.
          var u = base + "/api/portal/" + encodeURIComponent(slug) + "/sponsors/" + s.id + "/clic";
          if (navigator.sendBeacon) navigator.sendBeacon(u);
          else fetch(u, { keepalive: true }).catch(function () {});
        });
        bloc.appendChild(lien);
      }

      hote.appendChild(bloc);
      hote.style.display = "";
    })
    .catch(function () { /* pas de sponsor : la page reste telle quelle */ });
};
