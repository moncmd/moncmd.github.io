// ============================================
// CMD. — script.js (version Supabase multi-vendeur)
// ============================================

let produits = [];
let produitTendanceId = null; // produit le plus commandé cette semaine, mis en avant automatiquement
let vendeurActuel = null;
let noteSelectionnee = 0;

// ============================================
// Redirection dynamique vers le bon template
// ============================================
function getTemplateActif() {
  return (vendeurActuel && vendeurActuel.template) ? vendeurActuel.template.toLowerCase() : '';
}

const TEMPLATES_CONNUS = ['urbain', 'marche', 'doux', 'restaurant', 'import', 'hybride'];

// Déduit le type de page (index/panier/commande) et la template actuelle
// à partir du nom du fichier ouvert (ex: "panier-doux" -> page:"panier", template:"doux")
// Analyse l'URL actuelle pour en extraire la "page" (index/panier/commande...) et
// le "template" éventuel (urbain/marche/doux...), à partir du NOM DE FICHIER réel.
// Une URL "chemin propre" (ex: /victoryfood) n'a pas de nom de fichier — c'est
// toujours la page d'accueil dans ce cas, quel que soit le slug affiché.
function analyserPageActuelle() {
  const dernierSegment = window.location.pathname.split('/').pop() || '';

  if (!dernierSegment.endsWith('.html')) {
    // Racine du domaine ("/") ou URL "chemin propre" ("/victoryfood") → toujours l'accueil
    return { page: 'index', template: '' };
  }

  const nomFichier = dernierSegment.replace('.html', '');
  const segments = nomFichier.split('-');
  const dernierMorceau = segments[segments.length - 1];

  if (TEMPLATES_CONNUS.includes(dernierMorceau)) {
    return { page: segments.slice(0, -1).join('-'), template: dernierMorceau };
  }
  return { page: nomFichier, template: '' };
}

// Vérifie qu'on est bien sur le fichier correspondant à la template réelle
// du vendeur (vendeurActuel.template) ; sinon, se redirige automatiquement
// vers le bon fichier, en conservant tous les paramètres d'URL (?v=, &id=...)
function verifierTemplateCorrect() {
  const { page, template: templateActuel } = analyserPageActuelle();
  const templateAttendu = getTemplateActif();

  if (templateActuel === templateAttendu) return false;

  const nomFichier = templateAttendu ? `${page}-${templateAttendu}` : page;

  // On force le slug dans les paramètres de l'URL de redirection, même si l'URL
  // actuelle est en format "chemin propre" (ex: /victoryfood, sans ?v=).
  // Sinon, window.location.search est vide et la page suivante retombe sur 'demo'.
  const params = new URLSearchParams(window.location.search);
  params.set('v', getVendeurSlug());
  window.location.replace(`${nomFichier}.html?${params.toString()}`);
  return true;
}


// ============================================
// Mode sombre (toggle clair/sombre, préférence mémorisée)
// ============================================
function initModeSombre() {
  const preference = localStorage.getItem('cmd-mode-sombre');
  if (preference === 'actif') {
    document.body.classList.add('mode-sombre');
  }
  mettreAJourIconeModeSombre();
}

function toggleModeSombre() {
  document.body.classList.toggle('mode-sombre');
  const actif = document.body.classList.contains('mode-sombre');
  localStorage.setItem('cmd-mode-sombre', actif ? 'actif' : 'inactif');
  mettreAJourIconeModeSombre();
}

function mettreAJourIconeModeSombre() {
  const bouton = document.getElementById('btn-toggle-mode-sombre');
  if (!bouton) return;
  const actif = document.body.classList.contains('mode-sombre');
  bouton.innerHTML = actif ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
}

document.addEventListener('DOMContentLoaded', initModeSombre);

// Si on arrive ici via 404.html (paramètre "pretty=1"), la page a été chargée
// via une vraie redirection vers le fichier réel (index-urbain.html?v=slug...).
// Une fois que tout a bien chargé, on remet l'URL "chemin propre" (/slug)
// dans la barre d'adresse, sans recharger la page.
function restaurerURLPropre(slug) {
  const params = new URLSearchParams(window.location.search);
  if (params.get('pretty') === '1') {
    history.replaceState(null, '', `/${slug}`);
  }
}

async function chargerBoutique() {
  const debutChargement = Date.now();
  const slug = getVendeurSlug();

  const { data: vendeur, error: errVendeur } = await supabaseClient
    .from('vendeurs')
    .select('*')
    .eq('slug', slug)
    .eq('actif', true)
    .single();

  if (errVendeur || !vendeur) {
    document.querySelector('main').innerHTML = `
      <p style="text-align:center; padding: 60px 20px;">
        Cette boutique n'est pas disponible pour le moment.
      </p>`;
    cacherEcranChargement(debutChargement);
    return;
  }

  vendeurActuel = vendeur;

  // Si ce fichier ne correspond pas à la template réelle du vendeur,
  // on redirige immédiatement vers le bon fichier et on arrête tout ici.
  if (verifierTemplateCorrect()) return;

  restaurerURLPropre(slug);

  appliquerIdentiteVendeur(vendeur);
  afficherMotVendeur(vendeur);
  activerFonctionnalitesPremiumMarche(vendeur);
  activerRechercheProduit(vendeur);

  const { data: produitsData, error: errProduits } = await supabaseClient
    .from('produits')
    .select('*')
    .eq('vendeur_id', vendeur.id)
    .eq('actif', true)
    .order('ordre', { ascending: true });

  if (errProduits) {
    console.error('Erreur chargement produits :', errProduits);
    cacherEcranChargement(debutChargement);
    return;
  }

  produits = produitsData || [];

  // Produit le plus commandé (confirmé) sur les 7 derniers jours — calculé
  // côté base via une fonction sécurisée (aucune donnée client exposée au public).
  const { data: idTendance } = await supabaseClient.rpc('produit_tendance', { p_vendeur_id: vendeur.id });
  produitTendanceId = idTendance || null;

  genererCards();
  mettreAJourCompteur();
  remplirPaiement();
  chargerFAQ();
  chargerAvis();

  // Ces deux fonctions (définies dans panier.js / commande.js selon la page)
  // doivent être terminées AVANT de cacher l'écran de chargement, sinon on
  // voit passer une fraction de seconde l'état "par défaut" (champ commentaire,
  // couleur non appliquée...) avant le bon rendu final.
  if (typeof afficherProduitDetail === 'function') await afficherProduitDetail();
  if (typeof afficherResume === 'function') afficherResume();

  cacherEcranChargement(debutChargement);
}

// Fait disparaître l'écran de chargement en fondu
function cacherEcranChargement(debutChargement) {
  const ecran = document.getElementById('ecran-chargement');
  if (!ecran) return;

  const dureeMin = 900;
  const ecoule = Date.now() - (debutChargement || Date.now());
  const attente = Math.max(0, dureeMin - ecoule);

  setTimeout(() => {
    ecran.style.opacity = '0';
    setTimeout(() => ecran.remove(), 400);
  }, attente);
}

function appliquerIdentiteVendeur(vendeur) {
  document.querySelectorAll('.logo h5').forEach(el => el.textContent = vendeur.nom_boutique);
  document.documentElement.style.setProperty('--couleur-accent', vendeur.couleur_accent || '#e56400');

  // Logo propre du vendeur (blanc-marque) — si non renseigné, on garde le logo CMD par défaut déjà présent dans le HTML.
  if (vendeur.logo_url) {
    document.querySelectorAll('.logo-img').forEach(el => el.src = vendeur.logo_url);
  }

  const lienWhatsapp = document.querySelector('a[href*="wa.me"]');
  if (lienWhatsapp) {
    lienWhatsapp.href = `https://wa.me/${vendeur.numero_whatsapp}?text=Bonjour, je voudrais passer une commande !`;
  }

  afficherReseauxSociaux(vendeur);
}

// Affiche le petit message d'accueil du vendeur en haut de la page,
// seulement si un conteneur #mot-vendeur existe dans le template, que le
// vendeur a renseigné ce champ, ET qu'il est toujours Premium (le champ
// admin est verrouillé pour les autres formules, mais on protège aussi
// l'affichage — au cas où un vendeur premium redescende en standard/pro
// après avoir rempli son mot d'accueil, il ne doit plus s'afficher).
function afficherMotVendeur(vendeur) {
  const el = document.getElementById('mot-vendeur');
  if (!el) return;
  if (!vendeur.message_accueil || vendeur.formule !== 'premium') { el.style.display = 'none'; return; }
  el.textContent = vendeur.message_accueil;
  el.style.display = 'block';
}

// Affiche les icônes réseaux sociaux dans le footer, seulement pour ceux
// que le vendeur a renseignés. Le conteneur #reseaux-sociaux doit exister
// dans le footer de chaque template (voir footer d'index.html).
function afficherReseauxSociaux(vendeur) {
  const conteneur = document.getElementById('reseaux-sociaux');
  if (!conteneur) return;

  const reseaux = [
    { url: vendeur.instagram, icone: 'fa-instagram' },
    { url: vendeur.tiktok, icone: 'fa-tiktok' },
    { url: vendeur.facebook, icone: 'fa-facebook' }
  ].filter(r => r.url);

  if (!reseaux.length) { conteneur.style.display = 'none'; return; }

  conteneur.innerHTML = reseaux.map(r =>
    `<a href="${r.url}" target="_blank" rel="noopener"><i class="fa-brands ${r.icone}"></i></a>`
  ).join('');
}

function remplirPaiement() {
  if (!vendeurActuel) return;
  const waveEl = document.getElementById('wave-numero');
  const omEl = document.getElementById('om-numero');
  if (waveEl) waveEl.textContent = vendeurActuel.wave_numero || '—';
  if (omEl) omEl.textContent = vendeurActuel.om_numero || '—';
}

// ============================================
// FAQ (par vendeur, minimaliste, accordéon)
// ============================================
async function chargerFAQ() {
  if (!vendeurActuel) return;

  const { data: faqs } = await supabaseClient
    .from('faq')
    .select('*')
    .eq('vendeur_id', vendeurActuel.id)
    .order('ordre', { ascending: true });

  const conteneur = document.getElementById('faq-liste');
  if (!conteneur) return;

  const section = document.getElementById('faq-section');

  if (!faqs || faqs.length === 0) {
    if (section) section.style.display = 'none';
    return;
  }

  conteneur.innerHTML = faqs.map((f, i) => `
    <div class="faq-item" id="faq-item-${i}">
      <div class="faq-question" onclick="toggleFAQ(${i})">
        <span>${f.question}</span>
        <span class="icone">+</span>
      </div>
      <div class="faq-reponse">${f.reponse}</div>
    </div>
  `).join('');
}

function toggleFAQ(i) {
  document.getElementById(`faq-item-${i}`).classList.toggle('ouvert');
}

// ============================================
// Avis clients
// ============================================
function toggleFormulaireAvis() {
  const form = document.getElementById('formulaire-avis');
  if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

document.addEventListener('click', (e) => {
  if (e.target.closest('#etoiles-input') && e.target.dataset.valeur) {
    noteSelectionnee = parseInt(e.target.dataset.valeur);
    document.querySelectorAll('#etoiles-input span').forEach(etoile => {
      etoile.classList.toggle('active', parseInt(etoile.dataset.valeur) <= noteSelectionnee);
    });
  }
});

async function envoyerAvis() {
  const nom = document.getElementById('avis-nom').value.trim();
  const numero = document.getElementById('avis-numero').value.trim();
  const commentaire = document.getElementById('avis-commentaire').value.trim();
  const messageEl = document.getElementById('avis-message');

  if (!nom || !numero || !noteSelectionnee) {
    messageEl.textContent = "Nom, numéro et note sont obligatoires.";
    messageEl.style.color = 'red';
    return;
  }

  if (!vendeurActuel) return;

  const { error } = await supabaseClient.from('avis').insert({
    vendeur_id: vendeurActuel.id,
    nom_client: nom,
    numero_client: numero,
    note: noteSelectionnee,
    commentaire: commentaire
  });

  if (error) {
    messageEl.textContent = "Erreur lors de l'envoi.";
    messageEl.style.color = 'red';
    return;
  }

  messageEl.textContent = "Merci ! Votre avis sera publié après vérification.";
  messageEl.style.color = 'green';

  document.getElementById('avis-nom').value = '';
  document.getElementById('avis-numero').value = '';
  document.getElementById('avis-commentaire').value = '';
  noteSelectionnee = 0;
  document.querySelectorAll('#etoiles-input span').forEach(e => e.classList.remove('active'));

  setTimeout(() => {
    toggleFormulaireAvis();
    messageEl.textContent = '';
  }, 2500);
}

async function chargerAvis() {
  if (!vendeurActuel) return;

  const conteneur = document.getElementById('avis-liste');
  if (!conteneur) return;

  const limite = (vendeurActuel.formule === 'standard') ? 10 : 30;

  const { data: avis, error } = await supabaseClient
    .from('avis')
    .select('*')
    .eq('vendeur_id', vendeurActuel.id)
    .eq('statut', 'approuve')
    .order('date_creation', { ascending: false })
    .limit(limite);

  if (error || !avis || avis.length === 0) {
    conteneur.innerHTML = '<p style="color:#999; font-size:14px; padding:8px 0;">Aucun avis pour le moment. Soyez le premier !</p>';
    return;
  }

  const html = avis.map(a => `
    <div class="avis-item">
      <div class="avis-haut">
        <span class="avis-nom">${a.nom_client}</span>
        <span class="avis-etoiles">${'★'.repeat(a.note)}${'☆'.repeat(5 - a.note)}</span>
      </div>
      <p class="avis-texte">${a.commentaire || ''}</p>
    </div>
  `).join('');

  conteneur.innerHTML = html + html;
}

// Fonctionnalités additionnelles réservées au template "marché" + formule Premium :
// carte de localisation de la boutique, et barre de recherche produit.
function activerFonctionnalitesPremiumMarche(vendeur) {
  if (!(vendeur.formule === 'premium' && getTemplateActif() === 'marche')) return;

  const categoriesBoutons = document.getElementById('categories-boutons');
  if (!categoriesBoutons) return;

  // Carte de localisation, uniquement si le vendeur a renseigné une adresse
  if (vendeur.adresse) {
    const carteMap = document.createElement('div');
    carteMap.style.cssText = 'padding:0 20px 18px;';
    carteMap.innerHTML = `
      <iframe
        src="https://www.google.com/maps?q=${encodeURIComponent(vendeur.adresse)}&output=embed"
        style="width:100%; height:180px; border:0; border-radius:14px;"
        loading="lazy"
        referrerpolicy="no-referrer-when-downgrade">
      </iframe>
      <p style="font-size:12px; color:#999; margin-top:6px;">📍 ${vendeur.adresse}</p>
    `;
    categoriesBoutons.insertAdjacentElement('beforebegin', carteMap);
  }
}

// Barre de recherche produit — indépendante du bundle Premium/Marché ci-dessus.
// Activable vendeur par vendeur via vendeurs.recherche_debloquee (même principe
// que logo_debloque), en plus des vendeurs Premium+Marché qui l'ont toujours eue.
function activerRechercheProduit(vendeur) {
  const debloqueeManuellement = vendeur.recherche_debloquee === true;
  const debloqueeParFormule = vendeur.formule === 'premium' && getTemplateActif() === 'marche';
  if (!(debloqueeManuellement || debloqueeParFormule)) return;

  const categoriesBoutons = document.getElementById('categories-boutons');
  if (!categoriesBoutons) return;
  if (document.getElementById('recherche-produit-client')) return; // déjà ajoutée

  const barreRecherche = document.createElement('div');
  barreRecherche.style.cssText = 'padding:0 20px 14px;';
  barreRecherche.innerHTML = `
    <input type="text" id="recherche-produit-client" placeholder="🔍 Rechercher un produit..."
      oninput="filtrerProduitsClient()"
      style="width:100%; padding:11px 14px; border-radius:24px; border:1px solid #ddd; font-family:inherit; font-size:14px; box-sizing:border-box;">
  `;
  categoriesBoutons.insertAdjacentElement('beforebegin', barreRecherche);
}

// Filtre local (sans re-requêter Supabase) sur ce qui est déjà chargé.
// Recherche insensible aux accents/casse, sur tout le catalogue à la fois
// (traverse toutes les catégories, comme côté admin).
function filtrerProduitsClient() {
  const requete = document.getElementById('recherche-produit-client').value
    .trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const boutonsContainer = document.getElementById('categories-boutons');
  const produitsContainer = document.getElementById('categories-produits');
  if (!produitsContainer) return;

  if (!requete) {
    if (boutonsContainer) boutonsContainer.style.display = '';
    genererCards();
    return;
  }

  if (boutonsContainer) boutonsContainer.style.display = 'none';

  const resultats = produits.filter(p =>
    p.nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(requete)
  );

  produitsContainer.innerHTML = resultats.length
    ? `<div class="grille-produits-premium">${resultats.map(construireCarteProduitClient).join('')}</div>`
    : '<p style="text-align:center; padding:40px 20px; color:#999;">Aucun produit trouvé.</p>';
}

// Construit le HTML d'une carte produit seule (sans le conteneur splide__slide/div qui l'entoure)
function construireCarteProduitClient(produit) {
  const stockBas = produit.quantite_stock !== null && produit.quantite_stock !== undefined
    && produit.quantite_stock > 0 && produit.quantite_stock <= 3;
  const rupture = produit.quantite_stock === 0;

  const blocAction = rupture ? `
        <a href="javascript:void(0)" onclick="allerVers('panier', '${produit.id}')">Voir</a>
        <div class="attente-stock">
            <input type="text" class="input-attente-stock" id="attente-numero-${produit.id}" placeholder="Votre numéro">
            <button class="btn-attente-stock" onclick="demanderNotifStock('${produit.id}')">Me prévenir</button>
            <p class="attente-message" id="attente-message-${produit.id}"></p>
        </div>
      ` : `
        <a href="javascript:void(0)" onclick="allerVers('panier', '${produit.id}')">Voir</a>
        <a href="javascript:void(0)" onclick="ajouterAuPanier('${produit.id}')">Ajouter au panier</a>
      `;

  return `
    <div class="product-card">
        ${produit.favori
          ? '<span class="badge-favori">★ Populaire</span>'
          : (produit.id === produitTendanceId ? '<span class="badge-favori">🔥 Tendance</span>' : '')}
        ${rupture ? '<span class="badge-rupture">Rupture de stock</span>' : (stockBas ? `<span class="badge-stock-bas">Il en reste ${produit.quantite_stock} !</span>` : '')}
        ${produit.video_url
          ? `<video src="${produit.video_url}" muted loop playsinline autoplay onmouseover="this.play()" onclick="this.paused ? this.play() : this.pause()"></video>`
          : `<img src="${produit.image_url}" alt="${produit.nom}">`}
        <p class="produit">${produit.nom}</p>
        <p class="prix">${produit.prix} FCFA</p>
        ${blocAction}
    </div>
  `;
}

// Grille de produits (Premium) : injectée une seule fois, générique à tous les
// templates — remplace le slide horizontal par une vraie grille visible d'un
// coup, sans avoir besoin de glisser sur le côté.
function injecterStyleGrillePremium() {
  if (document.getElementById('style-grille-premium')) return;
  const style = document.createElement('style');
  style.id = 'style-grille-premium';
  style.textContent = `
    /* Sur desktop, le marché premium utilise toute la largeur disponible pour
       la grille produits, au lieu de rester coincé dans la colonne mobile-first
       de 560px — le titre/intro reste dans une largeur de lecture agréable. */
    body.premium-marche-large main { max-width: 1200px; }
    body.premium-marche-large .menu,
    body.premium-marche-large #mot-vendeur {
      max-width: 560px; margin-left: auto; margin-right: auto;
    }

    .grille-produits-premium { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; padding: 0 20px; }
    @media (min-width: 600px) { .grille-produits-premium { grid-template-columns: repeat(3, 1fr); } }
    @media (min-width: 900px) { .grille-produits-premium { grid-template-columns: repeat(4, 1fr); padding: 0 40px; } }
    @media (min-width: 1200px) { .grille-produits-premium { grid-template-columns: repeat(5, 1fr); } }

    /* Apparition douce des cartes au scroll */
    .grille-produits-premium .product-card,
    .selection-moment-premium .product-card {
      opacity: 0;
      transform: translateY(18px);
      transition: opacity 0.5s ease, transform 0.5s ease;
    }
    .grille-produits-premium .product-card.animer-apparition,
    .selection-moment-premium .product-card.animer-apparition {
      opacity: 1;
      transform: translateY(0);
    }

    /* Feedback tactile au clic/survol des cartes et boutons */
    .grille-produits-premium .product-card,
    .selection-moment-premium .product-card {
      transition: opacity 0.5s ease, transform 0.5s ease, box-shadow 0.2s ease;
    }
    .grille-produits-premium .product-card:hover,
    .selection-moment-premium .product-card:hover {
      box-shadow: 0 8px 20px rgba(0,0,0,0.08);
    }
    .grille-produits-premium .product-card:active,
    .selection-moment-premium .product-card:active {
      transform: scale(0.97) !important;
    }
    .grille-produits-premium .product-card a,
    .selection-moment-premium .product-card a {
      transition: transform 0.15s ease, opacity 0.15s ease;
    }
    .grille-produits-premium .product-card a:active,
    .selection-moment-premium .product-card a:active {
      transform: scale(0.95);
    }

    /* Changement de catégorie en fondu plutôt qu'instantané */
    .categorie-section { transition: opacity 0.25s ease; }
    .categorie-section.fondu-sortant { opacity: 0; }
  `;
  document.head.appendChild(style);
}

// Observe les cartes produit et les révèle en douceur dès qu'elles entrent
// dans l'écran, avec un léger décalage entre chaque carte pour un effet
// "cascade" plutôt qu'un bloc qui apparaît d'un coup.
function activerAnimationsApparition(conteneur) {
  const cartes = conteneur.querySelectorAll('.product-card');
  const observateur = new IntersectionObserver((entrees) => {
    entrees.forEach((entree, i) => {
      if (entree.isIntersecting) {
        setTimeout(() => entree.target.classList.add('animer-apparition'), i * 40);
        observateur.unobserve(entree.target);
      }
    });
  }, { threshold: 0.1 });
  cartes.forEach(carte => observateur.observe(carte));
}

function genererCards() {
  const boutonsContainer = document.getElementById('categories-boutons');
  const produitsContainer = document.getElementById('categories-produits');
  if (!boutonsContainer || !produitsContainer) return;

  boutonsContainer.innerHTML = '';
  produitsContainer.innerHTML = '';

  const enGrille = vendeurActuel && vendeurActuel.formule === 'premium' && getTemplateActif() === 'marche';
  document.body.classList.toggle('premium-marche-large', enGrille);
  if (enGrille) injecterStyleGrillePremium();

  const categories = [];
  produits.forEach(p => {
    const cat = p.categorie || 'general';
    if (!categories.includes(cat)) categories.push(cat);
  });

  if (categories.length === 0) {
    produitsContainer.innerHTML = '<p style="text-align:center; padding:40px 20px; color:#999;">Aucun produit pour le moment.</p>';
    return;
  }

  if (enGrille) {
    // Rangée horizontale des produits mis en avant (favoris + tendance),
    // au-dessus de la grille verticale — mélange horizontal/vertical façon Tesco.
    const misEnAvant = produits.filter(p => p.favori || p.id === produitTendanceId);
    if (misEnAvant.length) {
      const rangee = document.createElement('div');
      rangee.style.cssText = 'padding:0 0 18px;';
      rangee.innerHTML = `
        <p style="padding:0 20px 10px; font-weight:700; font-size:14px;">✨ Sélection du moment</p>
        <div class="selection-moment-premium" style="display:flex; gap:14px; overflow-x:auto; padding:0 20px 6px; scroll-snap-type:x mandatory; -webkit-overflow-scrolling:touch;">
          ${misEnAvant.map(p => `<div style="flex:0 0 170px; scroll-snap-align:start;">${construireCarteProduitClient(p)}</div>`).join('')}
        </div>
      `;
      produitsContainer.appendChild(rangee);
      activerAnimationsApparition(rangee);
    }
  }

  categories.forEach((cat, index) => {
    const div = document.createElement('div');
    div.classList.add('selectt');
    const prefixeIcone = enGrille ? iconePourCategorie(cat) + ' ' : '';
    div.innerHTML = `<button class="menu-btn${index === 0 ? ' active' : ''}" data-cat="${cat}" onclick="afficherCategorie('${cat}', this)">${prefixeIcone}${formaterNomCategorie(cat)}</button>`;
    boutonsContainer.appendChild(div);
  });

  categories.forEach((cat, index) => {
    const section = document.createElement('div');
    section.classList.add('categorie-section');
    section.dataset.cat = cat;
    section.style.display = index === 0 ? 'block' : 'none';

    const produitsCategorie = produits
      .filter(p => (p.categorie || 'general') === cat)
      .sort((a, b) => (b.favori === true) - (a.favori === true));

    if (enGrille) {
      // Premium : grille statique, tout visible d'un coup, pas de swipe nécessaire
      section.innerHTML = `<div class="grille-produits-premium">${produitsCategorie.map(construireCarteProduitClient).join('')}</div>`;
    } else {
      // Standard/Pro : carrousel horizontal Splide, comportement inchangé
      section.innerHTML = `
        <div class="splide" role="group">
          <div class="splide__track">
            <ul class="splide__list"></ul>
          </div>
        </div>
      `;
      const liste = section.querySelector('.splide__list');
      produitsCategorie.forEach(produit => {
        const li = document.createElement('li');
        li.classList.add('splide__slide');
        li.innerHTML = construireCarteProduitClient(produit);
        liste.appendChild(li);
      });
    }

    produitsContainer.appendChild(section);
    if (enGrille) activerAnimationsApparition(section);
  });

  if (!enGrille) {
    document.querySelectorAll('.splide').forEach(slider => {
      if (slider.splide) slider.splide.destroy(true);
      const nbSlides = slider.querySelectorAll('.splide__slide').length;
      const aPlusieursProduits = nbSlides > 1;

      const instance = new Splide(slider, {
        perPage: 3,
        gap: '16px',
        arrows: false,
        pagination: false,
        padding: aPlusieursProduits ? { right: '8%' } : { right: 0 },
        breakpoints: {
          1024: { perPage: 2, padding: aPlusieursProduits ? { right: '10%' } : { right: 0 } },
          600: { perPage: 1, padding: aPlusieursProduits ? { right: '18%' } : { right: 0 } }
        }
      });
      instance.mount();
      slider.splide = instance;
    });
  }
}

function formaterNomCategorie(cat) {
  return cat.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
}

// Devine une icône Font Awesome pertinente à partir du nom de la catégorie
// (déjà chargé sur le site, rendu identique sur tous les appareils —
// contrairement aux emoji qui varient selon iPhone/Android). Aucune saisie
// requise du vendeur — repli sur une icône générique si rien ne correspond.
function iconePourCategorie(cat) {
  const c = cat.toLowerCase();
  const correspondances = [
    [['fruit'], 'fa-apple-whole'],
    [['legume', 'légume'], 'fa-carrot'],
    [['viande', 'boucherie'], 'fa-drumstick-bite'],
    [['poisson', 'mer'], 'fa-fish'],
    [['boisson', 'jus', 'soda'], 'fa-bottle-water'],
    [['lait', 'fromage', 'laitier'], 'fa-cheese'],
    [['pain', 'boulangerie', 'patisserie', 'pâtisserie'], 'fa-bread-slice'],
    [['surgele', 'surgelé'], 'fa-snowflake'],
    [['hygiene', 'hygiène', 'beaute', 'beauté'], 'fa-pump-soap'],
    [['bebe', 'bébé'], 'fa-baby'],
    [['entretien', 'menage', 'ménage', 'nettoyage'], 'fa-broom'],
    [['riz', 'pate', 'pâte', 'cereale', 'céréale'], 'fa-bowl-rice'],
    [['epice', 'épice', 'condiment'], 'fa-pepper-hot'],
    [['snack', 'biscuit', 'confiserie'], 'fa-cookie']
  ];
  const trouve = correspondances.find(([mots]) => mots.some(m => c.includes(m)));
  return `<i class="fa-solid ${trouve ? trouve[1] : 'fa-basket-shopping'}" style="margin-right:5px;"></i>`;
}

function afficherCategorie(cat, bouton) {
  document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
  bouton.classList.add('active');

  const enGrilleActif = !!document.getElementById('style-grille-premium');

  if (!enGrilleActif) {
    document.querySelectorAll('.categorie-section').forEach(section => {
      section.style.display = section.dataset.cat === cat ? 'block' : 'none';
    });
    return;
  }

  // Marché premium : petit fondu au changement d'onglet, plus doux qu'un
  // basculement instantané. On force aussi l'apparition des cartes de la
  // section ciblée (au cas où elles n'aient jamais été visibles à l'écran,
  // l'observateur de scroll ne se déclenche pas de façon fiable sur du
  // contenu resté en display:none depuis le chargement).
  document.querySelectorAll('.categorie-section').forEach(section => {
    if (section.dataset.cat === cat) {
      section.style.display = 'block';
      requestAnimationFrame(() => {
        section.classList.remove('fondu-sortant');
        section.querySelectorAll('.product-card').forEach(carte => carte.classList.add('animer-apparition'));
      });
    } else if (section.style.display !== 'none') {
      section.classList.add('fondu-sortant');
      setTimeout(() => { section.style.display = 'none'; }, 200);
    }
  });
}

// ============================================
// Panier
// ============================================
let panierData = JSON.parse(localStorage.getItem('panier')) || [];

function mettreAJourCompteur() {
  let total = 0;
  panierData.forEach(p => total += p.quantite);
  if (document.getElementById('compteur')) {
    document.getElementById('compteur').textContent = total;
  }
}

function animation() {
  const toast = document.createElement('div');
  toast.innerHTML = `Produit ajouté ✓`;
  toast.classList.add('toast');
  document.body.appendChild(toast);
  setTimeout(() => document.body.removeChild(toast), 2000);
}

function ajouterAuPanier(id, commentaire = "") {
  animation();

  let item = panierData.find(p => p.id === id);
  if (item) {
    item.quantite++;
    item.commentaire = commentaire;
  } else {
    panierData.push({ id, quantite: 1, commentaire });
  }

  localStorage.setItem('panier', JSON.stringify(panierData));
  mettreAJourCompteur();
}

// ============================================
// Liste d'attente de réassort
// ============================================
async function demanderNotifStock(produitId) {
  const inputEl = document.getElementById(`attente-numero-${produitId}`);
  const messageEl = document.getElementById(`attente-message-${produitId}`);
  const numero = inputEl ? inputEl.value.trim() : '';

  if (!numero) {
    if (messageEl) { messageEl.textContent = "Entrez votre numéro."; messageEl.style.color = 'red'; }
    return;
  }

  if (!vendeurActuel) return;

  const { error } = await supabaseClient.from('liste_attente_stock').insert({
    vendeur_id: vendeurActuel.id,
    produit_id: produitId,
    numero_client: numero
  });

  if (error) {
    if (messageEl) { messageEl.textContent = "Erreur, réessayez."; messageEl.style.color = 'red'; }
    return;
  }

  if (messageEl) { messageEl.textContent = "C'est noté, vous serez prévenu ✓"; messageEl.style.color = 'green'; }
  if (inputEl) inputEl.value = '';
}

// Fonction unique de redirection dynamique (template + slug + id produit)
function allerVers(destination, id = null) {
  const slug = getVendeurSlug();
  const template = getTemplateActif();
  const nomFichier = template ? `${destination}-${template}` : destination;

  let url = `${nomFichier}.html`;
  const params = [];
  if (slug) params.push(`v=${slug}`);
  if (id) params.push(`id=${id}`);
  if (params.length) url += `?${params.join('&')}`;

  window.location.href = url;
}

document.addEventListener('DOMContentLoaded', chargerBoutique);
