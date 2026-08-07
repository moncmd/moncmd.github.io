// ============================================
// CMD. — Connexion Supabase pour les templates "prestations"
// À inclure après supabase-config.js : 
//   <script src="supabase-config.js"></script>
//   <script src="prestations.js"></script>
// ============================================

let vendeurActuel = null;
let prestationsData = [];
let personnelData = [];

let booking = { staffId: '', staffNom: '', prestationId: '', prestationNom: '', prestationPrix: '', date: '', slot: '' };

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

  // Nom de la boutique (header + titre de page)
  document.querySelectorAll('.brand span').forEach(el => el.textContent = vendeur.nom_boutique);
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

async function chargerPrestations(vendeurId) {
  const { data, error } = await supabaseClient
    .from('prestations')
    .select('*')
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
    el.innerHTML = `
      <div class="ph">${p.image_url ? `<img src="${p.image_url}" alt="${p.nom}" style="width:100%;height:100%;object-fit:cover;">` : '<span>Photo</span>'}</div>
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
  const section = track ? track.closest('section') : null;
  if (!track) return;

  if (!avis || !avis.length) {
    if (section) section.style.display = 'none';
    return;
  }

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
  booking = { staffId: '', staffNom: '', prestationId: '', prestationNom: '', prestationPrix: '', date: '', slot: '' };

  if (prestationId) {
    const p = prestationsData.find(x => x.id === prestationId);
    if (p) { booking.prestationId = p.id; booking.prestationNom = p.nom; booking.prestationPrix = p.prix; }
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
  prestationsData.forEach(p => {
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

function buildSummary(){
  const dateVal = document.getElementById('date-rdv').value || '(date à confirmer)';
  booking.date = dateVal;
  document.getElementById('summary-box').innerHTML =
    `Prestation : <b>${booking.prestationNom || '(à préciser)'}</b><br>
     Avec : <b>${booking.staffNom || "N'importe qui"}</b><br>
     Le : <b>${dateVal}${booking.slot ? ' à ' + booking.slot : ''}</b>`;

  const numero = vendeurActuel ? vendeurActuel.numero_whatsapp : '221000000000';
  const msg = encodeURIComponent(
    `Bonjour, je voudrais réserver ${booking.prestationNom || ''} avec ${booking.staffNom || "n'importe qui"} le ${dateVal}${booking.slot ? ' à ' + booking.slot : ''}.`
  );
  const btn = document.getElementById('confirm-btn');
  btn.href = `https://wa.me/${numero}?text=${msg}`;
  btn.addEventListener('click', enregistrerRendezVous);
}

async function enregistrerRendezVous(){
  if (!vendeurActuel) return;
  await supabaseClient.from('rendez_vous').insert({
    vendeur_id: vendeurActuel.id,
    prestation_id: booking.prestationId || null,
    personnel_id: booking.staffId || null,
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
    ]
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  await chargerBoutiquePrestations();
  await initCalendrier();
});
