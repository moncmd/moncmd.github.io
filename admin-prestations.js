// ============================================
// CMD. — admin-prestations.js
// Login vendeur + dashboard prestataire (mêmes conventions que admin.js)
// ============================================

let vendeurConnecte = null;
let prestationsCache = [];
let personnelCache = [];
let personnelEnEdition = null; // id de la personne en cours de modification, null = mode "ajout"
let prestationEnEdition = null; // id de la prestation en cours de modification, null = mode "ajout"

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

  // Recharge les données à chaque ouverture de l'onglet, pour ne jamais
  // afficher des chiffres/listes périmés (ex: une réservation vient d'arriver
  // pendant que la vendeuse était sur un autre onglet).
  if (nom === 'agenda') chargerAgenda();
  if (nom === 'dashboard') { chargerStats(); chargerGraphique7Jours(); chargerDernieresDemandes(); }
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
    chargerDernieresDemandes(),
    chargerAgenda()
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
    .order('ordre', { ascending: true });

  prestationsCache = data || [];
  const liste = document.getElementById('liste-prestations');
  document.getElementById('stat-prestations-actives').textContent = prestationsCache.length;

  if (!prestationsCache.length) {
    liste.innerHTML = '<p class="empty-state">Aucune prestation pour le moment.</p>';
    return;
  }

  liste.innerHTML = prestationsCache.map((p, index) => `
    <div class="row">
      <img class="row-thumb" src="${p.image_url || ''}">
      <div class="row-infos"><strong>${p.nom}</strong><span class="sub">${p.categorie ? p.categorie + ' · ' : ''}${p.prix.toLocaleString('fr-FR')} FCFA · ${p.duree_minutes} min</span></div>
      <div class="row-actions">
        <button class="icon-btn" ${index === 0 ? 'disabled style="opacity:0.3;"' : ''} onclick="deplacerPrestation('${p.id}', -1)"><i class="fa-solid fa-arrow-up"></i></button>
        <button class="icon-btn" ${index === prestationsCache.length - 1 ? 'disabled style="opacity:0.3;"' : ''} onclick="deplacerPrestation('${p.id}', 1)"><i class="fa-solid fa-arrow-down"></i></button>
        <button class="icon-btn" onclick="ouvrirEditionPrestation('${p.id}')"><i class="fa-solid fa-pen"></i></button>
        <button class="icon-btn danger" onclick="supprimerPrestation('${p.id}')"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>
  `).join('');

  const datalistCategories = document.getElementById('liste-categories-existantes');
  if (datalistCategories) {
    const categories = [...new Set(prestationsCache.map(p => p.categorie).filter(Boolean))];
    datalistCategories.innerHTML = categories.map(c => `<option value="${c}">`).join('');
  }

  const selectRdvPrestation = document.getElementById('manuel-rdv-prestation');
  if (selectRdvPrestation) {
    selectRdvPrestation.innerHTML = '<option value="">Choisir une prestation</option>' +
      prestationsCache.map(p => `<option value="${p.id}">${p.nom} (${p.duree_minutes} min)</option>`).join('');
  }
}

// Échange l'ordre de la prestation avec sa voisine immédiate (direction : -1 = monter, 1 = descendre)
async function deplacerPrestation(id, direction) {
  const index = prestationsCache.findIndex(p => p.id === id);
  const indexVoisin = index + direction;
  if (indexVoisin < 0 || indexVoisin >= prestationsCache.length) return;

  const actuelle = prestationsCache[index];
  const voisine = prestationsCache[indexVoisin];

  await supabaseClient.from('prestations').update({ ordre: voisine.ordre }).eq('id', actuelle.id);
  await supabaseClient.from('prestations').update({ ordre: actuelle.ordre }).eq('id', voisine.id);

  await chargerPrestations();
}

// Pré-remplit le formulaire "Ajouter une prestation" avec les valeurs de la
// prestation choisie, et le fait basculer en mode "modification".
function ouvrirEditionPrestation(id) {
  const p = prestationsCache.find(x => x.id === id);
  if (!p) return;

  prestationEnEdition = id;

  document.getElementById('nouveau-presta-nom').value = p.nom;
  document.getElementById('nouveau-presta-prix').value = p.prix;
  document.getElementById('nouveau-presta-duree').value = p.duree_minutes;
  document.getElementById('nouveau-presta-prix-variable').checked = !!p.prix_variable;
  document.getElementById('nouveau-presta-categorie').value = p.categorie || '';
  document.getElementById('nouveau-presta-fichier').value = '';

  const idsAssignes = (p.personnel_prestations || []).map(l => l.personnel_id);
  document.querySelectorAll('#nouveau-presta-personnel .staff-pill').forEach(el => {
    el.classList.toggle('actif', idsAssignes.includes(el.dataset.id));
  });

  document.getElementById('presta-form-titre').innerHTML = '<i class="fa-solid fa-pen"></i> Modifier la prestation';
  document.getElementById('presta-photo-optionnelle').style.display = 'inline';
  document.getElementById('btn-submit-presta').textContent = 'Enregistrer les modifications';
  document.getElementById('btn-annuler-edition-presta').style.display = 'block';
  document.getElementById('presta-message').textContent = '';

  document.getElementById('onglet-prestations').scrollIntoView({ behavior: 'smooth' });
}

// Annule le mode édition et remet le formulaire en mode "ajout"
function annulerEditionPrestation() {
  prestationEnEdition = null;

  document.getElementById('nouveau-presta-nom').value = '';
  document.getElementById('nouveau-presta-prix').value = '';
  document.getElementById('nouveau-presta-duree').value = 30;
  document.getElementById('nouveau-presta-prix-variable').checked = false;
  document.getElementById('nouveau-presta-categorie').value = '';
  document.getElementById('nouveau-presta-fichier').value = '';
  document.querySelectorAll('#nouveau-presta-personnel .staff-pill').forEach(el => el.classList.remove('actif'));

  document.getElementById('presta-form-titre').innerHTML = '<i class="fa-solid fa-plus"></i> Ajouter une prestation';
  document.getElementById('presta-photo-optionnelle').style.display = 'none';
  document.getElementById('btn-submit-presta').textContent = 'Ajouter la prestation';
  document.getElementById('btn-annuler-edition-presta').style.display = 'none';
  document.getElementById('presta-message').textContent = '';
}

async function ajouterPrestation() {
  const nom = document.getElementById('nouveau-presta-nom').value.trim();
  const prix = parseInt(document.getElementById('nouveau-presta-prix').value);
  const duree_minutes = parseInt(document.getElementById('nouveau-presta-duree').value) || 30;
  const categorie = document.getElementById('nouveau-presta-categorie').value.trim() || null;
  const prix_variable = document.getElementById('nouveau-presta-prix-variable').checked;
  const fichier = document.getElementById('nouveau-presta-fichier').files[0];
  const personnelIds = Array.from(document.querySelectorAll('#nouveau-presta-personnel .staff-pill.actif')).map(el => el.dataset.id);
  const messageEl = document.getElementById('presta-message');

  if (!nom || !prix) {
    messageEl.textContent = "Nom et prix sont obligatoires.";
    messageEl.style.color = 'red';
    return;
  }

  const modeEdition = !!prestationEnEdition;

  // La limite de formule ne s'applique qu'à la création, pas à la modification
  // d'une prestation déjà existante.
  if (!modeEdition && !auMoins('premium')) {
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

  // En mode édition, l'image n'est ré-uploadée que si un nouveau fichier a été choisi ;
  // sinon on garde l'URL déjà enregistrée (undefined = champ non touché par le .update()).
  let image_url = modeEdition ? undefined : '';
  if (fichier) {
    const nomFichier = `${vendeurConnecte.id}/${Date.now()}-${fichier.name}`;
    const { error: erreurUpload } = await supabaseClient.storage.from('prestations-images').upload(nomFichier, fichier);
    if (!erreurUpload) {
      const { data: pub } = supabaseClient.storage.from('prestations-images').getPublicUrl(nomFichier);
      image_url = pub.publicUrl;
    }
  }

  const donnees = { nom, prix, duree_minutes, categorie, prix_variable };
  if (image_url !== undefined) donnees.image_url = image_url;

  let prestationConcernee;

  if (modeEdition) {
    const { data, error } = await supabaseClient
      .from('prestations')
      .update(donnees)
      .eq('id', prestationEnEdition)
      .select()
      .single();

    if (error) { messageEl.textContent = "Erreur lors de la modification."; messageEl.style.color = 'red'; return; }
    prestationConcernee = data;

    // Met à jour l'assignation personnel : on retire l'ancienne puis on remet la nouvelle
    await supabaseClient.from('personnel_prestations').delete().eq('prestation_id', prestationEnEdition);
  } else {
    const ordreSuivant = prestationsCache.length
      ? Math.max(...prestationsCache.map(p => p.ordre || 0)) + 1
      : 0;

    const { data, error } = await supabaseClient
      .from('prestations')
      .insert({ vendeur_id: vendeurConnecte.id, ordre: ordreSuivant, ...donnees })
      .select()
      .single();

    if (error) { messageEl.textContent = "Erreur lors de l'ajout."; messageEl.style.color = 'red'; return; }
    prestationConcernee = data;
  }

  if (personnelIds.length && prestationConcernee) {
    await supabaseClient.from('personnel_prestations').insert(
      personnelIds.map(personnel_id => ({ personnel_id, prestation_id: prestationConcernee.id }))
    );
  }

  annulerEditionPrestation(); // remet le formulaire à zéro et repasse en mode "ajout"
  messageEl.textContent = modeEdition ? "Prestation modifiée ✓" : "Prestation ajoutée ✓";
  messageEl.style.color = 'green';

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

  const conteneurPersonnel = document.getElementById('nouveau-presta-personnel');
  if (conteneurPersonnel) {
    conteneurPersonnel.innerHTML = personnelCache.length
      ? personnelCache.map(p => `<span class="staff-pill" data-id="${p.id}" onclick="this.classList.toggle('actif')">${p.nom}</span>`).join('')
      : '<p class="empty-state" style="padding:2px 0;">Ajoutez d\'abord des membres dans l\'onglet Équipe.</p>';
  }

  const selectBlocage = document.getElementById('blocage-personnel');
  if (selectBlocage) {
    selectBlocage.innerHTML = '<option value="">Toute l\'équipe</option>' +
      personnelCache.map(p => `<option value="${p.id}">${p.nom}</option>`).join('');
  }

  const selectRdvPersonnel = document.getElementById('manuel-rdv-personnel');
  if (selectRdvPersonnel) {
    selectRdvPersonnel.innerHTML = '<option value="">Toute l\'équipe / peu importe</option>' +
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
        <button class="icon-btn" onclick="ouvrirEditionPersonnel('${p.id}')"><i class="fa-solid fa-pen"></i></button>
        <button class="icon-btn danger" onclick="supprimerPersonnel('${p.id}')"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>
  `).join('');
}

// Pré-remplit le formulaire avec les valeurs de la personne choisie, et le
// fait basculer en mode "modification" (même schéma que l'édition de prestation).
function ouvrirEditionPersonnel(id) {
  const p = personnelCache.find(x => x.id === id);
  if (!p) return;

  personnelEnEdition = id;

  document.getElementById('nouveau-staff-nom').value = p.nom;
  document.getElementById('nouveau-staff-fichier').value = '';

  document.getElementById('staff-photo-optionnelle').style.display = 'inline';
  document.getElementById('lien-supprimer-photo-staff').style.display = p.photo_url ? 'block' : 'none';
  document.getElementById('btn-submit-staff').textContent = 'Enregistrer les modifications';
  document.getElementById('btn-annuler-edition-staff').style.display = 'block';
  document.getElementById('staff-message').textContent = '';

  document.getElementById('carte-equipe').scrollIntoView({ behavior: 'smooth' });
}

// Supprime la photo actuelle de la personne en cours d'édition (sans attendre
// l'enregistrement du reste du formulaire) — action immédiate en base.
async function supprimerPhotoPersonnel() {
  if (!personnelEnEdition) return;
  if (!confirm('Supprimer la photo de cette personne ?')) return;

  const { error } = await supabaseClient
    .from('personnel')
    .update({ photo_url: null })
    .eq('id', personnelEnEdition);

  const messageEl = document.getElementById('staff-message');
  if (error) { messageEl.textContent = "Erreur lors de la suppression."; messageEl.style.color = 'red'; return; }

  document.getElementById('lien-supprimer-photo-staff').style.display = 'none';
  messageEl.textContent = "Photo supprimée ✓";
  messageEl.style.color = 'green';

  await chargerPersonnel();
  // chargerPersonnel() réaffiche la liste, mais reste en mode édition pour cette personne
  ouvrirEditionPersonnel(personnelEnEdition);
}

// Annule le mode édition et remet le formulaire en mode "ajout"
function annulerEditionPersonnel() {
  personnelEnEdition = null;

  document.getElementById('nouveau-staff-nom').value = '';
  document.getElementById('nouveau-staff-fichier').value = '';

  document.getElementById('staff-photo-optionnelle').style.display = 'none';
  document.getElementById('lien-supprimer-photo-staff').style.display = 'none';
  document.getElementById('btn-submit-staff').textContent = '+ Ajouter une personne';
  document.getElementById('btn-annuler-edition-staff').style.display = 'none';
  document.getElementById('staff-message').textContent = '';
}

async function ajouterPersonnel() {
  const messageEl = document.getElementById('staff-message');
  const modeEdition = !!personnelEnEdition;

  if (!auMoins('pro')) {
    messageEl.textContent = "L'équipe est disponible à partir de la formule Pro.";
    messageEl.style.color = 'red';
    return;
  }
  // La limite de formule ne s'applique qu'à la création, pas à la modification d'une personne déjà existante.
  if (!modeEdition && !auMoins('premium')) {
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

  // En mode édition, la photo n'est ré-uploadée que si un nouveau fichier a été choisi ;
  // sinon on garde l'URL déjà enregistrée (undefined = champ non touché par le .update()).
  let photo_url = modeEdition ? undefined : '';
  if (fichier) {
    const nomFichier = `${vendeurConnecte.id}/${Date.now()}-${fichier.name}`;
    const { error: erreurUpload } = await supabaseClient.storage.from('personnel-images').upload(nomFichier, fichier);
    if (!erreurUpload) {
      const { data: pub } = supabaseClient.storage.from('personnel-images').getPublicUrl(nomFichier);
      photo_url = pub.publicUrl;
    }
  }

  const donnees = { nom };
  if (photo_url !== undefined) donnees.photo_url = photo_url;

  if (modeEdition) {
    const { error } = await supabaseClient.from('personnel').update(donnees).eq('id', personnelEnEdition);
    if (error) { messageEl.textContent = "Erreur lors de la modification."; messageEl.style.color = 'red'; return; }
  } else {
    const { error } = await supabaseClient.from('personnel').insert({ vendeur_id: vendeurConnecte.id, ...donnees });
    if (error) { messageEl.textContent = "Erreur lors de l'ajout."; messageEl.style.color = 'red'; return; }
  }

  annulerEditionPersonnel(); // remet le formulaire à zéro et repasse en mode "ajout"
  messageEl.textContent = modeEdition ? "Personne modifiée ✓" : "Personne ajoutée ✓";
  messageEl.style.color = 'green';

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
    .select('prestation_id, statut, prestations(nom, prix)')
    .eq('vendeur_id', vendeurConnecte.id)
    .gte('date', debutMoisStr);

  const tousLesRdv = rdvMois || [];
  const rdv = tousLesRdv.filter(r => r.statut !== 'annule'); // les annulés ne comptent plus dans le CA/nombre de RDV
  const annules = tousLesRdv.filter(r => r.statut === 'annule');

  document.getElementById('stat-rdv-mois').textContent = rdv.length;
  document.getElementById('stat-annules').textContent = annules.length;

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

let calendrierAgenda = null;

async function chargerAgenda() {
  const { data, error } = await supabaseClient
    .from('rendez_vous')
    .select('id, nom_client, numero_client, lieu, adresse_client, date, heure, duree_minutes, prestation_id, personnel_id, statut, prestations(nom), personnel(nom)')
    .eq('vendeur_id', vendeurConnecte.id);

  const conteneur = document.getElementById('calendrier-agenda');
  if (!conteneur) return;

  if (error) {
    console.error('Erreur chargement agenda :', error);
    conteneur.innerHTML = `<p class="empty-state" style="color:#e00;">Erreur de chargement (${error.message}). Ouvre la console (F12) pour le détail.</p>`;
    return;
  }

  // Une couleur stable par prestataire, pour repérer visuellement qui fait quoi d'un coup d'œil
  const couleurs = ['#e56400', '#2a9d8f', '#8a4fff', '#e0527a', '#3f7cff', '#c9a227'];
  const couleurPersonnel = {};
  let indexCouleur = 0;
  function couleurPour(id) {
    if (!id) return '#999';
    if (!couleurPersonnel[id]) couleurPersonnel[id] = couleurs[indexCouleur++ % couleurs.length];
    return couleurPersonnel[id];
  }

  const evenements = (data || []).map(r => {
    if (!r.date || !r.heure) return null;
    const debut = `${r.date}T${r.heure.slice(0,5)}:00`;
    const finDate = new Date(debut);
    finDate.setMinutes(finDate.getMinutes() + (r.duree_minutes || 30));

    const statut = r.statut || 'en_attente';
    // Le statut de paiement teinte visuellement l'événement, indépendamment de la couleur du prestataire
    const couleurBase = couleurPour(r.personnel_id);
    const styleParStatut = statut === 'paye'
      ? { backgroundColor: couleurBase, borderColor: couleurBase, textColor: '#fff' }
      : statut === 'annule'
      ? { backgroundColor: '#eee', borderColor: '#ccc', textColor: '#999' }
      : { backgroundColor: couleurBase, borderColor: couleurBase, textColor: '#fff' }; // en_attente = couleur normale

    return {
      id: r.id,
      title: `${statut === 'annule' ? '❌ ' : statut === 'paye' ? '✓ ' : ''}${r.nom_client || 'Client'} — ${r.prestations ? r.prestations.nom : ''}`,
      start: debut,
      end: finDate.toISOString().slice(0, 19),
      backgroundColor: styleParStatut.backgroundColor,
      borderColor: styleParStatut.borderColor,
      textColor: styleParStatut.textColor,
      classNames: statut === 'annule' ? ['rdv-annule'] : [],
      extendedProps: {
        nomClient: r.nom_client || '',
        numero: r.numero_client || '',
        lieu: r.lieu === 'domicile' ? `À domicile${r.adresse_client ? ' — ' + r.adresse_client : ''}` : 'En boutique',
        prestationId: r.prestation_id,
        personnelId: r.personnel_id,
        date: r.date,
        heure: r.heure.slice(0,5),
        statut
      }
    };
  }).filter(Boolean);

  if (!calendrierAgenda) {
    const estMobile = window.innerWidth < 700;

    calendrierAgenda = new FullCalendar.Calendar(conteneur, {
      locale: 'fr',
      initialView: estMobile ? 'timeGridDay' : 'timeGridWeek',
      headerToolbar: { left: 'prev,next today', center: 'title', right: 'timeGridDay,timeGridWeek,dayGridMonth' },
      buttonText: { today: "Auj.", day: 'J', week: 'S', month: 'M' },
      slotMinTime: (vendeurConnecte.heure_ouverture || '08:00').slice(0,5) + ':00',
      slotMaxTime: (vendeurConnecte.heure_fermeture || '20:00').slice(0,5) + ':00',
      height: 'auto',
      nowIndicator: true,
      allDaySlot: false,
      dayMaxEventRows: 3,
      events: evenements,
      eventClick: (info) => ouvrirModalEditionRdv(info.event),
      windowResize: () => {
        const mobileMaintenant = window.innerWidth < 700;
        const vueActuelle = calendrierAgenda.view.type;
        if (mobileMaintenant && vueActuelle === 'timeGridWeek') calendrierAgenda.changeView('timeGridDay');
        if (!mobileMaintenant && vueActuelle === 'timeGridDay') calendrierAgenda.changeView('timeGridWeek');
      }
    });
    calendrierAgenda.render();
  } else {
    calendrierAgenda.removeAllEvents();
    calendrierAgenda.addEventSource(evenements);
  }
}

let idRdvEnEdition = null;

function ouvrirModalEditionRdv(event) {
  const p = event.extendedProps;
  idRdvEnEdition = event.id;

  document.getElementById('edition-rdv-client').textContent = p.nomClient + (p.numero ? ' · ' + p.numero : '');

  const selectPresta = document.getElementById('edition-rdv-prestation');
  selectPresta.innerHTML = prestationsCache.map(pr => `<option value="${pr.id}">${pr.nom}</option>`).join('');
  selectPresta.value = p.prestationId;

  const selectPerso = document.getElementById('edition-rdv-personnel');
  selectPerso.innerHTML = '<option value="">N\'importe qui</option>' + personnelCache.map(pe => `<option value="${pe.id}">${pe.nom}</option>`).join('');
  selectPerso.value = p.personnelId || '';

  document.getElementById('edition-rdv-date').value = p.date;
  document.getElementById('edition-rdv-heure').value = p.heure;
  document.getElementById('edition-rdv-statut').value = p.statut;
  document.getElementById('edition-rdv-message').textContent = '';

  document.getElementById('modal-edition-rdv').style.display = 'flex';
}

function fermerModalEditionRdv() {
  document.getElementById('modal-edition-rdv').style.display = 'none';
  idRdvEnEdition = null;
}

async function enregistrerModifRendezVous() {
  if (!idRdvEnEdition) return;
  const messageEl = document.getElementById('edition-rdv-message');

  const prestationId = document.getElementById('edition-rdv-prestation').value;
  const personnelId = document.getElementById('edition-rdv-personnel').value;
  const date = document.getElementById('edition-rdv-date').value;
  const heure = document.getElementById('edition-rdv-heure').value;
  const statut = document.getElementById('edition-rdv-statut').value;
  const prestation = prestationsCache.find(p => p.id === prestationId);

  const { error } = await supabaseClient
    .from('rendez_vous')
    .update({
      prestation_id: prestationId,
      personnel_id: personnelId || null,
      date, heure,
      duree_minutes: prestation ? prestation.duree_minutes : 30,
      statut
    })
    .eq('id', idRdvEnEdition);

  if (error) { messageEl.textContent = `Erreur : ${error.message}`; messageEl.style.color = 'red'; return; }

  fermerModalEditionRdv();
  await chargerAgenda();
  await chargerStats();
  await chargerGraphique7Jours();
}

async function supprimerRendezVousAgenda() {
  if (!idRdvEnEdition) return;
  if (!confirm('Supprimer définitivement ce rendez-vous ?')) return;

  const { error } = await supabaseClient.from('rendez_vous').delete().eq('id', idRdvEnEdition);
  if (error) { document.getElementById('edition-rdv-message').textContent = `Erreur : ${error.message}`; return; }

  fermerModalEditionRdv();
  await chargerAgenda();
  await chargerStats();
  await chargerGraphique7Jours();
}

// Liste temporaire des services en cours d'ajout pour le rendez-vous manuel
// (avant l'enregistrement final). Remise à zéro après chaque enregistrement.
let servicesRdvManuel = [];

function ajouterServiceRdvManuel() {
  const prestationId = document.getElementById('manuel-rdv-prestation').value;
  const personnelId = document.getElementById('manuel-rdv-personnel').value;
  const messageEl = document.getElementById('manuel-rdv-message');

  if (!prestationId) {
    messageEl.textContent = "Choisissez d'abord une prestation.";
    messageEl.style.color = 'red';
    return;
  }

  const prestation = prestationsCache.find(p => p.id === prestationId);
  const personnel = personnelCache.find(p => p.id === personnelId);

  servicesRdvManuel.push({
    prestationId,
    prestationNom: prestation ? prestation.nom : '',
    duree_minutes: prestation ? prestation.duree_minutes : 30,
    personnelId: personnelId || null,
    personnelNom: personnel ? personnel.nom : "N'importe qui"
  });

  document.getElementById('manuel-rdv-prestation').value = '';
  document.getElementById('manuel-rdv-personnel').value = '';
  messageEl.textContent = '';

  afficherServicesRdvManuel();
}

function retirerServiceRdvManuel(index) {
  servicesRdvManuel.splice(index, 1);
  afficherServicesRdvManuel();
}

function afficherServicesRdvManuel() {
  const conteneur = document.getElementById('liste-services-rdv-manuel');
  if (!servicesRdvManuel.length) { conteneur.innerHTML = ''; return; }

  conteneur.innerHTML = servicesRdvManuel.map((s, i) => `
    <div class="row" style="padding:9px 0;">
      <div class="row-infos">
        <strong style="font-size:13px;">${s.prestationNom}</strong>
        <span class="sub">avec ${s.personnelNom} · ${s.duree_minutes} min</span>
      </div>
      <button class="icon-btn danger" onclick="retirerServiceRdvManuel(${i})"><i class="fa-solid fa-trash"></i></button>
    </div>
  `).join('');
}

// Enregistre tous les services de la liste comme des rendez-vous séquentiels,
// à partir de l'heure de départ choisie — exactement la même logique que le
// flux multi-service côté client (une ligne par service, horaires décalés
// automatiquement selon la durée de chacun, reliées par un groupe_reservation).
async function enregistrerRendezVousManuel() {
  const messageEl = document.getElementById('manuel-rdv-message');
  const nom = document.getElementById('manuel-rdv-nom').value.trim();
  const numero = document.getElementById('manuel-rdv-numero').value.trim();
  const date = document.getElementById('manuel-rdv-date').value;
  const heure = document.getElementById('manuel-rdv-heure').value;

  if (!servicesRdvManuel.length) {
    messageEl.textContent = "Ajoutez au moins un service à la liste.";
    messageEl.style.color = 'red';
    return;
  }
  if (!date || !heure) {
    messageEl.textContent = "Date et heure de départ sont obligatoires.";
    messageEl.style.color = 'red';
    return;
  }

  const groupeId = crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
  const versMinutes = (h) => { const [hh, mm] = h.slice(0,5).split(':').map(Number); return hh * 60 + mm; };
  const formatHM = (m) => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;

  let curseur = versMinutes(heure);
  const lignes = servicesRdvManuel.map(s => {
    const ligne = {
      vendeur_id: vendeurConnecte.id,
      prestation_id: s.prestationId,
      personnel_id: s.personnelId,
      nom_client: nom || null,
      numero_client: numero || null,
      date, heure: formatHM(curseur),
      duree_minutes: s.duree_minutes,
      lieu: 'boutique',
      statut: 'confirme',
      groupe_reservation: groupeId
    };
    curseur += s.duree_minutes;
    return ligne;
  });

  const { error } = await supabaseClient.from('rendez_vous').insert(lignes);
  if (error) {
    console.error('Erreur ajout rendez-vous manuel :', error);
    messageEl.textContent = `Erreur lors de l'ajout : ${error.message}`;
    messageEl.style.color = 'red';
    return;
  }

  messageEl.textContent = `${lignes.length > 1 ? lignes.length + ' rendez-vous ajoutés ✓' : 'Rendez-vous ajouté ✓'}`;
  messageEl.style.color = 'green';

  servicesRdvManuel = [];
  afficherServicesRdvManuel();
  document.getElementById('manuel-rdv-nom').value = '';
  document.getElementById('manuel-rdv-numero').value = '';
  document.getElementById('manuel-rdv-date').value = '';
  document.getElementById('manuel-rdv-heure').value = '';

  await chargerAgenda();
  await chargerStats();
  await chargerGraphique7Jours();
}