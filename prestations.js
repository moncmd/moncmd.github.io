// ============================================
// CMD. — Connexion Supabase pour les templates "prestations"
// À inclure après supabase-config.js : 
//   <script src="supabase-config.js"></script>
//   <script src="prestations.js"></script>
// ============================================

let vendeurActuel = null;
let prestationsData = [];
let personnelData = [];

let booking = { staffId: '', staffNom: '', prestationId: '', prestationNom: '', prestationPrix: '', date: '', slot: '', lieu: 'boutique', services: [], modeRecap: false };

// Convertit "HH:MM" en minutes depuis midnight, et inversement — utilisé partout
// pour calculer les horaires séquentiels des serv multiples.
function versMinutesGlobal(h){ const [hh, mm] = (h || '00:00').slice(0,5).split(':').map(Number); return hh * 60 + mm; }
function formatHM(m){ return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`; }

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
    .order('ordre', { ascending: true });

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
    list.appendChild(creerStaffItem(p.id, p.nom, 'Voir ses prestations', p.photo_url));
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
    .forEach(staff => list.appendChild(creerStaffItem(staff.id, staff.nom, 'Voir ses prestations', staff.photo_url)));
}

function creerStaffItem(id, nom, sousTitre, photoUrl) {
  const el = document.createElement('div');
  el.className = 'staff-item';
  const styleAvatar = photoUrl
    ? ` style="background-image:url('${photoUrl}');background-size:cover;background-position:center;"`
    : '';
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;">
      <div class="staff-avatar"${styleAvatar}></div>
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
  booking = { staffId: '', staffNom: '', prestationId: '', prestationNom: '', prestationPrix: '', date: '', slot: '', lieu: 'boutique', services: [], modeRecap: false };

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
  if (n === 2) {
    if (booking.modeRecap) afficherRecapServicesChoisis();
    else remplirServiceList();
  }
  if (n === 4) buildSummary();
}

function chooseStaff(id, nom){
  booking.staffId = id;
  booking.staffNom = nom;

  if (booking.prestationId) {
    // Mini-book (bouton "Réserver" sur une carte précise) : la prestation est déjà
    // connue, on l'ajoute directement au lieu de repasser par la liste.
    const p = prestationsData.find(x => x.id === booking.prestationId);
    ajouterServiceEtAfficherRecap(p, id, nom);
    booking.prestationId = ''; // on vide le "champ courant" pour ne pas le réutiliser sur un service suivant
    goStep(2);
  } else {
    goStep(2);
  }
}

function ajouterServiceEtAfficherRecap(p, staffId, staffNom){
  if (!p) return;
  booking.services.push({
    prestationId: p.id, prestationNom: p.nom, prestationPrix: p.prix,
    staffId: staffId, staffNom: staffNom, duree_minutes: p.duree_minutes || 30,
    prixVariable: !!p.prix_variable
  });
  booking.modeRecap = true;
}

function remplirServiceList(){
  const list = document.querySelector('.service-list');
  if (!list) return;
  list.style.display = '';
  const recap = document.getElementById('recap-services-choisis');
  if (recap) recap.style.display = 'none';

  list.innerHTML = '';

  const prestationsDisponibles = prestationsData.filter(p => prestationOuvertePourStaff(p, booking.staffId));

  if (!prestationsDisponibles.length) {
    list.innerHTML = '<p style="opacity:0.6;font-size:0.9rem;">Aucune prestation disponible avec cette personne.</p>';
    return;
  }

  prestationsDisponibles.forEach(p => {
    const el = document.createElement('div');
    el.className = 'service-row';
    el.innerHTML = `<span>${p.nom}${p.prix_variable ? ' <span style="opacity:0.5;font-size:0.75em;">(± modèle)</span>' : ''}</span><span class="p">${p.prix.toLocaleString('fr-FR')} FCFA</span>`;
    el.addEventListener('click', () => {
      ajouterServiceEtAfficherRecap(p, booking.staffId, booking.staffNom);
      goStep(2);
    });
    list.appendChild(el);
  });
}

// Affiche la liste des services déjà choisis (avec la personne assignée à
// chacun), un bouton pour en ajouter un autre, et un bouton pour continuer
// vers le choix de la date. Vit dans le même conteneur que .service-list,
// injecté dynamiquement (aucune modification des fichiers HTML nécessaire).
function afficherRecapServicesChoisis(){
  const list = document.querySelector('.service-list');
  if (!list) return;
  list.style.display = 'none';

  let recap = document.getElementById('recap-services-choisis');
  if (!recap) {
    recap = document.createElement('div');
    recap.id = 'recap-services-choisis';
    list.parentNode.insertBefore(recap, list.nextSibling);
  }
  recap.style.display = '';

  const total = booking.services.reduce((t, s) => t + (s.prestationPrix || 0), 0);

  recap.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">
      ${booking.services.map((s, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;border:2px solid var(--ink,#000);border-radius:8px;">
          <div>
            <div style="font-weight:600;font-size:0.88rem;">${s.prestationNom}</div>
            <div style="font-size:0.72rem;opacity:0.6;">avec ${s.staffNom || "n'importe qui"} · ${s.prestationPrix.toLocaleString('fr-FR')} FCFA</div>
          </div>
          <span style="cursor:pointer;opacity:0.5;font-size:1.1rem;" onclick="retirerServiceChoisi(${i})">✕</span>
        </div>
      `).join('')}
    </div>
    <p style="font-weight:600;font-size:0.85rem;margin-bottom:14px;">Total : ${total.toLocaleString('fr-FR')} FCFA</p>
    <div style="display:flex;gap:10px;">
      <span class="mono" style="cursor:pointer;" onclick="ajouterAutreService()">+ Ajouter un service</span>
      <span class="mono" style="cursor:pointer;font-weight:700;" onclick="goStep(3)">Continuer →</span>
    </div>
  `;
}

function retirerServiceChoisi(index){
  booking.services.splice(index, 1);
  if (!booking.services.length) { booking.modeRecap = false; }
  afficherRecapServicesChoisis();
  if (!booking.services.length) remplirServiceList();
}

function ajouterAutreService(){
  booking.modeRecap = false;
  booking.staffId = ''; booking.staffNom = ''; booking.prestationId = '';
  goStep(1);
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

  // Calcule l'horaire de chaque service, l'un après l'autre, à partir du créneau choisi
  let curseur = versMinutesGlobal(booking.slot || '00:00');
  const lignesDetail = booking.services.map(s => {
    const heure = formatHM(curseur);
    curseur += (s.duree_minutes || 30);
    return { ...s, heure };
  });

  const total = booking.services.reduce((t, s) => t + (s.prestationPrix || 0), 0);
  const prixVariable = booking.services.some(s => s.prixVariable);

  const infosPaiement = (vendeurActuel && (vendeurActuel.wave_numero || vendeurActuel.om_numero))
    ? `<br><br><span style="font-size:0.78rem;opacity:0.75;">Acompte / paiement :<br>` +
      (vendeurActuel.wave_numero ? `Wave : <b>${vendeurActuel.wave_numero}</b><br>` : '') +
      (vendeurActuel.om_numero ? `Orange Money : <b>${vendeurActuel.om_numero}</b>` : '') +
      `</span>`
    : '';

  const noteModele = prixVariable
    ? `<br><br><span style="font-size:0.75rem;opacity:0.7;">NB : le prix final de certains services dépend du modèle choisi, à confirmer avec la prestataire.</span>`
    : '';

  document.getElementById('summary-box').innerHTML =
    lignesDetail.map(l => `${l.prestationNom} avec <b>${l.staffNom || "n'importe qui"}</b> à <b>${l.heure}</b>`).join('<br>') +
    `<br>Le : <b>${dateVal}</b>` +
    (booking.services.length > 1 ? `<br>Total : <b>${total.toLocaleString('fr-FR')} FCFA</b>` : '') +
    infosPaiement + noteModele;

  const numero = vendeurActuel ? vendeurActuel.numero_whatsapp : '221000000000';
  const btn = document.getElementById('confirm-btn');

  btn.onclick = () => {
    const nom = document.getElementById('rdv-nom').value.trim();
    const numeroClient = document.getElementById('rdv-numero').value.trim();
    const adresseClient = document.getElementById('rdv-adresse').value.trim();
    const lieuTexte = booking.lieu === 'domicile' ? `à domicile (${adresseClient || 'adresse à préciser'})` : 'en boutique';

    const detailServices = lignesDetail
      .map(l => `${l.prestationNom} avec ${l.staffNom || "n'importe qui"} à ${l.heure}`)
      .join(', puis ');

    const messagePersonnalise = (vendeurActuel && vendeurActuel.slug === 'Lees')
      ? " Veuillez m'envoyer le lien de validation wave pour réserver le créneau."
      : '';

    const msg = encodeURIComponent(
      `Bonjour, je suis ${nom || ''}. Je voudrais réserver : ${detailServices}, le ${dateVal}, ${lieuTexte}.${messagePersonnalise}`
    );
    btn.href = `https://wa.me/${numero}?text=${msg}`;
    enregistrerRendezVous(nom, numeroClient, adresseClient);
  };
}

async function enregistrerRendezVous(nom, numeroClient, adresseClient){
  if (!vendeurActuel) return;

  const dateISO = convertirDateISO(booking.date);
  const groupeId = crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });

  let curseur = versMinutesGlobal(booking.slot || '00:00');

  const lignes = booking.services.map(s => {
    const ligne = {
      vendeur_id: vendeurActuel.id,
      prestation_id: s.prestationId || null,
      personnel_id: s.staffId || null,
      nom_client: nom || null,
      numero_client: numeroClient || null,
      lieu: booking.lieu || 'boutique',
      adresse_client: booking.lieu === 'domicile' ? (adresseClient || null) : null,
      date: dateISO,
      heure: formatHM(curseur),
      duree_minutes: s.duree_minutes || 30,
      groupe_reservation: groupeId,
      statut: 'en_attente'
    };
    curseur += (s.duree_minutes || 30);
    return ligne;
  });

  const { error } = await supabaseClient.from('rendez_vous').insert(lignes);
  if (error) console.error('Erreur enregistrement rendez-vous :', error);
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

  const services = booking.services;
  if (!services.length) { grille.innerHTML = ''; return; }

  const dureeTotale = services.reduce((t, s) => t + (s.duree_minutes || 30), 0);
  const dureePremierService = services[0].duree_minutes || 30; // pas d'incrément de la grille de créneaux

  const [hOuv, mOuv] = (vendeurActuel.heure_ouverture || '09:00').slice(0,5).split(':').map(Number);
  const [hFer, mFer] = (vendeurActuel.heure_fermeture || '18:00').slice(0,5).split(':').map(Number);
  const debutMinutes = hOuv * 60 + mOuv;
  const finMinutes = hFer * 60 + mFer;

  const [{ data: blocages }, { data: rdvExistants }] = await Promise.all([
    supabaseClient.from('blocages_horaires').select('*').eq('vendeur_id', vendeurActuel.id).eq('date', dateISO),
    supabaseClient.from('rendez_vous').select('heure, personnel_id, duree_minutes').eq('vendeur_id', vendeurActuel.id).eq('date', dateISO)
  ]);

  const versMinutes = versMinutesGlobal;
  const maintenant = new Date();

  // Un créneau candidat "m" n'est valable que si CHAQUE service de la chaîne,
  // à son propre horaire décalé, est libre pour SON prestataire assigné.
  function chaineValide(m){
    let curseur = m;
    for (const s of services) {
      const debutService = curseur;
      const finService = curseur + (s.duree_minutes || 30);
      const staffService = s.staffId;

      const bloque = (blocages || []).some(b => {
        if (b.personnel_id && staffService && b.personnel_id !== staffService) return false;
        const bd = versMinutes(b.heure_debut), bf = versMinutes(b.heure_fin);
        return debutService < bf && finService > bd;
      });
      if (bloque) return false;

      const pris = (rdvExistants || []).some(r => {
        if (!r.heure) return false;
        if (staffService && r.personnel_id && r.personnel_id !== staffService) return false;
        const rDebut = versMinutes(r.heure), rFin = rDebut + (r.duree_minutes || 30);
        return debutService < rFin && finService > rDebut;
      });
      if (pris) return false;

      curseur = finService;
    }
    return true;
  }

  const creneaux = [];
  for (let m = debutMinutes; m + dureeTotale <= finMinutes; m += dureePremierService) {
    const h = String(Math.floor(m/60)).padStart(2,'0');
    const mn = String(m%60).padStart(2,'0');

    // Comparaison sur des dates complètes (jour + heure), pour gérer correctement
    // le passage à minuit — pas juste une comparaison d'heures dans la journée.
    const dateHeureCreneau = new Date(`${dateISO}T${h}:${mn}:00`);
    const minutesAvantCreneau = (dateHeureCreneau - maintenant) / 60000;
    const tropTot = minutesAvantCreneau < 12 * 60;

    creneaux.push({ label: `${h}h${mn}`, valeur: `${h}:${mn}`, disponible: !tropTot && chaineValide(m) });
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
