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
  const retour = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
  if (erreurEl && retour.get('error_description')) {
    erreurEl.textContent = /expired|invalid/i.test(retour.get('error_description'))
      ? 'Ce lien a expiré ou a déjà été utilisé. Connecte-toi simplement avec ton email et ton mot de passe.'
      : 'Le lien n’a pas fonctionné. Connecte-toi avec ton email et ton mot de passe.';
    history.replaceState(null, '', window.location.pathname);
  }
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

// ---- Numéro WhatsApp d'un client, au format international ----
// Les clients tapent souvent leur numéro local (77…, 06…). On ajoute
// l'indicatif du pays du vendeur, sinon le lien WhatsApp ne marche pas.
const CMD_INDICATIFS = ['221', '223', '225', '224', '226', '227', '228', '229', '222', '220', '245', '237', '241', '242', '243', '212', '216', '33', '32', '41', '39', '34', '44', '1'];
function indicatifDuNumero(numero) {
  const d = String(numero || '').replace(/\D/g, '');
  return CMD_INDICATIFS.filter((i) => d.startsWith(i)).sort((a, b) => b.length - a.length)[0] || '';
}
function numeroWhatsAppClient(numero, numeroVendeur) {
  let d = String(numero || '').replace(/\D/g, '').replace(/^00/, '');
  if (!d || d.length >= 11) return d;
  const ind = indicatifDuNumero(numeroVendeur);
  if (!ind || (d.startsWith(ind) && d.length > ind.length + 6)) return d;
  if (['33', '32', '41', '44', '212'].includes(ind)) d = d.replace(/^0+/, '');
  return ind + d;
}

// ---- Prestataires : rendez-vous de demain + rappel WhatsApp en un clic ----
// Même principe que la relance réassort : pas besoin de l'API WhatsApp.
async function afficherRdvDemain(vendeur) {
  const conteneur = document.getElementById('onglet-dashboard');
  if (!conteneur || !vendeur || conteneur.querySelector('.cmd-demain')) return;
  const d = new Date(); d.setDate(d.getDate() + 1);
  const demain = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const { data, error } = await supabaseClient.from('rendez_vous')
    .select('id, nom_client, numero_client, heure, statut, groupe_reservation, rappel_envoye, prestations(nom)')
    .eq('vendeur_id', vendeur.id).eq('date', demain).neq('statut', 'annule').order('heure');
  if (error) return;

  const groupes = [];
  (data || []).forEach((r) => {
    const cle = r.groupe_reservation || r.id;
    let g = groupes.find((x) => x.cle === cle);
    if (!g) { g = { cle, groupe: r.groupe_reservation, ids: [], nom: r.nom_client, numero: r.numero_client, heure: r.heure, services: [], rappel: true }; groupes.push(g); }
    g.ids.push(r.id);
    g.services.push(r.prestations ? r.prestations.nom : 'Prestation');
    g.rappel = g.rappel && r.rappel_envoye;
  });

  const carte = document.createElement('div');
  carte.className = 'cmd-demain';
  const dateFr = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  carte.innerHTML = `<p class="cmd-demain-titre">Rendez-vous de demain <span>${echapperHTML(dateFr)}</span></p>` + (groupes.length
    ? groupes.map((g, i) => `
      <div class="cmd-demain-ligne">
        <div><b>${echapperHTML(String(g.heure || '').slice(0, 5).replace(':', 'h'))} · ${echapperHTML(g.nom || 'Client')}</b>
          <span>${echapperHTML(g.services.join(', '))}</span></div>
        ${g.numero ? `<button type="button" class="cmd-demain-btn${g.rappel ? ' envoye' : ''}" data-index="${i}">${g.rappel ? 'Rappel envoyé' : 'Envoyer le rappel'}</button>` : '<span class="cmd-demain-sans">Pas de numéro</span>'}
      </div>`).join('')
    : '<p class="cmd-demain-vide">Aucun rendez-vous demain.</p>');

  carte.querySelectorAll('.cmd-demain-btn').forEach((btn) => btn.addEventListener('click', async () => {
    const g = groupes[Number(btn.dataset.index)];
    const lien = g.groupe ? `\n\nVoir, ajouter à l'agenda ou annuler : ${window.location.origin}/rdv.html?r=${g.groupe}` : '';
    const texte = `Bonjour ${g.nom || ''}, petit rappel de votre rendez-vous demain à ${String(g.heure || '').slice(0, 5).replace(':', 'h')} chez ${vendeur.nom_boutique} (${g.services.join(', ')}). À demain !${lien}`;
    window.open(`https://wa.me/${numeroWhatsAppClient(g.numero, vendeur.numero_whatsapp)}?text=${encodeURIComponent(texte)}`, '_blank', 'noopener');
    await supabaseClient.from('rendez_vous').update({ rappel_envoye: true }).in('id', g.ids);
    btn.classList.add('envoye');
    btn.textContent = 'Rappel envoyé';
  }));

  const ancre = conteneur.querySelector('.cmd-visites') || conteneur.querySelector('.cmd-premiers-pas');
  if (ancre) ancre.insertAdjacentElement('afterend', carte); else conteneur.prepend(carte);

  if (!document.getElementById('cmd-style-demain')) {
    const style = document.createElement('style');
    style.id = 'cmd-style-demain';
    style.textContent = `
      .cmd-demain { background: #fff; border-radius: 16px; padding: 16px; margin-bottom: 16px; box-shadow: 0 2px 10px rgba(0,0,0,.05); }
      .cmd-demain-titre { font-weight: 700; font-size: 15px; margin: 0 0 10px; }
      .cmd-demain-titre span { font-weight: 500; color: #888; font-size: 13px; margin-left: 6px; }
      .cmd-demain-ligne { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 0; border-top: 1px solid #f0f0f0; }
      .cmd-demain-ligne b { display: block; font-size: 14px; }
      .cmd-demain-ligne span { font-size: 12.5px; color: #888; }
      .cmd-demain-btn { border: none; border-radius: 10px; padding: 9px 12px; background: #25d366; color: #fff; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; }
      .cmd-demain-btn.envoye { background: #eef7f1; color: #1f7a3a; }
      .cmd-demain-sans { font-size: 12px; color: #aaa; }
      .cmd-demain-vide { margin: 0; color: #888; font-size: 13.5px; }
    `;
    document.head.appendChild(style);
  }
}

// ---- Prestataires : réglages de réservation (onglet Réglages) ----
function afficherReglagesReservation(vendeur) {
  const reglages = document.getElementById('onglet-reglages');
  if (!reglages || !vendeur || reglages.querySelector('.cmd-reglages-rdv')) return;
  const bloc = document.createElement('div');
  bloc.className = 'cmd-reglages-rdv';
  bloc.innerHTML = `
    <strong class="cmd-rr-titre">Réservations en ligne</strong>
    <label class="cmd-rr-ligne"><span><b>Confirmer automatiquement</b><small>Le client reçoit « Confirmé » tout de suite si le créneau est libre, sans attendre ta réponse.</small></span>
      <input type="checkbox" id="cmd-rr-auto" ${vendeur.rdv_confirmation_auto ? 'checked' : ''}></label>
    <label class="cmd-rr-ligne"><span><b>Demander un acompte</b><small>Ton message et tes numéros Wave / Orange Money s'affichent au client.</small></span>
      <input type="checkbox" id="cmd-rr-acompte" ${vendeur.acompte_actif ? 'checked' : ''}></label>
    <textarea id="cmd-rr-message" maxlength="300" placeholder="Ex : Un acompte de 5 000 FCFA par Wave confirme votre créneau.">${echapperHTML(vendeur.acompte_message || '')}</textarea>
    <label class="cmd-rr-ligne"><span><b>Annulation en ligne possible jusqu'à</b><small>Avant le rendez-vous, depuis le lien « Mon rendez-vous » du client.</small></span>
      <select id="cmd-rr-delai">${[2, 6, 12, 24, 48].map((h) => `<option value="${h}" ${Number(vendeur.rdv_annulation_heures || 12) === h ? 'selected' : ''}>${h} h avant</option>`).join('')}</select></label>
    <button type="button" class="cmd-rr-btn" id="cmd-rr-enregistrer">Enregistrer</button>
    <p class="cmd-rr-msg" id="cmd-rr-retour" role="status"></p>`;
  const apres = reglages.querySelector('.cmd-carte-apparence:last-of-type');
  if (apres) apres.insertAdjacentElement('afterend', bloc); else reglages.prepend(bloc);

  document.getElementById('cmd-rr-enregistrer').addEventListener('click', async () => {
    const donnees = {
      rdv_confirmation_auto: document.getElementById('cmd-rr-auto').checked,
      acompte_actif: document.getElementById('cmd-rr-acompte').checked,
      acompte_message: document.getElementById('cmd-rr-message').value.trim().slice(0, 300) || null,
      rdv_annulation_heures: Number(document.getElementById('cmd-rr-delai').value)
    };
    const retour = document.getElementById('cmd-rr-retour');
    const { error } = await supabaseClient.from('vendeurs').update(donnees).eq('id', vendeur.id);
    retour.style.color = error ? '#b3261e' : '#1f7a3a';
    retour.textContent = error ? 'Erreur : ' + error.message : 'Enregistré.';
    if (!error) Object.assign(vendeur, donnees);
  });

  if (!document.getElementById('cmd-style-rr')) {
    const style = document.createElement('style');
    style.id = 'cmd-style-rr';
    style.textContent = `
      .cmd-reglages-rdv { background: #fff; border-radius: 16px; padding: 16px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 10px; }
      .cmd-rr-titre { font-size: 15px; }
      .cmd-rr-ligne { display: flex; justify-content: space-between; align-items: center; gap: 12px; cursor: pointer; }
      .cmd-rr-ligne b { display: block; font-size: 14px; }
      .cmd-rr-ligne small { display: block; color: #888; font-size: 12.5px; }
      .cmd-rr-ligne input[type="checkbox"] { width: 20px; height: 20px; accent-color: var(--couleur-accent, #e56400); flex-shrink: 0; }
      .cmd-rr-ligne select { padding: 8px; border-radius: 10px; border: 1px solid #ddd; font: inherit; }
      .cmd-reglages-rdv textarea { width: 100%; box-sizing: border-box; min-height: 64px; padding: 10px; border: 1px solid #ddd; border-radius: 10px; font: inherit; }
      .cmd-rr-btn { border: none; border-radius: 10px; padding: 11px; background: var(--couleur-accent, #e56400); color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
      .cmd-rr-msg { margin: 0; font-size: 13px; min-height: 1em; }
    `;
    document.head.appendChild(style);
  }
}

// ---- Boutiques : réglage simple de la livraison (onglet Réglages) ----
function afficherReglagesLivraison(vendeur) {
  const reglages = document.getElementById('onglet-reglages');
  if (!reglages || !vendeur || reglages.querySelector('.cmd-reglages-livraison')) return;
  if (!('livraison_mode' in vendeur)) return; // phase 8C pas encore lancée

  const mode = vendeur.livraison_mode || 'apres';
  const bloc = document.createElement('div');
  bloc.className = 'cmd-reglages-livraison';
  bloc.innerHTML = `
    <strong class="cmd-rl-titre">Livraison</strong>
    <p class="cmd-rl-question">Comment se passe la livraison ?</p>
    <label class="cmd-rl-choix"><input type="radio" name="cmd-rl-mode" value="apres" ${mode === 'apres' ? 'checked' : ''}>
      <span><b>Les frais sont annoncés après la commande</b><small>Par toi ou par ton livreur.</small></span></label>
    <label class="cmd-rl-choix"><input type="radio" name="cmd-rl-mode" value="gratuite" ${mode === 'gratuite' ? 'checked' : ''}>
      <span><b>La livraison est gratuite</b><small>Le client voit « Livraison offerte ».</small></span></label>
    <label class="cmd-rl-choix"><input type="radio" name="cmd-rl-mode" value="fixe" ${mode === 'fixe' ? 'checked' : ''}>
      <span><b>Un prix fixe</b><small>Ajouté au total de chaque commande.</small></span></label>
    <div class="cmd-rl-prix" ${mode === 'fixe' ? '' : 'hidden'}>
      <input type="number" id="cmd-rl-prix" min="0" step="100" value="${Number(vendeur.livraison_prix) || ''}" placeholder="Ex : 1500"> <span>FCFA</span>
    </div>
    <label class="cmd-rl-case"><input type="checkbox" id="cmd-rl-retrait" ${vendeur.retrait_possible ? 'checked' : ''}>
      <span>Le client peut venir récupérer sa commande</span></label>
    <button type="button" class="cmd-rl-btn" id="cmd-rl-enregistrer">Enregistrer</button>
    <p class="cmd-rl-msg" id="cmd-rl-retour" role="status"></p>`;

  const apres = reglages.querySelector('.cmd-carte-apparence:last-of-type');
  if (apres) apres.insertAdjacentElement('afterend', bloc); else reglages.prepend(bloc);

  bloc.querySelectorAll('input[name="cmd-rl-mode"]').forEach((r) => r.addEventListener('change', () => {
    bloc.querySelector('.cmd-rl-prix').hidden = r.value !== 'fixe' || !r.checked;
  }));

  document.getElementById('cmd-rl-enregistrer').addEventListener('click', async () => {
    const choix = bloc.querySelector('input[name="cmd-rl-mode"]:checked').value;
    const prix = Math.max(0, parseInt(document.getElementById('cmd-rl-prix').value, 10) || 0);
    const retour = document.getElementById('cmd-rl-retour');
    if (choix === 'fixe' && !prix) { retour.style.color = '#b3261e'; retour.textContent = 'Indique le prix de la livraison.'; return; }
    const donnees = { livraison_mode: choix, livraison_prix: choix === 'fixe' ? prix : 0, retrait_possible: document.getElementById('cmd-rl-retrait').checked };
    const { error } = await supabaseClient.from('vendeurs').update(donnees).eq('id', vendeur.id);
    retour.style.color = error ? '#b3261e' : '#1f7a3a';
    retour.textContent = error ? 'Erreur : ' + error.message : 'Enregistré.';
    if (!error) Object.assign(vendeur, donnees);
  });

  if (!document.getElementById('cmd-style-rl')) {
    const style = document.createElement('style');
    style.id = 'cmd-style-rl';
    style.textContent = `
      .cmd-reglages-livraison { background: #fff; border-radius: 16px; padding: 18px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 10px; }
      .cmd-rl-titre { font-size: 15px; }
      .cmd-rl-question { margin: 0; color: #666; font-size: 13.5px; }
      .cmd-rl-choix, .cmd-rl-case { display: flex !important; align-items: flex-start; gap: 10px; cursor: pointer; padding: 10px 12px; border: 1px solid #eee; border-radius: 12px; margin: 0 !important; }
      .cmd-rl-choix input, .cmd-rl-case input { width: 18px !important; height: 18px; margin: 2px 0 0 !important; flex-shrink: 0; accent-color: var(--couleur-accent, #e56400); }
      .cmd-rl-choix b { display: block; font-size: 14px; }
      .cmd-rl-choix small { display: block; color: #888; font-size: 12.5px; }
      .cmd-rl-case { border: none; padding: 4px 0; font-size: 14px; }
      .cmd-rl-prix { display: flex; align-items: center; gap: 8px; padding-left: 4px; }
      .cmd-rl-prix[hidden] { display: none; }
      .cmd-rl-prix input { width: 140px !important; padding: 10px; border: 1px solid #ddd; border-radius: 10px; font: inherit; margin: 0 !important; }
      .cmd-rl-btn { border: none; border-radius: 10px; padding: 12px; background: var(--couleur-accent, #e56400); color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
      .cmd-rl-msg { margin: 0; font-size: 13px; min-height: 1em; }
    `;
    document.head.appendChild(style);
  }
}

// ---- Devise de la boutique (onglet Réglages) ----
function afficherReglageDevise(vendeur) {
  const reglages = document.getElementById('onglet-reglages');
  if (!reglages || !vendeur || !('devise' in vendeur) || reglages.querySelector('.cmd-reglage-devise')) return;
  const DEVISES = [['FCFA', 'Franc CFA (FCFA)'], ['€', 'Euro (€)'], ['$', 'Dollar ($)'], ['$ CAD', 'Dollar canadien ($ CAD)'], ['£', 'Livre sterling (£)'], ['MAD', 'Dirham (MAD)'], ['TND', 'Dinar tunisien (TND)'], ['GNF', 'Franc guinéen (GNF)']];
  const bloc = document.createElement('div');
  bloc.className = 'cmd-reglage-devise';
  bloc.innerHTML = `
    <label for="cmd-devise"><strong>Devise de ta boutique</strong><small>Affichée à côté de tous tes prix. Aucune conversion : tes prix restent ceux que tu as saisis.</small></label>
    <div class="cmd-devise-ligne">
      <select id="cmd-devise">${DEVISES.map(([v, l]) => `<option value="${v}" ${vendeur.devise === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <button type="button" id="cmd-devise-ok">Enregistrer</button>
    </div>
    <p class="cmd-devise-msg" id="cmd-devise-msg" role="status"></p>`;
  const ancre = reglages.querySelector('.cmd-reglages-livraison') || reglages.querySelector('.cmd-reglages-rdv') || reglages.querySelector('.cmd-carte-apparence:last-of-type');
  if (ancre) ancre.insertAdjacentElement('afterend', bloc); else reglages.prepend(bloc);

  const majPlaceholder = () => {
    const prix = document.getElementById('nouveau-prix');
    if (prix) prix.placeholder = `Prix (${vendeur.devise || 'FCFA'})`;
  };
  majPlaceholder();

  document.getElementById('cmd-devise-ok').addEventListener('click', async () => {
    const devise = document.getElementById('cmd-devise').value;
    const msg = document.getElementById('cmd-devise-msg');
    const { error } = await supabaseClient.from('vendeurs').update({ devise }).eq('id', vendeur.id);
    msg.style.color = error ? '#b3261e' : '#1f7a3a';
    msg.textContent = error ? 'Erreur : ' + error.message : 'Enregistré.';
    if (!error) { vendeur.devise = devise; majPlaceholder(); }
  });

  if (!document.getElementById('cmd-style-devise')) {
    const style = document.createElement('style');
    style.id = 'cmd-style-devise';
    style.textContent = `
      .cmd-reglage-devise { background: #fff; border-radius: 16px; padding: 18px; margin-bottom: 16px; }
      .cmd-reglage-devise label strong { display: block; font-size: 15px; }
      .cmd-reglage-devise label small { display: block; color: #888; font-size: 12.5px; margin: 2px 0 10px; }
      .cmd-devise-ligne { display: flex; gap: 8px; }
      .cmd-devise-ligne select { flex: 1; padding: 11px; border: 1px solid #ddd; border-radius: 10px; font: inherit; background: #fff; }
      .cmd-devise-ligne button { border: none; border-radius: 10px; padding: 0 16px; background: var(--couleur-accent, #e56400); color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
      .cmd-devise-msg { margin: 8px 0 0; font-size: 13px; min-height: 1em; }
    `;
    document.head.appendChild(style);
  }
}

// ---- Lien de la boutique, toujours visible en haut de l'admin ----
// « Voir ma boutique », « Copier », « Partager » : plus besoin de recopier
// l'adresse dans la barre du navigateur.
function afficherLienBoutique(vendeur) {
  const conteneur = document.getElementById('vue-dashboard');
  if (!conteneur || !vendeur || !vendeur.slug || conteneur.querySelector('.cmd-lien-boutique')) return;
  const lien = `https://shop.moncmd.site/${vendeur.slug}`;
  const barre = document.createElement('div');
  barre.className = 'cmd-lien-boutique';
  barre.innerHTML = `
    <span class="cmd-lb-adresse">shop.moncmd.site/<b>${echapperHTML(vendeur.slug)}</b></span>
    <div class="cmd-lb-actions">
      <a class="cmd-lb-btn principal" href="${lien}" target="_blank" rel="noopener">Voir ma boutique</a>
      <button type="button" class="cmd-lb-btn" data-action="copier">Copier le lien</button>
      <button type="button" class="cmd-lb-btn" data-action="partager">Partager</button>
    </div>`;

  barre.querySelector('[data-action="copier"]').addEventListener('click', async (e) => {
    try { await navigator.clipboard.writeText(lien); } catch (err) { window.prompt('Copie ce lien :', lien); return; }
    e.currentTarget.textContent = 'Lien copié';
    setTimeout(() => { e.currentTarget.textContent = 'Copier le lien'; }, 1800);
  });
  barre.querySelector('[data-action="partager"]').addEventListener('click', async () => {
    const texte = `Découvrez ${vendeur.nom_boutique} et commandez en ligne : ${lien}`;
    if (navigator.share) {
      try { await navigator.share({ title: vendeur.nom_boutique, text: texte, url: lien }); } catch (err) { /* annulé */ }
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(texte)}`, '_blank', 'noopener');
    }
    try { localStorage.setItem('cmd-lien-partage-' + vendeur.id, '1'); } catch (err) {}
  });

  const titre = conteneur.querySelector('.admin-topbar');
  if (titre) titre.insertAdjacentElement('afterend', barre); else conteneur.prepend(barre);

  if (!document.getElementById('cmd-style-lien')) {
    const style = document.createElement('style');
    style.id = 'cmd-style-lien';
    style.textContent = `
      .cmd-lien-boutique { background: #fff; border: 1px solid #eee; border-radius: 16px; padding: 14px; margin: 12px 0 16px; display: flex; flex-direction: column; gap: 10px; }
      .cmd-lb-adresse { font-size: 13.5px; color: #777; overflow-wrap: anywhere; }
      .cmd-lb-adresse b { color: #111; }
      .cmd-lb-actions { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
      .cmd-lb-btn { border: 1px solid #e3e3e3; background: #fff; color: #111; border-radius: 10px; padding: 10px 6px; font: inherit; font-size: 13px; font-weight: 600; text-align: center; text-decoration: none; cursor: pointer; }
      .cmd-lb-btn.principal { background: var(--couleur-accent, #e56400); border-color: var(--couleur-accent, #e56400); color: #fff; }
      @media (max-width: 380px) { .cmd-lb-actions { grid-template-columns: 1fr 1fr; } .cmd-lb-btn.principal { grid-column: 1 / -1; } }
    `;
    document.head.appendChild(style);
  }
}

// ---- Admin sur ordinateur : menu à gauche et contenu plus large ----
// Sur téléphone rien ne change (barre d'onglets en bas, comme une appli).
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('cmd-style-bureau')) return;
  const style = document.createElement('style');
  style.id = 'cmd-style-bureau';
  style.textContent = `
    @media (min-width: 1024px) {
      .admin-tabs { top: 0 !important; bottom: 0 !important; right: auto !important; width: 230px; flex-direction: column; justify-content: flex-start;
        border-top: none !important; border-right: 1px solid #eee; padding: 100px 14px 24px !important; gap: 4px; z-index: 40 !important; }
      .admin-tab { flex: none !important; display: flex !important; align-items: center; gap: 12px; text-align: left !important;
        padding: 12px 14px !important; border-radius: 10px; font-size: 14px !important; color: #666 !important; }
      .admin-tab i { display: inline-block !important; width: 20px; margin: 0 !important; font-size: 16px !important; text-align: center; }
      .admin-tab:hover { background: #f6f6f6; }
      .admin-tab.actif { background: #f3f3f3; color: #111 !important; font-weight: 600; }
      .admin-shell { max-width: 1040px !important; margin-left: 230px !important; margin-right: auto !important;
        padding-left: 40px !important; padding-right: 40px !important; padding-bottom: 48px !important; }
      @media (min-width: 1400px) { .admin-shell { margin-left: calc(230px + (100vw - 230px - 1040px) / 2) !important; } }
    }
  `;
  document.head.appendChild(style);
});
