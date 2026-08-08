// ============================================
// CMD. — admin-prestations.js
// Login vendeur + dashboard prestataire (mêmes conventions que admin.js)
// ============================================

let vendeurConnecte = null;
let prestationsCache = [];
let personnelCache = [];

const HIERARCHIE_FORMULES = ['standard', 'pro', 'premium'];
function auMoins(niveauRequis) {
  const niveauActuel = HIERARCHIE_FORMULES.indexOf(vendeurConnecte.formule || 'standard');
  const niveauCible = HIERARCHIE_FORMULES.indexOf(niveauRequis);
  return niveauActuel >= niveauCible;
}

document.addEventListener('DOMContentLoaded', verifierSession);

async function verifierSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) await chargerDashboard(session.user.id);
}

async function connexion() {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const erreurEl = document.getElementById('login-erreur');
  erreurEl.textContent = '';

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) { erreurEl.textContent = "Email ou mot de passe incorrect."; return; }
  await chargerDashboard(data.user.id);
}

async function deconnexion() {
  await supabaseClient.auth.signOut();
  document.getElementById('vue-login').style.display = 'flex';
  document.getElementById('vue-dashboard').style.display = 'none';
  document.getElementById('vue-dashboard-tabs').style.display = 'none';
}

function changerOnglet(nom, boutonEl) {
  document.querySelectorAll('.onglet-panel').forEach(p => p.classList.remove('actif'));
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('actif'));
  document.getElementById('onglet-' + nom).classList.add('actif');
  boutonEl.classList.add('actif');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function chargerDashboard(authUserId) {
  const { data: admin, error } = await supabaseClient
    .from('admins')
    .select('vendeur_id, vendeurs(*)')
    .eq('auth_user_id', authUserId)
    .single();

  if (error || !admin) {
    document.getElementById('login-erreur').textContent = "Aucune boutique liée à ce compte.";
    return;
  }

  vendeurConnecte = admin.vendeurs;

  document.getElementById('vue-login').style.display = 'none';
  document.getElementById('vue-dashboard').style.display = 'block';
  document.getElementById('vue-dashboard-tabs').style.display = 'flex';
  document.getElementById('nom-boutique-admin').textContent = vendeurConnecte.nom_boutique;
  document.getElementById('header-boutique-nom').textContent = `— ${vendeurConnecte.nom_boutique}`;
  document.documentElement.style.setProperty('--couleur-accent', vendeurConnecte.couleur_accent || '#e56400');

  // Verrouillage visuel des blocs selon la formule
  document.getElementById('carte-depenses').classList.toggle('verrouille', !auMoins('pro'));
  document.getElementById('carte-benefice-net').classList.toggle('verrouille', !auMoins('premium'));
  document.getElementById('carte-equipe').classList.toggle('verrouille', !auMoins('premium'));

  remplirInfosVendeur();
  genererQRCode();
  initDisponibilites();
  chargerBlocagesHoraires();

  await Promise.all([
    chargerPrestations(),
    chargerPersonnel(),
    chargerGalerie(),
    chargerFAQAdmin(),
    chargerAvisAModerer(),
    chargerStats(),
    chargerGraphique7Jours(),
    chargerDernieresDemandes()
  ]);
}

// ============================================
// PRESTATIONS
// ============================================
async function chargerPrestations() {
  const { data } = await supabaseClient
    .from('prestations')
    .select('*, personnel_prestations(personnel_id)')
    .eq('vendeur_id', vendeurConnecte.id)
    .eq('actif', true)
    .order('date_creation', { ascending: false });

  prestationsCache = data || [];
  const liste = document.getElementById('liste-prestations');
  document.getElementById('stat-prestations-actives').textContent = prestationsCache.length;

  if (!prestationsCache.length) {
    liste.innerHTML = '<p class="empty-state">Aucune prestation pour le moment.</p>';
    return;
  }

  liste.innerHTML = prestationsCache.map(p => `
    <div class="row">
      <img class="row-thumb" src="${p.image_url || ''}">
      <div class="row-infos"><strong>${p.nom}</strong><span class="sub">${p.prix.toLocaleString('fr-FR')} FCFA · ${p.duree_minutes} min</span></div>
      <div class="row-actions">
        <button class="icon-btn danger" onclick="supprimerPrestation('${p.id}')"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>
  `).join('');
}

async function ajouterPrestation() {
  const nom = document.getElementById('nouveau-presta-nom').value.trim();
  const prix = parseInt(document.getElementById('nouveau-presta-prix').value);
  const duree_minutes = parseInt(document.getElementById('nouveau-presta-duree').value) || 30;
  const fichier = document.getElementById('nouveau-presta-fichier').files[0];
  const personnelId = document.getElementById('nouveau-presta-personnel').value;
  const messageEl = document.getElementById('presta-message');

  if (!nom || !prix) {
    messageEl.textContent = "Nom et prix sont obligatoires.";
    messageEl.style.color = 'red';
    return;
  }

  if (!auMoins('premium')) {
    const limite = auMoins('pro') ? 50 : 20;
    const { count } = await supabaseClient
      .from('prestations')
      .select('*', { count: 'exact', head: true })
      .eq('vendeur_id', vendeurConnecte.id)
      .eq('actif', true);
    if ((count || 0) >= limite) {
      messageEl.textContent = auMoins('pro')
        ? "Limite de 50 prestations atteinte avec la formule Pro. Passez en Premium pour continuer."
        : "Limite de 20 prestations atteinte avec la formule Standard. Passez en Pro pour continuer.";
      messageEl.style.color = 'red';
      return;
    }
  }

  let image_url = '';
  if (fichier) {
    const nomFichier = `${vendeurConnecte.id}/${Date.now()}-${fichier.name}`;
    const { error: erreurUpload } = await supabaseClient.storage.from('prestations-images').upload(nomFichier, fichier);
    if (!erreurUpload) {
      const { data: pub } = supabaseClient.storage.from('prestations-images').getPublicUrl(nomFichier);
      image_url = pub.publicUrl;
    }
  }

  const { data: nouvellePrestation, error } = await supabaseClient
    .from('prestations')
    .insert({ vendeur_id: vendeurConnecte.id, nom, prix, duree_minutes, image_url })
    .select()
    .single();

  if (error) { messageEl.textContent = "Erreur lors de l'ajout."; messageEl.style.color = 'red'; return; }

  if (personnelId && nouvellePrestation) {
    await supabaseClient.from('personnel_prestations').insert({ personnel_id: personnelId, prestation_id: nouvellePrestation.id });
  }

  messageEl.textContent = "Prestation ajoutée ✓";
  messageEl.style.color = 'green';
  document.getElementById('nouveau-presta-nom').value = '';
  document.getElementById('nouveau-presta-prix').value = '';
  document.getElementById('nouveau-presta-duree').value = 30;
  document.getElementById('nouveau-presta-fichier').value = '';
  await chargerPrestations();
}

async function supprimerPrestation(id) {
  await supabaseClient.from('prestations').update({ actif: false }).eq('id', id);
  await chargerPrestations();
}

// ============================================
// PERSONNEL
// ============================================
async function chargerPersonnel() {
  const { data } = await supabaseClient
    .from('personnel')
    .select('*')
    .eq('vendeur_id', vendeurConnecte.id)
    .eq('actif', true);

  personnelCache = data || [];
  const liste = document.getElementById('liste-personnel');
  const select = document.getElementById('nouveau-presta-personnel');

  select.innerHTML = '<option value="">Assignée à… (optionnel)</option>' +
    personnelCache.map(p => `<option value="${p.id}">${p.nom}</option>`).join('');

  const selectBlocage = document.getElementById('blocage-personnel');
  if (selectBlocage) {
    selectBlocage.innerHTML = '<option value="">Toute l\'équipe</option>' +
      personnelCache.map(p => `<option value="${p.id}">${p.nom}</option>`).join('');
  }

  if (!personnelCache.length) {
    liste.innerHTML = '<p class="empty-state">Aucune personne ajoutée.</p>';
    return;
  }

  liste.innerHTML = personnelCache.map(p => `
    <div class="row">
      <img class="row-thumb" style="border-radius:50%;" src="${p.photo_url || ''}">
      <div class="row-infos"><strong>${p.nom}</strong><span class="sub">Membre de l'équipe</span></div>
      <div class="row-actions">
        <button class="icon-btn danger" onclick="supprimerPersonnel('${p.id}')"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>
  `).join('');
}

async function ajouterPersonnel() {
  const messageEl = document.getElementById('staff-message');
  if (!auMoins('pro')) {
    messageEl.textContent = "L'équipe est disponible à partir de la formule Pro.";
    messageEl.style.color = 'red';
    return;
  }
  if (!auMoins('premium')) {
    const { count } = await supabaseClient
      .from('personnel')
      .select('*', { count: 'exact', head: true })
      .eq('vendeur_id', vendeurConnecte.id)
      .eq('actif', true);
    if ((count || 0) >= 5) {
      messageEl.textContent = "Limite de 5 personnes atteinte avec la formule Pro. Passez en Premium pour continuer.";
      messageEl.style.color = 'red';
      return;
    }
  }
  const nom = document.getElementById('nouveau-staff-nom').value.trim();
  const fichier = document.getElementById('nouveau-staff-fichier').files[0];
  if (!nom) { messageEl.textContent = "Le nom est obligatoire."; messageEl.style.color = 'red'; return; }

  let photo_url = '';
  if (fichier) {
    const nomFichier = `${vendeurConnecte.id}/${Date.now()}-${fichier.name}`;
    const { error: erreurUpload } = await supabaseClient.storage.from('personnel-images').upload(nomFichier, fichier);
    if (!erreurUpload) {
      const { data: pub } = supabaseClient.storage.from('personnel-images').getPublicUrl(nomFichier);
      photo_url = pub.publicUrl;
    }
  }

  const { error } = await supabaseClient.from('personnel').insert({ vendeur_id: vendeurConnecte.id, nom, photo_url });
  if (error) { messageEl.textContent = "Erreur lors de l'ajout."; messageEl.style.color = 'red'; return; }

  messageEl.textContent = "Personne ajoutée ✓";
  messageEl.style.color = 'green';
  document.getElementById('nouveau-staff-nom').value = '';
  document.getElementById('nouveau-staff-fichier').value = '';
  await chargerPersonnel();
}

async function supprimerPersonnel(id) {
  await supabaseClient.from('personnel').update({ actif: false }).eq('id', id);
  await chargerPersonnel();
}

// ============================================
// DISPONIBILITÉS
// ============================================
function initDisponibilites() {
  document.getElementById('dispo-max-jour').value = vendeurConnecte.rdv_max_par_jour || 8;
  document.getElementById('dispo-heure-ouverture').value = (vendeurConnecte.heure_ouverture || '09:00').slice(0, 5);
  document.getElementById('dispo-heure-fermeture').value = (vendeurConnecte.heure_fermeture || '18:00').slice(0, 5);
  document.getElementById('carte-blocage-horaire').classList.toggle('verrouille', !auMoins('pro'));

  const joursFermes = vendeurConnecte.jours_fermeture_recurrents || [0];
  document.querySelectorAll('#dispo-jours span').forEach(span => {
    const jour = parseInt(span.dataset.jour);
    span.classList.toggle('off', joursFermes.includes(jour));
    span.onclick = () => span.classList.toggle('off');
  });

  chargerJoursBloques();
}

async function chargerJoursBloques() {
  const { data } = await supabaseClient
    .from('jours_bloques')
    .select('date')
    .eq('vendeur_id', vendeurConnecte.id);

  const datesExistantes = (data || []).map(d => d.date);

  window._flatpickrDispo = flatpickr("#calendar-block", {
    mode: "multiple",
    minDate: "today",
    dateFormat: "Y-m-d",
    defaultDate: datesExistantes
  });
}

async function enregistrerHoraires() {
  const heure_ouverture = document.getElementById('dispo-heure-ouverture').value;
  const heure_fermeture = document.getElementById('dispo-heure-fermeture').value;
  const messageEl = document.getElementById('horaires-message');

  const { error } = await supabaseClient
    .from('vendeurs')
    .update({ heure_ouverture, heure_fermeture })
    .eq('id', vendeurConnecte.id);

  if (error) { messageEl.textContent = "Erreur lors de l'enregistrement."; messageEl.style.color = 'red'; return; }

  vendeurConnecte.heure_ouverture = heure_ouverture;
  vendeurConnecte.heure_fermeture = heure_fermeture;
  messageEl.textContent = "Horaires enregistrés ✓";
  messageEl.style.color = 'green';
}

async function ajouterBlocageHoraire() {
  if (!auMoins('pro')) return;
  const date = document.getElementById('blocage-date').value;
  const heure_debut = document.getElementById('blocage-heure-debut').value;
  const heure_fin = document.getElementById('blocage-heure-fin').value;
  const personnel_id = document.getElementById('blocage-personnel').value || null;
  const messageEl = document.getElementById('blocage-message');

  if (!date || !heure_debut || !heure_fin) {
    messageEl.textContent = "Date, heure de début et de fin sont obligatoires.";
    messageEl.style.color = 'red';
    return;
  }
  if (heure_fin <= heure_debut) {
    messageEl.textContent = "L'heure de fin doit être après l'heure de début.";
    messageEl.style.color = 'red';
    return;
  }

  const { error } = await supabaseClient.from('blocages_horaires').insert({
    vendeur_id: vendeurConnecte.id, personnel_id, date, heure_debut, heure_fin
  });

  if (error) { messageEl.textContent = "Erreur lors de l'ajout."; messageEl.style.color = 'red'; return; }

  messageEl.textContent = "Créneau bloqué ✓";
  messageEl.style.color = 'green';
  document.getElementById('blocage-date').value = '';
  document.getElementById('blocage-heure-debut').value = '';
  document.getElementById('blocage-heure-fin').value = '';
  await chargerBlocagesHoraires();
}

async function chargerBlocagesHoraires() {
  const { data } = await supabaseClient
    .from('blocages_horaires')
    .select('*, personnel(nom)')
    .eq('vendeur_id', vendeurConnecte.id)
    .gte('date', new Date().toISOString().split('T')[0])
    .order('date', { ascending: true });

  const liste = document.getElementById('liste-blocages-horaires');
  if (!data || !data.length) { liste.innerHTML = '<p class="empty-state">Aucun créneau bloqué à venir.</p>'; return; }

  liste.innerHTML = data.map(b => `
    <div class="row">
      <div class="row-infos">
        <strong>${b.date} · ${b.heure_debut.slice(0,5)} - ${b.heure_fin.slice(0,5)}</strong>
        <span class="sub">${b.personnel ? b.personnel.nom : "Toute l'équipe"}</span>
      </div>
      <div class="row-actions"><button class="icon-btn danger" onclick="supprimerBlocageHoraire('${b.id}')"><i class="fa-solid fa-trash"></i></button></div>
    </div>`).join('');
}

async function supprimerBlocageHoraire(id) {
  await supabaseClient.from('blocages_horaires').delete().eq('id', id);
  await chargerBlocagesHoraires();
}


async function enregistrerDisponibilites() {
  const max = parseInt(document.getElementById('dispo-max-jour').value) || 8;
  const joursFermes = [...document.querySelectorAll('#dispo-jours span.off')].map(s => parseInt(s.dataset.jour));
  const messageEl = document.getElementById('dispo-message');

  await supabaseClient.from('vendeurs').update({
    rdv_max_par_jour: max,
    jours_fermeture_recurrents: joursFermes
  }).eq('id', vendeurConnecte.id);

  // Resynchronise les jours bloqués : on supprime tout puis on réinsère la sélection actuelle
  const datesSelectionnees = window._flatpickrDispo.selectedDates.map(d => d.toISOString().split('T')[0]);
  await supabaseClient.from('jours_bloques').delete().eq('vendeur_id', vendeurConnecte.id);
  if (datesSelectionnees.length) {
    await supabaseClient.from('jours_bloques').insert(
      datesSelectionnees.map(date => ({ vendeur_id: vendeurConnecte.id, date }))
    );
  }

  vendeurConnecte.rdv_max_par_jour = max;
  vendeurConnecte.jours_fermeture_recurrents = joursFermes;

  messageEl.textContent = "Disponibilités enregistrées ✓";
  messageEl.style.color = 'green';
}

// ============================================
// GALERIE
// ============================================
async function chargerGalerie() {
  const { data } = await supabaseClient
    .from('galerie')
    .select('*')
    .eq('vendeur_id', vendeurConnecte.id)
    .order('ordre', { ascending: true });

  const grid = document.getElementById('gal-grid');
  const addBtn = grid.querySelector('.gal-add');
  grid.innerHTML = '';

  (data || []).forEach(photo => {
    const el = document.createElement('div');
    el.className = 'gal-thumb';
    el.innerHTML = `<img src="${photo.image_url}"><div class="del" onclick="supprimerPhotoGalerie('${photo.id}')">✕</div>`;
    grid.appendChild(el);
  });

  grid.appendChild(addBtn);
}

async function ajouterPhotoGalerie(fichier) {
  if (!fichier) return;
  const messageEl = document.getElementById('galerie-message');
  const nomFichier = `${vendeurConnecte.id}/${Date.now()}-${fichier.name}`;

  const { error: erreurUpload } = await supabaseClient.storage.from('galerie').upload(nomFichier, fichier);
  if (erreurUpload) { messageEl.textContent = "Erreur lors de l'envoi."; messageEl.style.color = 'red'; return; }

  const { data: pub } = supabaseClient.storage.from('galerie').getPublicUrl(nomFichier);
  await supabaseClient.from('galerie').insert({ vendeur_id: vendeurConnecte.id, image_url: pub.publicUrl });

  messageEl.textContent = "Photo ajoutée ✓";
  messageEl.style.color = 'green';
  document.getElementById('gal-input').value = '';
  await chargerGalerie();
}

async function supprimerPhotoGalerie(id) {
  await supabaseClient.from('galerie').delete().eq('id', id);
  await chargerGalerie();
}

// ============================================
// AVIS (table partagée avec les boutiques produits)
// ============================================
async function chargerAvisAModerer() {
  const { data: enAttente } = await supabaseClient
    .from('avis').select('*')
    .eq('vendeur_id', vendeurConnecte.id).eq('statut', 'en_attente')
    .order('date_creation', { ascending: false });

  const { data: approuves } = await supabaseClient
    .from('avis').select('*')
    .eq('vendeur_id', vendeurConnecte.id).eq('statut', 'approuve')
    .order('date_creation', { ascending: false }).limit(20);

  const listeAttente = document.getElementById('liste-avis-attente');
  const listeApprouves = document.getElementById('liste-avis-approuves');

  listeAttente.innerHTML = (!enAttente || !enAttente.length)
    ? '<p class="empty-state">Aucun avis en attente.</p>'
    : enAttente.map(a => `
        <div class="row" style="flex-direction:column;align-items:flex-start;">
          <strong>${a.nom_client}</strong> — ${'★'.repeat(a.note)}${'☆'.repeat(5 - a.note)}
          <small style="color:#999;">${a.commentaire || ''}</small>
          <div style="margin-top:8px;display:flex;gap:8px;">
            <button class="admin-btn" style="width:auto;padding:8px 14px;" onclick="modererAvis('${a.id}','approuve')">Approuver</button>
            <button class="admin-btn secondaire" style="width:auto;padding:8px 14px;" onclick="modererAvis('${a.id}','rejete')">Rejeter</button>
          </div>
        </div>`).join('');

  listeApprouves.innerHTML = (!approuves || !approuves.length)
    ? '<p class="empty-state">Aucun avis publié pour le moment.</p>'
    : approuves.map(a => `
        <div class="row" style="flex-direction:column;align-items:flex-start;">
          <strong>${a.nom_client}</strong> — ${'★'.repeat(a.note)}${'☆'.repeat(5 - a.note)}
          <small style="color:#999;">${a.commentaire || ''}</small>
        </div>`).join('');
}

async function modererAvis(id, statut) {
  await supabaseClient.from('avis').update({ statut }).eq('id', id);
  await chargerAvisAModerer();
}

// ============================================
// FAQ (table partagée)
// ============================================
async function chargerFAQAdmin() {
  const { data: faqs } = await supabaseClient
    .from('faq').select('*')
    .eq('vendeur_id', vendeurConnecte.id)
    .order('ordre', { ascending: true });

  const liste = document.getElementById('liste-faq-admin');
  if (!faqs || !faqs.length) { liste.innerHTML = '<p class="empty-state">Aucune question pour le moment.</p>'; return; }

  liste.innerHTML = faqs.map(f => `
    <div class="row">
      <div class="row-infos"><strong>${f.question}</strong><span class="sub">${f.reponse}</span></div>
      <div class="row-actions"><button class="icon-btn danger" onclick="supprimerFAQ('${f.id}')"><i class="fa-solid fa-trash"></i></button></div>
    </div>`).join('');
}

async function ajouterFAQ() {
  const question = document.getElementById('nouvelle-faq-question').value.trim();
  const reponse = document.getElementById('nouvelle-faq-reponse').value.trim();
  const messageEl = document.getElementById('faq-message');
  if (!question || !reponse) { messageEl.textContent = "Question et réponse obligatoires."; messageEl.style.color = 'red'; return; }

  if (!auMoins('pro')) {
    const { count } = await supabaseClient.from('faq').select('*', { count: 'exact', head: true }).eq('vendeur_id', vendeurConnecte.id);
    if ((count || 0) >= 5) { messageEl.textContent = "Limite de 5 questions (formule Standard)."; messageEl.style.color = 'red'; return; }
  }

  const { error } = await supabaseClient.from('faq').insert({ vendeur_id: vendeurConnecte.id, question, reponse });
  if (error) { messageEl.textContent = "Erreur lors de l'ajout."; messageEl.style.color = 'red'; return; }

  messageEl.textContent = "Question ajoutée ✓"; messageEl.style.color = 'green';
  document.getElementById('nouvelle-faq-question').value = '';
  document.getElementById('nouvelle-faq-reponse').value = '';
  await chargerFAQAdmin();
}

async function supprimerFAQ(id) {
  await supabaseClient.from('faq').delete().eq('id', id);
  await chargerFAQAdmin();
}

// ============================================
// RÉGLAGES / INFOS
// ============================================
function remplirInfosVendeur() {
  document.getElementById('info-whatsapp').value = vendeurConnecte.numero_whatsapp || '';
  document.getElementById('info-wave').value = vendeurConnecte.wave_numero || '';
  document.getElementById('info-om').value = vendeurConnecte.om_numero || '';
  document.getElementById('info-adresse').value = vendeurConnecte.adresse || '';
  document.getElementById('info-instagram').value = vendeurConnecte.instagram || '';
  document.getElementById('info-tiktok').value = vendeurConnecte.tiktok || '';
  document.getElementById('info-facebook').value = vendeurConnecte.facebook || '';
}

async function enregistrerInfos() {
  const numero_whatsapp = document.getElementById('info-whatsapp').value.trim();
  const wave_numero = document.getElementById('info-wave').value.trim();
  const om_numero = document.getElementById('info-om').value.trim();
  const adresse = document.getElementById('info-adresse').value.trim();
  const instagram = document.getElementById('info-instagram').value.trim();
  const tiktok = document.getElementById('info-tiktok').value.trim();
  const facebook = document.getElementById('info-facebook').value.trim();
  const messageEl = document.getElementById('info-message');
  if (!numero_whatsapp) { messageEl.textContent = "Le numéro WhatsApp est obligatoire."; messageEl.style.color = 'red'; return; }

  const { error } = await supabaseClient.from('vendeurs').update({ numero_whatsapp, wave_numero, om_numero, adresse, instagram, tiktok, facebook }).eq('id', vendeurConnecte.id);
  if (error) { messageEl.textContent = "Erreur lors de l'enregistrement."; messageEl.style.color = 'red'; return; }

  vendeurConnecte.numero_whatsapp = numero_whatsapp;
  vendeurConnecte.adresse = adresse;
  vendeurConnecte.instagram = instagram;
  vendeurConnecte.tiktok = tiktok;
  vendeurConnecte.facebook = facebook;
  messageEl.textContent = "Informations mises à jour ✓"; messageEl.style.color = 'green';
}

function genererQRCode() {
  const imgEl = document.getElementById('qr-code-boutique');
  const lienEl = document.getElementById('qr-code-lien');
  const telechargerEl = document.getElementById('qr-code-telecharger');
  if (!vendeurConnecte || !vendeurConnecte.slug) return;

  const lienBoutique = `https://shop.moncmd.site/${vendeurConnecte.slug}`;
  const urlQRCode = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(lienBoutique)}`;
  imgEl.src = urlQRCode;
  lienEl.textContent = lienBoutique;
  telechargerEl.href = urlQRCode;
  telechargerEl.download = `qr-code-${vendeurConnecte.slug}.png`;
}

// ============================================
// STATS / DASHBOARD
// ============================================
async function chargerStats() {
  const debutMois = new Date(); debutMois.setDate(1); debutMois.setHours(0,0,0,0);
  const debutMoisStr = debutMois.toISOString().split('T')[0];

  const { data: rdvMois } = await supabaseClient
    .from('rendez_vous')
    .select('prestation_id, prestations(nom, prix)')
    .eq('vendeur_id', vendeurConnecte.id)
    .gte('date', debutMoisStr);

  const rdv = rdvMois || [];
  document.getElementById('stat-rdv-mois').textContent = rdv.length;

  const total = rdv.reduce((s, r) => s + (r.prestations ? r.prestations.prix : 0), 0);
  document.getElementById('stat-ca-mois').textContent = total >= 1000 ? `${Math.round(total/1000)}k` : total;
  document.getElementById('stat-panier-moyen').textContent = rdv.length ? Math.round(total / rdv.length).toLocaleString('fr-FR') : '—';

  const compteurs = {};
  rdv.forEach(r => { if (r.prestations) compteurs[r.prestations.nom] = (compteurs[r.prestations.nom] || 0) + 1; });
  const top = Object.entries(compteurs).sort((a,b) => b[1]-a[1])[0];
  document.getElementById('stat-top-prestation').textContent = top ? top[0] : '—';

  if (auMoins('pro')) {
    const { data: depenses } = await supabaseClient
      .from('depenses').select('montant')
      .eq('vendeur_id', vendeurConnecte.id).gte('date_creation', debutMois.toISOString());
    const totalDepenses = (depenses || []).reduce((s, d) => s + d.montant, 0);
    if (auMoins('premium')) {
      document.getElementById('stat-benefice-net').textContent = (total - totalDepenses).toLocaleString('fr-FR');
    }
  }
}

async function ajouterDepense() {
  if (!auMoins('pro')) return;
  const montant = parseInt(document.getElementById('depense-montant').value);
  const note = document.getElementById('depense-note').value.trim();
  if (!montant) return;

  await supabaseClient.from('depenses').insert({ vendeur_id: vendeurConnecte.id, montant, note });
  document.getElementById('depense-montant').value = '';
  document.getElementById('depense-note').value = '';
  await chargerStats();
}

async function chargerGraphique7Jours() {
  const jours = ['Di','Lu','Ma','Me','Je','Ve','Sa'];
  const container = document.getElementById('chart-bars-rdv');
  const compteurs = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const { count } = await supabaseClient
      .from('rendez_vous').select('*', { count: 'exact', head: true })
      .eq('vendeur_id', vendeurConnecte.id).eq('date', dateStr);
    compteurs.push({ label: jours[d.getDay()], count: count || 0 });
  }

  const max = Math.max(1, ...compteurs.map(c => c.count));
  container.innerHTML = compteurs.map(c => `
    <div class="chart-bar-col">
      <div class="chart-bar" style="height:${Math.max(4, (c.count/max)*100)}%;"></div>
      <div class="chart-bar-label">${c.label}</div>
    </div>`).join('');
}

async function chargerDernieresDemandes() {
  const { data } = await supabaseClient
    .from('rendez_vous')
    .select('nom_client, date, prestations(nom), personnel(nom)')
    .eq('vendeur_id', vendeurConnecte.id)
    .order('date_creation', { ascending: false })
    .limit(5);

  const container = document.getElementById('liste-dernieres-demandes');
  if (!data || !data.length) { container.innerHTML = '<p class="empty-state">Aucune demande pour le moment.</p>'; return; }

  container.innerHTML = data.map(r => `
    <div class="row">
      <div class="row-infos">
        <strong>${r.nom_client || 'Client'}</strong>
        <span class="sub">${r.prestations ? r.prestations.nom : ''} — ${r.personnel ? r.personnel.nom : "N'importe qui"}</span>
      </div>
      <span class="badge">${r.date}</span>
    </div>`).join('');
}
