// ============================================
// CMD. — Connexion Supabase pour les templates "prestations"
// À inclure après supabase-config.js : 
//   <script src="supabase-config.js"></script>
//   <script src="prestations.js"></script>
// ============================================

let vendeurActuel = null;
let prestationsData = [];
let personnelData = [];

let booking = { staffId: '', staffNom: '', prestationId: '', prestationNom: '', prestationPrix: '', date: '', slot: '', lieu: 'boutique' };

async function chargerBoutiquePrestations() {
  const slug = getVendeurSlug();

  const { data: vendeur, error } = await supabaseClient
    .from('vendeurs')
    .select('*')
    .eq('slug', slug)
    .eq('actif', true)
    .single();

  if (error || !vendeur) {
    console.error('Boutique introuvable pour le slug :', slug, error);
    return;
  }
  vendeurActuel = vendeur;

  // Si on arrive ici via 404.html (paramètre "pretty=1"), on remet l'URL
  // "chemin propre" (/slug) dans la barre d'adresse, sans recharger la page.
  const paramsURL = new URLSearchParams(window.location.search);
  if (paramsURL.get('pretty') === '1') {
    history.replaceState(null, '', `/${slug}`);
  }

  // Nom de la boutique (header + titre de page)
  document.querySelectorAll('.brand h1, .brand span').forEach(el => el.textContent = vendeur.nom_boutique);
  const footerNom = document.querySelector('.footer-nom');
  if (footerNom) footerNom.textContent = `2026 — ${vendeur.nom_boutique}`;
  document.title = vendeur.nom_boutique;

  // Lien WhatsApp du header
  const waHeader = document.querySelector('.icon-link');
  if (waHeader) waHeader.href = `https://wa.me/${vendeur.numero_whatsapp}`;

  await Promise.all([
    chargerPrestations(vendeur.id),
    chargerPersonnel(vendeur.id),
    chargerGalerie(vendeur.id),
    chargerFAQ(vendeur.id),
    chargerAvisPrestations(vendeur.id, vendeur.formule)
  ]);

  afficherReseauxSociaux(vendeur);
  afficherAdresse(vendeur);
}

// Icônes réseaux sociaux dans le footer (#reseaux-sociaux), seulement ceux renseignés
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

// Carte Google Maps intégrée (#carte-adresse), affichée seulement si une adresse est renseignée
function afficherAdresse(vendeur) {
  const section = document.getElementById('section-adresse');
  const carte = document.getElementById('carte-adresse');
  const texte = document.getElementById('texte-adresse');
  if (!section || !carte) return;

  if (!vendeur.adresse) { section.style.display = 'none'; return; }

  if (texte) texte.textContent = vendeur.adresse;
  carte.src = `https://maps.google.com/maps?q=${encodeURIComponent(vendeur.adresse)}&output=embed`;
}

async function chargerPrestations(vendeurId) {
  const { data, error } = await supabaseClient
    .from('prestations')
    .select('*, personnel_prestations(personnel_id)')
    .eq('vendeur_id', vendeurId)
    .eq('actif', true)
    .order('date_creation', { ascending: true });

  if (error) { console.error('Erreur chargement prestations :', error); return; }
  prestationsData = data || [];

  const grid = document.querySelector('.presta-grid');
  if (!grid) return;
  grid.innerHTML = '';

  prestationsData.forEach(p => {
    const el = document.createElement('div');
    el.className = 'presta';
    el.dataset.categorie = p.categorie || '';
    el.innerHTML = `
      ${p.image_url ? `<div class="ph"><img src="${p.image_url}" alt="${p.nom}" style="width:100%;height:100%;object-fit:cover;"></div>` : ''}
      <div class="name">${p.nom}</div>
      <div class="price">${p.prix.toLocaleString('fr-FR')} FCFA</div>
      <span class="mini-book">Réserver →</span>
    `;
    el.querySelector('.mini-book').addEventListener('click', () => openModal(p.id));
    grid.appendChild(el);
  });

  if (!prestationsData.length) {
    grid.innerHTML = '<p style="opacity:0.6;font-size:0.9rem;">Aucune prestation disponible pour le moment.</p>';
  }

  afficherOngletsCategories();
}

// Génère la bande de catégories défilante (au-dessus du catalogue de
// prestations) uniquement si au moins une prestation a une catégorie.
function afficherOngletsCategories() {
  const bande = document.getElementById('cat-track');
  if (!bande) return;

  const categories = [...new Set(prestationsData.map(p => p.categorie).filter(Boolean))];
  if (!categories.length) { bande.closest('.cat-strip')?.style.setProperty('display', 'none'); return; }
  bande.closest('.cat-strip')?.style.removeProperty('display');

  bande.innerHTML = '<div class="cat-item active" data-cat="tout">Tout</div>' +
    categories.map(c => `<div class="cat-item" data-cat="${c}">${c}</div>`).join('');

  bande.querySelectorAll('.cat-item').forEach(item => {
    item.addEventListener('click', () => {
      bande.querySelectorAll('.cat-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      const cat = item.dataset.cat;
      document.querySelectorAll('.presta-grid .presta').forEach(carte => {
        carte.style.display = (cat === 'tout' || carte.dataset.categorie === cat) ? '' : 'none';
      });
    });
  });
}

// Règle : une prestation sans aucune personne assignée reste ouverte à toute
// l'équipe (comportement par défaut, rien ne change pour les vendeurs qui
// n'utilisent pas cette fonctionnalité). Si des personnes précises lui sont
// assignées, seules elles peuvent la proposer.
function prestationOuvertePourStaff(p, staffId) {
  if (!staffId) return true; // "N'importe qui" → toutes les prestations restent visibles
  if (!p.personnel_prestations || !p.personnel_prestations.length) return true; // pas de restriction définie
  return p.personnel_prestations.some(l => l.personnel_id === staffId);
}

async function chargerPersonnel(vendeurId) {
  const { data, error } = await supabaseClient
    .from('personnel')
    .select('*')
    .eq('vendeur_id', vendeurId)
    .eq('actif', true);

  if (error) { console.error('Erreur chargement personnel :', error); return; }
  personnelData = data || [];

  const list = document.querySelector('.staff-list');
  if (!list) return;
  list.innerHTML = '';

  // "N'importe qui" toujours en premier
  list.appendChild(creerStaffItem(null, "N'importe qui", 'Premier créneau disponible'));

  personnelData.forEach(p => {
    list.appendChild(creerStaffItem(p.id, p.nom, 'Voir ses prestations'));
  });
}

// Ré-affiche la liste du personnel filtrée sur ceux qui font la prestation
// donnée. Appelée uniquement quand on entre dans le flux avec une prestation
// déjà choisie (bouton "Réserver" sur une carte) ; sinon la liste complète
// chargée par chargerPersonnel() reste affichée telle quelle.
function remplirStaffList(prestationId){
  const list = document.querySelector('.staff-list');
  if (!list) return;
  list.innerHTML = '';
  list.appendChild(creerStaffItem(null, "N'importe qui", 'Premier créneau disponible'));

  const p = prestationsData.find(x => x.id === prestationId);
  const idsAssignes = (p && p.personnel_prestations && p.personnel_prestations.length)
    ? p.personnel_prestations.map(l => l.personnel_id)
    : null; // null = pas de restriction, toute l'équipe peut la faire

  personnelData
    .filter(staff => !idsAssignes || idsAssignes.includes(staff.id))
    .forEach(staff => list.appendChild(creerStaffItem(staff.id, staff.nom, 'Voir ses prestations')));
}

function creerStaffItem(id, nom, sousTitre) {
  const el = document.createElement('div');
  el.className = 'staff-item';
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;">
      <div class="staff-avatar"></div>
      <div><div class="n">${nom}</div><div class="r">${sousTitre}</div></div>
    </div>
  `;
  el.addEventListener('click', () => chooseStaff(id, nom));
  return el;
}

async function chargerGalerie(vendeurId) {
  const { data, error } = await supabaseClient
    .from('galerie')
    .select('*')
    .eq('vendeur_id', vendeurId)
    .order('ordre', { ascending: true });

  if (error) { console.error('Erreur chargement galerie :', error); return; }

  const track = document.querySelector('.marquee-track');
  if (!track) return;
  track.innerHTML = '';

  if (!data || !data.length) {
    document.querySelector('.gallery-section')?.style.setProperty('display', 'none');
    return;
  }
  document.querySelector('.gallery-section')?.style.removeProperty('display');

  // Doublé pour un défilement infini fluide
  [...data, ...data].forEach(photo => {
    const el = document.createElement('div');
    el.className = 'g-item';
    el.innerHTML = `<img src="${photo.image_url}" alt="" style="width:100%;height:100%;object-fit:cover;">`;
    el.addEventListener('click', () => openLightbox(photo.image_url));
    track.appendChild(el);
  });
}

async function chargerFAQ(vendeurId) {
  const { data: faqs } = await supabaseClient
    .from('faq')
    .select('*')
    .eq('vendeur_id', vendeurId)
    .order('ordre', { ascending: true });

  const conteneur = document.querySelector('.faq');
  if (!conteneur) return;

  if (!faqs || !faqs.length) {
    conteneur.closest('section')?.style.setProperty('display', 'none');
    return;
  }

  conteneur.innerHTML = faqs.map((f, i) => `
    <details${i === 0 ? ' open' : ''}>
      <summary><span>${f.question}</span></summary>
      <p>${f.reponse}</p>
    </details>
  `).join('');
}

async function chargerAvisPrestations(vendeurId, formule) {
  const limite = (formule === 'standard') ? 10 : 30;

  const { data: avis } = await supabaseClient
    .from('avis')
    .select('*')
    .eq('vendeur_id', vendeurId)
    .eq('statut', 'approuve')
    .order('date_creation', { ascending: false })
    .limit(limite);

  const track = document.querySelector('.rev-track');
  const marquee = track ? track.closest('.rev-marquee') : null;
  if (!track) return;

  // On ne cache jamais toute la section (le bouton "Laisser un avis" doit
  // rester visible même sans avis publié) — seul le carrousel se masque.
  if (!avis || !avis.length) {
    if (marquee) marquee.style.display = 'none';
    return;
  }
  if (marquee) marquee.style.display = '';

  const carte = (a) => `
    <div class="rev">
      <div class="stars">${'★'.repeat(a.note)}${'☆'.repeat(5 - a.note)}</div>
      <p>${a.commentaire || ''}</p>
      <div class="who">${a.nom_client || 'Client'}</div>
    </div>
  `;
  // Doublé pour un défilement infini fluide
  track.innerHTML = avis.map(carte).join('') + avis.map(carte).join('');
}

let noteSelectionnee = 0;

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
  document.querySelectorAll('#etoiles-input span').forEach(e => e.classList.remove('active'));
  noteSelectionnee = 0;
}

// ============================================
// FLUX DE RÉSERVATION
// ============================================
function openModal(prestationId) {
  document.getElementById('modal-overlay').classList.add('open');
  booking = { staffId: '', staffNom: '', prestationId: '', prestationNom: '', prestationPrix: '', date: '', slot: '', lieu: 'boutique' };

  if (prestationId) {
    const p = prestationsData.find(x => x.id === prestationId);
    if (p) { booking.prestationId = p.id; booking.prestationNom = p.nom; booking.prestationPrix = p.prix; }
    remplirStaffList(prestationId);
  }
  goStep(1);
}
function closeModal(){ document.getElementById('modal-overlay').classList.remove('open'); }

function goStep(n){
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.getElementById('step-'+n).classList.add('active');
  if (n === 2) remplirServiceList();
  if (n === 4) buildSummary();
}

function chooseStaff(id, nom){
  booking.staffId = id;
  booking.staffNom = nom;
  goStep(booking.prestationId ? 3 : 2); // si prestation déjà choisie (mini-book), on saute l'étape service
}

function remplirServiceList(){
  const list = document.querySelector('.service-list');
  if (!list) return;
  list.innerHTML = '';

  const prestationsDisponibles = prestationsData.filter(p => prestationOuvertePourStaff(p, booking.staffId));

  if (!prestationsDisponibles.length) {
    list.innerHTML = '<p style="opacity:0.6;font-size:0.9rem;">Aucune prestation disponible avec cette personne.</p>';
    return;
  }

  prestationsDisponibles.forEach(p => {
    const el = document.createElement('div');
    el.className = 'service-row';
    el.innerHTML = `<span>${p.nom}</span><span class="p">${p.prix.toLocaleString('fr-FR')} FCFA</span>`;
    el.addEventListener('click', () => {
      booking.prestationId = p.id; booking.prestationNom = p.nom; booking.prestationPrix = p.prix;
      goStep(3);
    });
    list.appendChild(el);
  });
}

function choisirLieu(lieu){
  booking.lieu = lieu;
  document.getElementById('lieu-boutique').classList.toggle('selected', lieu === 'boutique');
  document.getElementById('lieu-domicile').classList.toggle('selected', lieu === 'domicile');
  document.getElementById('rdv-adresse').style.display = lieu === 'domicile' ? 'block' : 'none';
}

function buildSummary(){
  const dateVal = document.getElementById('date-rdv').value || '(date à confirmer)';
  booking.date = dateVal;
  document.getElementById('summary-box').innerHTML =
    `Prestation : <b>${booking.prestationNom || '(à préciser)'}</b><br>
     Avec : <b>${booking.staffNom || "N'importe qui"}</b><br>
     Le : <b>${dateVal}${booking.slot ? ' à ' + booking.slot : ''}</b>`;

  const numero = vendeurActuel ? vendeurActuel.numero_whatsapp : '221000000000';
  const btn = document.getElementById('confirm-btn');

  btn.onclick = () => {
    const nom = document.getElementById('rdv-nom').value.trim();
    const numeroClient = document.getElementById('rdv-numero').value.trim();
    const adresseClient = document.getElementById('rdv-adresse').value.trim();
    const lieuTexte = booking.lieu === 'domicile' ? `à domicile (${adresseClient || 'adresse à préciser'})` : 'en boutique';
    const msg = encodeURIComponent(
      `Bonjour, je suis ${nom || ''}. Je voudrais réserver ${booking.prestationNom || ''} avec ${booking.staffNom || "n'importe qui"} le ${dateVal}${booking.slot ? ' à ' + booking.slot : ''}, ${lieuTexte}.`
    );
    btn.href = `https://wa.me/${numero}?text=${msg}`;
    enregistrerRendezVous(nom, numeroClient, adresseClient);
  };
}

async function enregistrerRendezVous(nom, numeroClient, adresseClient){
  if (!vendeurActuel) return;
  await supabaseClient.from('rendez_vous').insert({
    vendeur_id: vendeurActuel.id,
    prestation_id: booking.prestationId || null,
    personnel_id: booking.staffId || null,
    nom_client: nom || null,
    numero_client: numeroClient || null,
    lieu: booking.lieu || 'boutique',
    adresse_client: booking.lieu === 'domicile' ? (adresseClient || null) : null,
    date: convertirDateISO(booking.date),
    heure: booking.slot || null
  });
}

function convertirDateISO(dateStr){
  // dateStr au format d/m/Y (Flatpickr) → yyyy-mm-dd pour Postgres
  const parts = (dateStr || '').split('/');
  if (parts.length !== 3) return null;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function openLightbox(url){
  const box = document.querySelector('.lightbox-box');
  if (box) box.style.backgroundImage = `url(${url})`;
  box.style.backgroundSize = 'cover';
  box.style.backgroundPosition = 'center';
  document.getElementById('lightbox').classList.add('open');
}
function closeLightbox(){ document.getElementById('lightbox').classList.remove('open'); }

// Calendrier — jours fermés récurrents + jours bloqués manuellement
async function initCalendrier(){
  if (!vendeurActuel) return;
  const { data: bloques } = await supabaseClient
    .from('jours_bloques')
    .select('date')
    .eq('vendeur_id', vendeurActuel.id);

  const joursFermes = vendeurActuel.jours_fermeture_recurrents || [0];
  const datesBloquees = (bloques || []).map(b => b.date);

  flatpickr("#date-rdv", {
    minDate: "today",
    dateFormat: "d/m/Y",
    disable: [
      function(date){ return joursFermes.includes(date.getDay()); },
      ...datesBloquees
    ],
    onChange: function(selectedDates, dateStr){
      genererCreneaux(dateStr);
    }
  });
}

// Calcule et affiche les créneaux horaires réellement disponibles pour la
// date choisie : découpés selon la durée de la prestation, en excluant les
// blocages précis et les créneaux déjà pris par un autre rendez-vous.
async function genererCreneaux(dateStr){
  const grille = document.getElementById('slot-grid');
  if (!grille || !vendeurActuel) return;
  booking.slot = '';

  const parts = dateStr.split('/');
  const dateISO = `${parts[2]}-${parts[1]}-${parts[0]}`;
  const duree = (prestationsData.find(p => p.id === booking.prestationId) || {}).duree_minutes || 30;

  const [hOuv, mOuv] = (vendeurActuel.heure_ouverture || '09:00').slice(0,5).split(':').map(Number);
  const [hFer, mFer] = (vendeurActuel.heure_fermeture || '18:00').slice(0,5).split(':').map(Number);
  const debutMinutes = hOuv * 60 + mOuv;
  const finMinutes = hFer * 60 + mFer;

  const [{ data: blocages }, { data: rdvExistants }] = await Promise.all([
    supabaseClient.from('blocages_horaires').select('*').eq('vendeur_id', vendeurActuel.id).eq('date', dateISO),
    supabaseClient.from('rendez_vous').select('heure, personnel_id').eq('vendeur_id', vendeurActuel.id).eq('date', dateISO)
  ]);

  const versMinutes = (h) => { const [hh, mm] = h.slice(0,5).split(':').map(Number); return hh * 60 + mm; };

  const creneaux = [];
  for (let m = debutMinutes; m + duree <= finMinutes; m += duree) {
    const fin = m + duree;

    const bloque = (blocages || []).some(b => {
      if (b.personnel_id && booking.staffId && b.personnel_id !== booking.staffId) return false;
      const bd = versMinutes(b.heure_debut), bf = versMinutes(b.heure_fin);
      return m < bf && fin > bd;
    });

    const pris = (rdvExistants || []).some(r => {
      if (!r.heure) return false;
      if (booking.staffId && r.personnel_id && r.personnel_id !== booking.staffId) return false;
      return versMinutes(r.heure) === m;
    });

    const h = String(Math.floor(m/60)).padStart(2,'0');
    const mn = String(m%60).padStart(2,'0');
    creneaux.push({ label: `${h}h${mn}`, valeur: `${h}:${mn}`, disponible: !bloque && !pris });
  }

  if (!creneaux.length) {
    grille.innerHTML = '<p style="grid-column:1/-1;opacity:0.6;font-size:0.85rem;">Aucun créneau ce jour-là.</p>';
    return;
  }

  grille.innerHTML = creneaux.map(c =>
    c.disponible
      ? `<div class="slot" data-valeur="${c.valeur}">${c.label}</div>`
      : `<div class="slot disabled">${c.label}</div>`
  ).join('');

  grille.querySelectorAll('.slot:not(.disabled)').forEach(el => {
    el.addEventListener('click', () => {
      grille.querySelectorAll('.slot').forEach(s => s.classList.remove('selected'));
      el.classList.add('selected');
      booking.slot = el.dataset.valeur;
    });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  await chargerBoutiquePrestations();
  await initCalendrier();
});