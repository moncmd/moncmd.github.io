// ============================================
// CMD. — theme.js
// Personnalisation d'une boutique PAR-DESSUS son template.
// - Lit vendeurs.theme (jsonb). Vide = la boutique s'affiche exactement
//   comme avant : aucune boutique existante ne change sans action du vendeur.
// - Chaque réglage n'est appliqué que si la formule du vendeur l'autorise :
//   un vendeur qui redescend de formule perd l'affichage, pas ses réglages.
// - En mode aperçu (?apercu=1, page Apparence de l'admin), écoute les
//   réglages envoyés par l'éditeur et se met à jour en direct.
// ============================================

const CMD_THEME = (function () {
  const NIVEAUX = { standard: 0, pro: 1, premium: 2 };

  // Formule minimale de chaque réglage (même table que apparence.html)
  const ACCES = {
    annonce: 'standard',
    whatsapp: 'standard',
    infos: 'standard',
    fond: 'pro',
    police: 'pro',
    banniere: 'pro',
    apropos: 'pro',
    sections: 'pro',
    banniereImage: 'premium',
    masquerCMD: 'premium'
  };

  const FONDS = {
    blanc: '#ffffff', creme: '#faf6ef', sable: '#f3ece2',
    perle: '#f1f2f4', poudre: '#fbf0f1', menthe: '#edf5f0'
  };

  const POLICES = {
    moderne:   { titre: 'Poppins', texte: 'Poppins', url: 'Poppins:wght@400;600;700' },
    elegante:  { titre: 'Playfair Display', texte: 'Lato', url: 'Playfair+Display:wght@600;700&family=Lato:wght@400;700' },
    douce:     { titre: 'Nunito', texte: 'Nunito', url: 'Nunito:wght@400;700;800' },
    classique: { titre: 'Lora', texte: 'Source Sans 3', url: 'Lora:wght@600;700&family=Source+Sans+3:wght@400;600' },
    impact:    { titre: 'Archivo Black', texte: 'Inter', url: 'Archivo+Black&family=Inter:wght@400;600' },
    epuree:    { titre: 'DM Sans', texte: 'DM Sans', url: 'DM+Sans:wght@400;600;700' }
  };

  const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

  let dernierVendeur = null;

  const autorise = (vendeur, cle) =>
    (NIVEAUX[vendeur.formule] ?? 0) >= NIVEAUX[ACCES[cle]];

  const esc = (t) => (t === null || t === undefined) ? '' :
    String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const couleurValide = (c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);

  // Seules les images hébergées dans le Supabase de CMD sont acceptées
  const imageValide = (url) => typeof url === 'string' &&
    url.startsWith(SUPABASE_URL + '/storage/v1/object/public/');

  function typePage() {
    const nom = (window.location.pathname.split('/').pop() || 'index').replace('.html', '');
    if (nom.startsWith('panier')) return 'panier';
    if (nom.startsWith('commande')) return 'commande';
    if (nom.startsWith('index-prestations')) return 'prestations';
    return 'boutique';
  }

  function nettoyer() {
    document.querySelectorAll('[data-cmd-theme]').forEach((el) => el.remove());
    document.body.classList.remove('cmd-sans-avis', 'cmd-sans-faq', 'cmd-avec-wa');
  }

  function ajouterStyle(css) {
    const style = document.createElement('style');
    style.setAttribute('data-cmd-theme', '');
    style.textContent = css;
    document.head.appendChild(style);
  }

  function chargerPolice(police) {
    const id = 'cmd-police-' + police;
    if (document.getElementById(id)) return;
    const lien = document.createElement('link');
    lien.id = id;
    lien.rel = 'stylesheet';
    lien.href = `https://fonts.googleapis.com/css2?family=${POLICES[police].url}&display=swap`;
    document.head.appendChild(lien);
  }

  function zoneHaute() {
    // Sous l'en-tête, y compris quand il est fixe (main a déjà la marge)
    const main = document.querySelector('main');
    if (main) return { parent: main, avant: main.firstChild };
    const header = document.querySelector('header');
    return { parent: header ? header.parentNode : document.body, avant: header ? header.nextSibling : document.body.firstChild };
  }

  function horairesTexte(v) {
    const fermes = (v.jours_fermeture_recurrents || []).map((j) => JOURS[j]).filter(Boolean);
    const hOuv = (v.heure_ouverture || '').slice(0, 5).replace(':', 'h');
    const hFer = (v.heure_fermeture || '').slice(0, 5).replace(':', 'h');
    let t = hOuv && hFer ? `De ${hOuv} à ${hFer}` : '';
    if (fermes.length) t += `${t ? ', ' : ''}fermé le ${fermes.join(' et ')}`;
    return t;
  }

  function appliquer(vendeur, themeForce) {
    if (!vendeur || !document.body) return;
    dernierVendeur = vendeur;
    const t = themeForce || vendeur.theme || {};
    const page = typePage();
    nettoyer();

    let css = `
      .cmd-annonce { background: var(--couleur-accent, #e56400); color: #fff; text-align: center; font-size: 13.5px; font-weight: 600; padding: 9px 16px; line-height: 1.4; }
      .cmd-banniere { position: relative; margin: 0 0 28px; padding: 64px 22px; text-align: center; overflow: hidden; background: #f7f3ee; background: color-mix(in srgb, var(--couleur-accent, #e56400) 12%, #fff); }
      .cmd-banniere.avec-image { color: #fff; background-size: cover; background-position: center; }
      .cmd-banniere.avec-image::before { content: ""; position: absolute; inset: 0; background: rgba(0,0,0,.45); }
      .cmd-banniere > * { position: relative; max-width: 640px; margin-left: auto; margin-right: auto; }
      .cmd-banniere h2 { font-size: clamp(1.8rem, 6vw, 2.8rem); line-height: 1.1; margin: 0 0 12px; }
      .cmd-banniere p { margin: 0 auto 22px; font-size: 1.02rem; opacity: .9; }
      .cmd-banniere a { display: inline-block; background: var(--couleur-accent, #e56400); color: #fff; text-decoration: none; font-weight: 700; padding: 13px 24px; border-radius: 999px; }
      .cmd-bloc { max-width: 760px; margin: 36px auto; padding: 0 20px; }
      .cmd-bloc h2 { font-size: 1.4rem; margin: 0 0 12px; }
      .cmd-bloc p { line-height: 1.65; margin: 0; white-space: pre-line; }
      .cmd-infos { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; }
      .cmd-info { border: 1px solid rgba(0,0,0,.1); border-radius: 14px; padding: 16px; }
      .cmd-info strong { display: block; margin-bottom: 4px; font-size: .92rem; }
      .cmd-info span { font-size: .92rem; opacity: .8; }
      .cmd-wa { position: fixed; right: 18px; bottom: 18px; z-index: 900; width: 56px; height: 56px; border-radius: 50%; background: #25d366; color: #fff; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(0,0,0,.2); text-decoration: none; }
      .cmd-wa svg { width: 28px; height: 28px; }
      .cmd-pied { text-align: center; font-size: 12.5px; opacity: .75; padding: 14px 16px 22px; }
      .cmd-pied a { color: inherit; }
      body.cmd-sans-avis #avis-section, body.cmd-sans-avis #avis { display: none !important; }
      body.cmd-sans-faq #faq-section, body.cmd-sans-faq #faq { display: none !important; }
      body.mode-sombre .cmd-banniere:not(.avec-image) { background: color-mix(in srgb, var(--couleur-accent, #e56400) 18%, #111); }
      body.mode-sombre .cmd-info { border-color: rgba(255,255,255,.15); }
      .cmd-banniere:not(.avec-image) { color: #1d1b19; }
      .cmd-banniere h2 { color: inherit; }
      .cmd-banniere h2, .cmd-banniere p { text-align: center !important; }

      /* Ordinateur : une seule colonne alignée (titre, catégories, produits,
         avis, FAQ, sections) au lieu de blocs aux marges différentes. */
      @media (min-width: 1200px) {
        body.grille-large main { max-width: 1200px !important; margin-left: auto !important; margin-right: auto !important; padding-left: 40px !important; padding-right: 40px !important; box-sizing: border-box; }
        body.grille-large main > .menu, body.grille-large main > #mot-vendeur, body.grille-large main > #categories-boutons,
        body.grille-large main > #categories-produits, body.grille-large main > section, body.grille-large main > .cmd-annonce {
          max-width: none !important; margin-left: 0 !important; margin-right: 0 !important; padding-left: 0 !important; padding-right: 0 !important; }
        body.grille-large main > .cmd-bloc { max-width: none; margin-left: 0; margin-right: 0; padding: 0; }
        body.grille-large .grille-produits-premium { padding-left: 0 !important; padding-right: 0 !important; }
        body.grille-large main > .cmd-banniere { border-radius: 24px; }
      }
    `;

    // Lien « Espace vendeur » : retiré de l'en-tête (les clients n'en ont
    // pas besoin), déplacé discrètement en bas de page.
    css += `header a[href="/admin.html"], header a[href="/admin-prestations.html"], .admin-link { display: none !important; }`;

    // ---- Fond (Pro) ----
    if (autorise(vendeur, 'fond') && FONDS[t.fond]) {
      const f = FONDS[t.fond];
      css += `:root { --bg: ${f}; --beige: ${f}; }
        body:not(.mode-sombre) { background: ${f} !important; }`;
    }

    // ---- Police (Pro) ----
    if (autorise(vendeur, 'police') && POLICES[t.police]) {
      const p = POLICES[t.police];
      chargerPolice(t.police);
      css += `
        body, body *:not(i):not(svg):not(path):not(.fa):not(.fa-solid):not(.fa-brands):not(.fa-regular) { font-family: '${p.texte}', system-ui, sans-serif !important; }
        h1, h2, h3, h4, h5, h6, .logo h5, .brand h1 { font-family: '${p.titre}', '${p.texte}', serif !important; }`;
    }

    ajouterStyle(css);

    const { parent, avant } = zoneHaute();

    // ---- Bandeau d'annonce (Standard) ----
    if (autorise(vendeur, 'annonce') && t.annonce && t.annonce.actif && t.annonce.texte) {
      const bar = document.createElement('div');
      bar.className = 'cmd-annonce';
      bar.setAttribute('data-cmd-theme', '');
      bar.textContent = t.annonce.texte.slice(0, 140);
      parent.insertBefore(bar, avant);
    }

    // ---- Sections propres à la page boutique ----
    if (page === 'boutique') {
      const main = document.querySelector('main');

      if (main && autorise(vendeur, 'banniere') && t.banniere && t.banniere.actif) {
        const b = document.createElement('section');
        b.className = 'cmd-banniere';
        b.setAttribute('data-cmd-theme', '');
        const image = autorise(vendeur, 'banniereImage') && imageValide(t.banniere.image) ? t.banniere.image : null;
        if (image) { b.classList.add('avec-image'); b.style.backgroundImage = `url("${image}")`; }
        b.innerHTML = `
          <h2>${esc((t.banniere.titre || vendeur.nom_boutique).slice(0, 80))}</h2>
          ${t.banniere.sousTitre ? `<p>${esc(t.banniere.sousTitre.slice(0, 200))}</p>` : ''}
          <a href="#categories-boutons">${esc((t.banniere.bouton || 'Voir le catalogue').slice(0, 30))}</a>`;
        const repere = main.querySelector('.menu') || main.querySelector('#categories-boutons');
        main.insertBefore(b, repere || main.firstChild);
      }
    }

    // ---- À propos et infos pratiques (boutiques et pages prestataires) ----
    if (page === 'boutique' || page === 'prestations') {
      const main = document.querySelector('main');
      const fin = document.getElementById('faq-section') || document.getElementById('avis-section');
      const footer = document.querySelector('footer');
      let ancre = fin;
      const insererApres = (el) => {
        if (page === 'boutique' && ancre && ancre.parentNode) { ancre.parentNode.insertBefore(el, ancre.nextSibling); ancre = el; }
        else if (page === 'boutique' && main) main.appendChild(el);
        else if (footer) footer.parentNode.insertBefore(el, footer);
        else document.body.appendChild(el);
      };

      if (autorise(vendeur, 'apropos') && t.apropos && t.apropos.actif && t.apropos.texte) {
        const bloc = document.createElement('section');
        bloc.className = 'cmd-bloc';
        bloc.setAttribute('data-cmd-theme', '');
        bloc.innerHTML = `<h2>${esc((t.apropos.titre || 'À propos').slice(0, 60))}</h2><p>${esc(t.apropos.texte.slice(0, 1200))}</p>`;
        insererApres(bloc);
      }

      if (autorise(vendeur, 'infos') && t.infos && t.infos.actif) {
        const cartes = [];
        const h = horairesTexte(vendeur);
        if (h) cartes.push(['Horaires', h]);
        if (vendeur.adresse) cartes.push(['Adresse', vendeur.adresse]);
        if (t.infos.livraison) cartes.push(['Livraison', t.infos.livraison]);
        const paiements = [vendeur.accepte_wave !== false && 'Wave', vendeur.accepte_om !== false && 'Orange Money', 'Espèces'].filter(Boolean);
        cartes.push(['Paiement', paiements.join(', ')]);
        const bloc = document.createElement('section');
        bloc.className = 'cmd-bloc';
        bloc.setAttribute('data-cmd-theme', '');
        bloc.innerHTML = `<h2>Infos pratiques</h2><div class="cmd-infos">${cartes.map(([k, v]) =>
          `<div class="cmd-info"><strong>${esc(k)}</strong><span>${esc(String(v).slice(0, 160))}</span></div>`).join('')}</div>`;
        insererApres(bloc);
      }

    }

    // ---- Sections masquées (Pro) ----
    if (autorise(vendeur, 'sections') && t.sections) {
      if (t.sections.avis === false) document.body.classList.add('cmd-sans-avis');
      if (t.sections.faq === false) document.body.classList.add('cmd-sans-faq');
    }

    // ---- Bouton WhatsApp flottant (Standard) — pas sur la page commande ----
    if (autorise(vendeur, 'whatsapp') && t.whatsapp && page !== 'commande' && vendeur.numero_whatsapp) {
      const wa = document.createElement('a');
      wa.className = 'cmd-wa';
      wa.setAttribute('data-cmd-theme', '');
      wa.href = `https://wa.me/${encodeURIComponent(vendeur.numero_whatsapp)}?text=${encodeURIComponent('Bonjour, j\'ai une question sur votre boutique.')}`;
      wa.target = '_blank';
      wa.rel = 'noopener';
      wa.setAttribute('aria-label', 'Écrire sur WhatsApp');
      wa.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-1 1.1-.2.2-.4.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.4-.5c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3zM12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 4.9L2 22l5.3-1.4c1.4.8 3 1.2 4.7 1.2 5.5 0 10-4.5 10-10S17.5 2 12 2z"/></svg>';
      document.body.appendChild(wa);
    }

    // ---- Pied de page : mention CMD (retirable en Premium) + espace vendeur ----
    // Certains templates ont déjà « Propulsé par CMD » / « By HV » : on ne
    // la double pas, et en Premium on peut la masquer.
    const masquerCMD = autorise(vendeur, 'masquerCMD') && t.masquerCMD === true;
    const credits = Array.from(document.querySelectorAll('footer span, footer p'))
      .filter((el) => /Propulsé par CMD|By HV/i.test(el.textContent) && !el.closest('[data-cmd-theme]'));
    credits.forEach((el) => {
      el.setAttribute('data-cmd-credit', '');
      el.style.display = masquerCMD ? 'none' : '';
    });
    const pied = document.createElement('div');
    pied.className = 'cmd-pied';
    pied.setAttribute('data-cmd-theme', '');
    const adminUrl = vendeur.type_activite === 'prestation' ? '/admin-prestations.html' : '/admin.html';
    const mention = (!masquerCMD && !credits.length)
      ? 'Boutique créée avec <a href="https://www.moncmd.site" target="_blank" rel="noopener">CMD</a> · ' : '';
    pied.innerHTML = `${mention}<a href="${adminUrl}">Espace vendeur</a>`;
    const footer = document.querySelector('footer');
    if (footer) footer.appendChild(pied); else document.body.appendChild(pied);
  }

  // Aperçu en direct depuis la page Apparence (même domaine uniquement)
  if (new URLSearchParams(window.location.search).get('apercu') === '1') {
    window.addEventListener('message', (e) => {
      if (e.origin !== window.location.origin || !e.data || e.data.type !== 'cmd-apercu-theme') return;
      if (!dernierVendeur) return;
      const v = Object.assign({}, dernierVendeur, {
        formule: e.data.formule || dernierVendeur.formule,
        couleur_accent: e.data.accent || dernierVendeur.couleur_accent
      });
      if (couleurValide(v.couleur_accent)) document.documentElement.style.setProperty('--couleur-accent', v.couleur_accent);
      appliquer(v, e.data.theme || {});
      // Disposition des produits : on reconstruit la liste seulement si elle change
      const disposition = (e.data.theme || {}).disposition || 'carrousel';
      if (typeof genererCards === 'function' && typeof vendeurActuel !== 'undefined' && vendeurActuel
          && disposition !== ((vendeurActuel.theme || {}).disposition || 'carrousel')) {
        vendeurActuel.theme = Object.assign({}, vendeurActuel.theme || {}, { disposition });
        genererCards();
      }
    });
  }

  return { appliquer, autorise, ACCES, FONDS, POLICES, NIVEAUX };
})();

// ---- Boutique en pause (fin d'essai / abonnement non renouvelé) ----
// Renvoie true si la page a été remplacée par le message d'indisponibilité.
function afficherSiBoutiqueEnPause(vendeur) {
  const apercu = new URLSearchParams(window.location.search).get('apercu') === '1';
  if (!vendeur || !vendeur.en_pause || apercu) return false;
  const nom = String(vendeur.nom_boutique || 'Cette boutique').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  document.title = vendeur.nom_boutique || 'Boutique indisponible';
  document.body.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,sans-serif;text-align:center;background:#f6f4f1;color:#1d1b19">
      <div style="max-width:420px">
        <h1 style="font-size:24px;margin:0 0 10px">${nom}</h1>
        <p style="color:#6f6a64;margin:0">Cette boutique est momentanément indisponible. Revenez bientôt.</p>
      </div>
    </div>`;
  return true;
}

// ---- Compteur de visites (aucune donnée personnelle, 1 fois par session) ----
function enregistrerVisite(vendeur) {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('apercu') === '1' || !vendeur || !vendeur.id) return;
    const nom = (window.location.pathname.split('/').pop() || 'index').replace('.html', '');
    let type = null, produitId = null;
    if (nom.startsWith('panier') && params.get('id')) { type = 'produit'; produitId = params.get('id'); }
    else if (!nom.startsWith('panier') && !nom.startsWith('commande')) type = 'boutique';
    if (!type) return;
    const cle = `cmd-vu-${vendeur.id}-${type}-${produitId || ''}`;
    if (sessionStorage.getItem(cle)) return;
    sessionStorage.setItem(cle, '1');
    supabaseClient.rpc('enregistrer_visite', { p_vendeur_id: vendeur.id, p_type: type, p_produit_id: produitId });
  } catch (e) { /* jamais bloquant */ }
}

function appliquerTheme(vendeur) {
  enregistrerVisite(vendeur);
  try { CMD_THEME.appliquer(vendeur); }
  catch (err) { console.error('Thème non appliqué :', err); } // ne bloque jamais la boutique
  if (new URLSearchParams(window.location.search).get('apercu') === '1' && window.parent !== window) {
    window.parent.postMessage({ type: 'cmd-apercu-pret' }, window.location.origin);
  }
}
