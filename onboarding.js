// ============================================
// CMD. — onboarding.js
// Partagé par admin.html et admin-prestations.html (chargé AVANT admin*.js) :
//  - finalise la création de boutique après confirmation de l'email
//  - redirige un nouvel inscrit vers le bon espace (produits / prestations)
//  - bandeau "essai Premium : X jours restants"
//  - mot de passe oublié (le client n'a plus besoin de passer par toi)
// ============================================

const CMD_CONTACT_WHATSAPP = '221784218267';

// Appelé quand le compte connecté n'a aucune ligne dans "admins".
// Si l'inscription avait été mise en attente (confirmation email activée),
// on crée la boutique maintenant avec les infos gardées dans le compte.
async function gererCompteSansBoutique() {
  const erreurEl = document.getElementById('login-erreur');
  const { data: { user } } = await supabaseClient.auth.getUser();
  const enAttente = user && user.user_metadata && user.user_metadata.boutique_en_attente;

  if (enAttente) {
    if (erreurEl) erreurEl.textContent = 'Création de ta boutique…';
    const { error } = await supabaseClient.rpc('creer_boutique', {
      p_slug: enAttente.slug,
      p_nom: enAttente.nom,
      p_whatsapp: enAttente.whatsapp,
      p_type_activite: enAttente.type
    });
    if (!error) {
      await supabaseClient.auth.updateUser({ data: { boutique_en_attente: null } });
      window.location.reload();
      return;
    }
    // Ex : l'adresse a été prise entre-temps → on renvoie vers le formulaire
    window.location.href = '/inscription.html?erreur=' + encodeURIComponent(error.message);
    return;
  }

  if (erreurEl) {
    erreurEl.innerHTML = 'Aucune boutique liée à ce compte. <a href="/inscription.html">Créer ma boutique</a>';
  }
}

// Un nouvel inscrit "prestation" qui ouvre admin.html (ou l'inverse) est
// renvoyé vers le bon espace. Limité aux boutiques créées par inscription,
// pour ne rien changer aux clients existants.
function redirigerVersBonAdmin(vendeur) {
  if (!vendeur || vendeur.origine !== 'inscription') return false;
  const surEspacePrestations = window.location.pathname.includes('admin-prestations');
  const estPrestataire = vendeur.type_activite === 'prestation';
  if (estPrestataire === surEspacePrestations) return false;
  window.location.replace(estPrestataire ? '/admin-prestations.html' : '/admin.html');
  return true;
}

function afficherBandeauEssai(vendeur) {
  if (!vendeur) return;
  const JOUR = 86400000;
  const maintenant = new Date();
  const nomFormule = { standard: 'Standard', pro: 'Pro', premium: 'Premium' }[vendeur.formule] || 'Standard';
  const dateFr = (d) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  let texte = null;
  let bouton = null;
  let urgent = false;

  if (vendeur.en_pause) {
    texte = '<strong>Ta boutique est en pause</strong> : tes clients ne peuvent plus la voir ni commander. Tes produits et tes commandes sont conservés. Choisis une formule pour la réactiver.';
    bouton = 'Réactiver ma boutique';
    urgent = true;
  } else if (vendeur.essai_fin && new Date(vendeur.essai_fin) > maintenant) {
    const fin = new Date(vendeur.essai_fin);
    const jours = Math.ceil((fin - maintenant) / JOUR);
    texte = `Essai ${nomFormule} : <strong>${jours} jour${jours > 1 ? 's' : ''}</strong> restant${jours > 1 ? 's' : ''} (jusqu'au ${echapperHTML(dateFr(fin))}). Ensuite, ta boutique sera mise en pause jusqu'à ton premier paiement.`;
    bouton = `Garder ${nomFormule}`;
  } else if (vendeur.abonnement_fin) {
    const fin = new Date(vendeur.abonnement_fin);
    const jours = Math.ceil((fin - maintenant) / JOUR);
    if (jours <= 0) {
      texte = `Ton abonnement ${nomFormule} est arrivé à échéance le ${echapperHTML(dateFr(fin))}. Renouvelle-le avant que ta boutique soit mise en pause.`;
      bouton = 'Renouveler';
    } else if (jours <= 7) {
      texte = `Ton abonnement ${nomFormule} se termine dans <strong>${jours} jour${jours > 1 ? 's' : ''}</strong> (le ${echapperHTML(dateFr(fin))}).`;
      bouton = 'Renouveler';
    }
  }
  if (!texte) return;

  const bandeau = document.createElement('div');
  bandeau.className = 'cmd-bandeau-essai' + (urgent ? ' urgent' : '');
  bandeau.innerHTML = `<span>${texte}</span><a href="/abonnement.html">${bouton}</a>`;
  const conteneur = document.getElementById('vue-dashboard');
  if (!conteneur || conteneur.querySelector('.cmd-bandeau-essai')) return;
  // Sous le titre de la boutique (jamais caché par l'en-tête fixe)
  const titre = conteneur.querySelector('.admin-topbar');
  if (titre) titre.insertAdjacentElement('afterend', bandeau); else conteneur.prepend(bandeau);
}

// ---- Mot de passe oublié ----
async function motDePasseOublie() {
  const email = (document.getElementById('login-email').value || '').trim();
  const erreurEl = document.getElementById('login-erreur');
  if (!email) {
    erreurEl.textContent = "Écris ton email dans le champ ci-dessus, puis clique à nouveau sur « Mot de passe oublié ».";
    return;
  }
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname
  });
  erreurEl.style.color = error ? 'red' : 'green';
  erreurEl.textContent = error
    ? "Envoi impossible pour le moment. Réessaie dans quelques minutes."
    : "Si un compte existe avec cet email, tu vas recevoir un lien pour choisir un nouveau mot de passe.";
}

function afficherFormNouveauMotDePasse() {
  if (document.getElementById('cmd-nouveau-mdp')) return;
  const overlay = document.createElement('div');
  overlay.id = 'cmd-nouveau-mdp';
  overlay.innerHTML = `
    <div class="cmd-nouveau-mdp-carte">
      <h3>Nouveau mot de passe</h3>
      <input type="password" id="cmd-mdp-1" placeholder="Nouveau mot de passe (8 caractères min.)" autocomplete="new-password">
      <input type="password" id="cmd-mdp-2" placeholder="Confirme le mot de passe" autocomplete="new-password">
      <button type="button" id="cmd-mdp-valider">Enregistrer le mot de passe</button>
      <p id="cmd-mdp-message"></p>
    </div>`;
  document.body.appendChild(overlay);

  document.getElementById('cmd-mdp-valider').addEventListener('click', async () => {
    const m1 = document.getElementById('cmd-mdp-1').value;
    const m2 = document.getElementById('cmd-mdp-2').value;
    const msg = document.getElementById('cmd-mdp-message');
    if (m1.length < 8) { msg.textContent = 'Le mot de passe doit faire au moins 8 caractères.'; return; }
    if (m1 !== m2) { msg.textContent = 'Les deux mots de passe ne sont pas identiques.'; return; }
    const { error } = await supabaseClient.auth.updateUser({ password: m1 });
    if (error) { msg.textContent = "Le lien a expiré. Redemande un lien depuis « Mot de passe oublié »."; return; }
    overlay.remove();
    window.location.replace(window.location.pathname);
  });
}

supabaseClient.auth.onAuthStateChange((evenement) => {
  if (evenement === 'PASSWORD_RECOVERY') afficherFormNouveauMotDePasse();
});

// Liens sous le formulaire de connexion + styles des éléments ajoutés
document.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = `
    .cmd-liens-login { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; font-size: 13px; }
    .cmd-liens-login a { color: var(--couleur-accent, #e56400); text-decoration: none; font-weight: 600; cursor: pointer; }
    .cmd-bandeau-essai { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px;
      background: #fff4ea; border: 1px solid #ffd9b8; color: #6b3500; border-radius: 12px; padding: 12px 14px; margin: 16px 0; font-size: 13px; line-height: 1.4; }
    .cmd-bandeau-essai.urgent { background: #fdecea; border-color: #f5c2bd; color: #8a1c14; }
    .cmd-bandeau-essai a { background: var(--couleur-accent, #e56400); color: #fff; text-decoration: none; font-weight: 700; padding: 8px 12px; border-radius: 8px; white-space: nowrap; }
    #cmd-nouveau-mdp { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 20px; }
    .cmd-nouveau-mdp-carte { background: #fff; border-radius: 16px; padding: 22px; width: 100%; max-width: 380px; font-family: inherit; }
    .cmd-nouveau-mdp-carte h3 { margin: 0 0 14px; }
    .cmd-nouveau-mdp-carte input { width: 100%; box-sizing: border-box; padding: 12px; margin-bottom: 10px; border: 1px solid #e5e5e5; border-radius: 10px; font: inherit; }
    .cmd-nouveau-mdp-carte button { width: 100%; padding: 13px; border: none; border-radius: 10px; background: var(--couleur-accent, #e56400); color: #fff; font-weight: 700; font: inherit; cursor: pointer; }
    #cmd-mdp-message { color: #c0392b; font-size: 13px; min-height: 1em; }
  `;
  document.head.appendChild(style);

  const erreurEl = document.getElementById('login-erreur');
  if (erreurEl && !document.querySelector('.cmd-liens-login')) {
    const liens = document.createElement('div');
    liens.className = 'cmd-liens-login';
    liens.innerHTML = `
      <a onclick="motDePasseOublie()">Mot de passe oublié ?</a>
      <a href="/inscription.html">Pas encore de boutique ? Créer ma boutique</a>`;
    erreurEl.insertAdjacentElement('afterend', liens);
  }
});

// ---- Premiers pas (boutiques créées par inscription uniquement) ----
// Une carte en haut du tableau de bord qui guide le nouveau client
// jusqu'à une boutique prête à partager. Disparaît quand tout est fait.
async function afficherPremiersPas(vendeur) {
  if (!vendeur || vendeur.origine !== 'inscription') return;
  const cleMasque = 'cmd-premiers-pas-masques-' + vendeur.id;
  const clePartage = 'cmd-lien-partage-' + vendeur.id;
  try { if (localStorage.getItem(cleMasque) === '1') return; } catch (e) {}

  const estPrestataire = vendeur.type_activite === 'prestation';
  const table = estPrestataire ? 'prestations' : 'produits';
  const [{ count: nbOffres }, { count: nbFaq }] = await Promise.all([
    supabaseClient.from(table).select('id', { count: 'exact', head: true }).eq('vendeur_id', vendeur.id),
    supabaseClient.from('faq').select('id', { count: 'exact', head: true }).eq('vendeur_id', vendeur.id)
  ]);
  let lienPartage = false;
  try { lienPartage = localStorage.getItem(clePartage) === '1'; } catch (e) {}

  const lien = 'https://shop.moncmd.site/' + vendeur.slug;
  const etapes = [
    { fait: (nbOffres || 0) > 0, titre: estPrestataire ? 'Ajoute ta première prestation' : 'Ajoute ton premier produit',
      aide: 'Une photo, un nom, un prix : ta boutique prend vie.', onglet: estPrestataire ? 'prestations' : 'produits' },
    estPrestataire
      ? { fait: !!vendeur.adresse, titre: 'Indique ton adresse', aide: 'Tes clientes savent où venir.', onglet: 'reglages', champ: 'info-adresse' }
      : { fait: !!(vendeur.wave_numero || vendeur.om_numero), titre: 'Ajoute ton numéro Wave ou Orange Money', aide: 'Tes clients savent comment te payer.', onglet: 'reglages', champ: 'info-wave' },
    { fait: (nbFaq || 0) > 0, titre: 'Réponds à une première question', aide: 'Livraison, délais, horaires : la question qu’on te pose tout le temps.', onglet: 'reglages', champ: 'nouvelle-faq-question' },
    { fait: lienPartage, titre: 'Partage ton lien', aide: lien, action: 'partager' }
  ];
  const nbFaits = etapes.filter((e) => e.fait).length;
  if (nbFaits === etapes.length) return;

  const carte = document.createElement('div');
  carte.className = 'cmd-premiers-pas';
  carte.innerHTML = `
    <div class="cmd-pp-entete">
      <strong>Premiers pas : ${nbFaits}/${etapes.length}</strong>
      <button type="button" class="cmd-pp-masquer">Masquer</button>
    </div>
    <ol>${etapes.map((e, i) => `
      <li class="${e.fait ? 'fait' : ''}">
        <button type="button" data-etape="${i}" ${e.fait ? 'disabled' : ''}>
          <span class="cmd-pp-titre">${echapperHTML(e.titre)}</span>
          <span class="cmd-pp-aide">${echapperHTML(e.aide)}</span>
        </button>
      </li>`).join('')}
    </ol>`;

  carte.querySelector('.cmd-pp-masquer').addEventListener('click', () => {
    try { localStorage.setItem(cleMasque, '1'); } catch (e) {}
    carte.remove();
  });

  carte.querySelectorAll('[data-etape]').forEach((btn) => btn.addEventListener('click', async () => {
    const e = etapes[Number(btn.dataset.etape)];
    if (e.action === 'partager') {
      const texte = `Découvrez ${vendeur.nom_boutique} : ${lien}`;
      try {
        if (navigator.share) await navigator.share({ title: vendeur.nom_boutique, text: texte, url: lien });
        else { await navigator.clipboard.writeText(lien); alert('Lien copié : ' + lien); }
        localStorage.setItem(clePartage, '1');
        btn.closest('li').classList.add('fait');
      } catch (err) { /* partage annulé */ }
      return;
    }
    const onglet = document.querySelector(`.admin-tab[onclick*="'${e.onglet}'"]`);
    if (onglet) onglet.click();
    if (e.champ) setTimeout(() => {
      const champ = document.getElementById(e.champ);
      if (champ) { champ.scrollIntoView({ behavior: 'smooth', block: 'center' }); champ.focus({ preventScroll: true }); }
    }, 300);
  }));

  const conteneur = document.getElementById('onglet-dashboard') || document.getElementById('vue-dashboard');
  if (conteneur && !conteneur.querySelector('.cmd-premiers-pas')) conteneur.prepend(carte);
}

document.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = `
    .cmd-premiers-pas { background: #fff; border: 1.5px solid var(--couleur-accent, #e56400); border-radius: 16px; padding: 16px; margin-bottom: 16px; }
    .cmd-pp-entete { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 15px; }
    .cmd-pp-masquer { background: none; border: none; color: #999; font: inherit; font-size: 13px; cursor: pointer; }
    .cmd-premiers-pas ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .cmd-premiers-pas li button { width: 100%; text-align: left; background: #faf8f5; border: none; border-radius: 10px; padding: 10px 12px 10px 38px; cursor: pointer; font: inherit; position: relative; color: inherit; }
    .cmd-premiers-pas li button::before { content: ""; position: absolute; left: 12px; top: 12px; width: 16px; height: 16px; border-radius: 50%; border: 2px solid #ccc; }
    .cmd-premiers-pas li.fait button { cursor: default; opacity: .6; }
    .cmd-premiers-pas li.fait button::before { border-color: #1f7a3a; background: #1f7a3a; box-shadow: inset 0 0 0 3px #fff; }
    .cmd-premiers-pas li.fait .cmd-pp-titre { text-decoration: line-through; }
    .cmd-pp-titre { display: block; font-weight: 700; font-size: 14px; }
    .cmd-pp-aide { display: block; color: #888; font-size: 12.5px; overflow-wrap: anywhere; }
  `;
  document.head.appendChild(style);
});

// ---- Accès à la page Apparence depuis l'onglet Réglages ----
document.addEventListener('DOMContentLoaded', () => {
  const reglages = document.getElementById('onglet-reglages');
  if (!reglages || reglages.querySelector('.cmd-carte-apparence')) return;
  const carte = document.createElement('a');
  carte.className = 'cmd-carte-apparence';
  carte.href = '/apparence.html';
  carte.innerHTML = '<strong>Apparence de ma boutique</strong><span>Point de départ, couleurs, police, bannière, à propos… avec aperçu en direct.</span>';
  reglages.prepend(carte);
  const carteAbo = document.createElement('a');
  carteAbo.className = 'cmd-carte-apparence';
  carteAbo.href = '/abonnement.html';
  carteAbo.innerHTML = '<strong>Mon abonnement</strong><span>Changer de formule, payer par Wave ou Orange Money, voir mes paiements.</span>';
  carte.insertAdjacentElement('afterend', carteAbo);
  const style = document.createElement('style');
  style.textContent = `
    .cmd-carte-apparence { display: block; background: #fff; border: 1.5px solid var(--couleur-accent, #e56400); border-radius: 16px; padding: 16px 44px 16px 16px; margin-bottom: 16px; text-decoration: none; color: inherit; position: relative; }
    .cmd-carte-apparence::after { content: "›"; position: absolute; right: 18px; top: 50%; transform: translateY(-50%); font-size: 26px; color: var(--couleur-accent, #e56400); }
    .cmd-carte-apparence strong { display: block; font-size: 15px; margin-bottom: 2px; }
    .cmd-carte-apparence span { display: block; color: #888; font-size: 13px; }
  `;
  document.head.appendChild(style);
});


// ---- Statistiques de visites (tableau de bord) ----
async function afficherStatsVisites() {
  const conteneur = document.getElementById('onglet-dashboard');
  if (!conteneur || conteneur.querySelector('.cmd-visites')) return;
  const { data, error } = await supabaseClient.rpc('mes_visites');
  if (error || !data) return; // phase 6 pas encore lancée : on n'affiche rien

  const carte = document.createElement('div');
  carte.className = 'cmd-visites';
  const chiffres = `
    <div class="cmd-visites-chiffres">
      <div><strong>${Number(data.aujourdhui)}</strong><span>aujourd'hui</span></div>
      <div><strong>${Number(data.j7)}</strong><span>7 derniers jours</span></div>
      <div><strong>${Number(data.j30)}</strong><span>30 derniers jours</span></div>
    </div>`;
  let detail = '';
  if (data.par_jour) {
    const max = Math.max(1, ...data.par_jour.map((j) => Number(j.nb)));
    detail += `<div class="cmd-visites-barres" aria-label="Visites des 14 derniers jours">${data.par_jour.map((j) =>
      `<span title="${echapperHTML(j.jour)} : ${Number(j.nb)} visite(s)" style="height:${Math.max(4, Math.round(Number(j.nb) / max * 100))}%"></span>`).join('')}</div>`;
    const top = data.top_produits || [];
    detail += top.length
      ? `<p class="cmd-visites-sous">Produits les plus vus (30 jours)</p><ol class="cmd-visites-top">${top.map((t) =>
          `<li><span>${echapperHTML(t.nom)}</span><b>${Number(t.vues)}</b></li>`).join('')}</ol>`
      : '';
  } else {
    detail = '<a class="cmd-visites-pro" href="/abonnement.html">Passe en Pro pour voir l’évolution jour par jour et tes produits les plus vus</a>';
  }
  carte.innerHTML = `<p class="cmd-visites-titre">Visites de ta boutique</p>${chiffres}${detail}`;

  const premiersPas = conteneur.querySelector('.cmd-premiers-pas');
  if (premiersPas) premiersPas.insertAdjacentElement('afterend', carte); else conteneur.prepend(carte);

  if (!document.getElementById('cmd-style-visites')) {
    const style = document.createElement('style');
    style.id = 'cmd-style-visites';
    style.textContent = `
      .cmd-visites { background: #fff; border-radius: 16px; padding: 16px; margin-bottom: 16px; box-shadow: 0 2px 10px rgba(0,0,0,.05); }
      .cmd-visites-titre { font-weight: 700; font-size: 15px; margin: 0 0 12px; }
      .cmd-visites-chiffres { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
      .cmd-visites-chiffres div { background: #faf8f5; border-radius: 12px; padding: 10px; }
      .cmd-visites-chiffres strong { display: block; font-size: 22px; }
      .cmd-visites-chiffres span { font-size: 12px; color: #888; }
      .cmd-visites-barres { display: flex; align-items: flex-end; gap: 4px; height: 70px; margin-top: 14px; }
      .cmd-visites-barres span { flex: 1; background: var(--couleur-accent, #e56400); border-radius: 4px 4px 0 0; opacity: .85; }
      .cmd-visites-sous { font-size: 13px; font-weight: 700; margin: 14px 0 6px; }
      .cmd-visites-top { margin: 0; padding: 0; list-style: none; font-size: 13.5px; }
      .cmd-visites-top li { display: flex; justify-content: space-between; gap: 10px; padding: 6px 0; border-bottom: 1px solid #eee; }
      .cmd-visites-top li:last-child { border-bottom: none; }
      .cmd-visites-pro { display: block; margin-top: 12px; font-size: 13px; font-weight: 600; color: var(--couleur-accent, #e56400); text-decoration: none; }
    `;
    document.head.appendChild(style);
  }
}
