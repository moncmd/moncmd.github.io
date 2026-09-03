// ============================================
// CMD. — admin-prestations.js
// Login vendeur + dashboard prestataire (mêmes conventions que admin.js)
// ============================================

let vendeurConnecte = null;
let prestationsCache = [];
let personnelCache = [];
let personnelEnEdition = null; // id de la personne en cours de modification, null = mode "ajout"
let prestationEnEdition = null; // id de la prestation en cours de modification, null = mode "ajout"
let produitsCache = []; // ---- Boutique produits (vendeur hybride prestations + boutique) ----
let produitEnEdition = null;

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
  if (nom === 'produits') chargerOngletProduits();
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

  // L'onglet Boutique/Produits n'a de sens que pour les vendeurs hybride
  // (prestations + boutique) — masqué pour tous les autres.
  const ongletBoutiqueBtn = document.querySelector('.admin-tab[onclick*="produits"]');
  if (ongletBoutiqueBtn) ongletBoutiqueBtn.style.display = (vendeurConnecte.template === 'hybride') ? '' : 'none';

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
      <div class="row-infos"><strong>${echapperHTML(p.nom)}</strong><span class="sub">${p.categorie ? echapperHTML(p.categorie) + ' · ' : ''}${p.prix.toLocaleString('fr-FR')} FCFA · ${p.duree_minutes} min</span></div>
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
      prestationsCache.map(p => `<option value="${p.id}">${echapperHTML(p.nom)} (${p.duree_minutes} min)</option>`).join('');
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
  document.getElementById('nouveau-presta-capacite').value = p.capacite_simultanee || 1;
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
  document.getElementById('nouveau-presta-capacite').value = 1;
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
  const capacite_simultanee = parseInt(document.getElementById('nouveau-presta-capacite').value) || 1;
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
    const nomFichier = `${vendeurConnecte.id}/${Date.now()}-${nettoyerNomFichier(fichier.name)}`;
    const { error: erreurUpload } = await supabaseClient.storage.from('prestations-images').upload(nomFichier, fichier);
    if (!erreurUpload) {
      const { data: pub } = supabaseClient.storage.from('prestations-images').getPublicUrl(nomFichier);
      image_url = pub.publicUrl;
    }
  }

  const donnees = { nom, prix, duree_minutes, categorie, prix_variable, capacite_simultanee };
  if (image_url !== undefined) donnees.image_url = image_url;

  let prestationConcernee;

  if (modeEdition) {
    const { data, error } = await supabaseClient
      .from('prestations')
      .update(donnees)
      .eq('id', prestationEnEdition)
      .select()
      .single();

    if (error) {
      console.error('Erreur modification prestation :', error);
      messageEl.textContent = `Erreur : ${error.message}`;
      messageEl.style.color = 'red';
      return;
    }
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

    if (error) {
      console.error('Erreur ajout prestation :', error);
      messageEl.textContent = `Erreur : ${error.message}`;
      messageEl.style.color = 'red';
      return;
    }
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
      ? personnelCache.map(p => `<span class="staff-pill" data-id="${p.id}" onclick="this.classList.toggle('actif')">${echapperHTML(p.nom)}</span>`).join('')
      : '<p class="empty-state" style="padding:2px 0;">Ajoutez d\'abord des membres dans l\'onglet Équipe.</p>';
  }

  const selectBlocage = document.getElementById('blocage-personnel');
  if (selectBlocage) {
    selectBlocage.innerHTML = '<option value="">Toute l\'équipe</option>' +
      personnelCache.map(p => `<option value="${p.id}">${echapperHTML(p.nom)}</option>`).join('');
  }

  const selectRdvPersonnel = document.getElementById('manuel-rdv-personnel');
  if (selectRdvPersonnel) {
    selectRdvPersonnel.innerHTML = '<option value="">Toute l\'équipe / peu importe</option>' +
      personnelCache.map(p => `<option value="${p.id}">${echapperHTML(p.nom)}</option>`).join('');
  }

  if (!personnelCache.length) {
    liste.innerHTML = '<p class="empty-state">Aucune personne ajoutée.</p>';
    return;
  }

  liste.innerHTML = personnelCache.map(p => `
    <div class="row">
      <img class="row-thumb" style="border-radius:50%;" src="${p.photo_url || ''}">
      <div class="row-infos"><strong>${echapperHTML(p.nom)}</strong><span class="sub">Membre de l'équipe</span></div>
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
    const nomFichier = `${vendeurConnecte.id}/${Date.now()}-${nettoyerNomFichier(fichier.name)}`;
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
        <span class="sub">${b.personnel ? echapperHTML(b.personnel.nom) : "Toute l'équipe"}</span>
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
  const nomFichier = `${vendeurConnecte.id}/${Date.now()}-${nettoyerNomFichier(fichier.name)}`;

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
          <strong>${echapperHTML(a.nom_client)}</strong> — ${'★'.repeat(a.note)}${'☆'.repeat(5 - a.note)}
          <small style="color:#999;">${echapperHTML(a.commentaire)}</small>
          <div style="margin-top:8px;display:flex;gap:8px;">
            <button class="admin-btn" style="width:auto;padding:8px 14px;" onclick="modererAvis('${a.id}','approuve')">Approuver</button>
            <button class="admin-btn secondaire" style="width:auto;padding:8px 14px;" onclick="modererAvis('${a.id}','rejete')">Rejeter</button>
          </div>
        </div>`).join('');

  listeApprouves.innerHTML = (!approuves || !approuves.length)
    ? '<p class="empty-state">Aucun avis publié pour le moment.</p>'
    : approuves.map(a => `
        <div class="row" style="flex-direction:column;align-items:flex-start;">
          <strong>${echapperHTML(a.nom_client)}</strong> — ${'★'.repeat(a.note)}${'☆'.repeat(5 - a.note)}
          <small style="color:#999;">${echapperHTML(a.commentaire)}</small>
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
      <div class="row-infos"><strong>${echapperHTML(f.question)}</strong><span class="sub">${echapperHTML(f.reponse)}</span></div>
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
        <strong>${echapperHTML(r.nom_client) || 'Client'}</strong>
        <span class="sub">${r.prestations ? echapperHTML(r.prestations.nom) : ''} — ${r.personnel ? echapperHTML(r.personnel.nom) : "N'importe qui"}</span>
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
    conteneur.innerHTML = `<p class="empty-state" style="color:#e00;">Erreur de chargement (${echapperHTML(error.message)}). Ouvre la console (F12) pour le détail.</p>`;
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
  selectPresta.innerHTML = prestationsCache.map(pr => `<option value="${pr.id}">${echapperHTML(pr.nom)}</option>`).join('');
  selectPresta.value = p.prestationId;

  const selectPerso = document.getElementById('edition-rdv-personnel');
  selectPerso.innerHTML = '<option value="">N\'importe qui</option>' + personnelCache.map(pe => `<option value="${pe.id}">${echapperHTML(pe.nom)}</option>`).join('');
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
// ============================================
// BOUTIQUE PRODUITS (vendeur hybride prestations + boutique)
// Fonctions portées directement depuis admin.js — mêmes conventions.
// ============================================

// Initialise l'onglet Boutique à l'ouverture : verrouille le champ stock et
// la liste de réassort pour les non-Pro (même règle que la boutique classique),
// puis charge catégories + produits.
async function chargerOngletProduits() {
  const estPro = auMoins('pro');
  const champStock = document.getElementById('champ-stock-premium');
  const carteListeAttente = document.getElementById('carte-liste-attente');

  if (champStock) champStock.style.display = estPro ? 'block' : 'none';
  if (carteListeAttente) carteListeAttente.style.display = estPro ? 'block' : 'none';
  if (estPro) chargerListeAttenteStock();

  await chargerCategoriesExistantes();
  await chargerProduits();
}

async function chargerListeAttenteStock() {
  const conteneur = document.getElementById('liste-attente-stock-admin');
  if (!conteneur) return;

  const { data: attente } = await supabaseClient
    .from('liste_attente_stock')
    .select('*, produits(nom)')
    .eq('vendeur_id', vendeurConnecte.id)
    .eq('contacte', false)
    .order('date_creation', { ascending: false });

  if (!attente || attente.length === 0) {
    conteneur.innerHTML = '<p class="empty-state">Personne en attente pour le moment.</p>';
    return;
  }

  conteneur.innerHTML = attente.map(a => `
    <div class="produit-row">
      <div class="produit-infos">
        <strong>${a.produits ? echapperHTML(a.produits.nom) : 'Produit'}</strong>
        <span class="prix">${echapperHTML(a.numero_client)}</span>
      </div>
      <div class="produit-actions">
        <a href="https://wa.me/${a.numero_client.replace(/\D/g,'')}?text=Bonjour, le produit que vous attendiez est de nouveau disponible !" target="_blank" class="icon-btn" title="Contacter sur WhatsApp">
          <i class="fa-brands fa-whatsapp"></i>
        </a>
        <button class="icon-btn" title="Marquer comme contacté" onclick="marquerContacte('${a.id}')">
          <i class="fa-solid fa-check"></i>
        </button>
      </div>
    </div>
  `).join('');
}

async function marquerContacte(id) {
  await supabaseClient.from('liste_attente_stock').update({ contacte: true }).eq('id', id);
  await chargerListeAttenteStock();
}

async function chargerProduits() {
  const { data: produits } = await supabaseClient
    .from('produits')
    .select('*')
    .eq('vendeur_id', vendeurConnecte.id)
    .order('ordre', { ascending: true });

  produitsCache = produits || [];
  const champRecherche = document.getElementById('recherche-produit-admin');
  if (champRecherche) champRecherche.value = '';

  renderListeProduits(produitsCache, true);
}

// Filtre localement (sans re-requêter Supabase) la liste déjà chargée, par nom.
// Le réordonnancement (flèches ↑↓) est désactivé pendant une recherche, car les
// index affichés ne correspondraient plus à l'ordre réel dans produitsCache.
function filtrerProduitsAdmin() {
  const requete = document.getElementById('recherche-produit-admin').value
    .trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (!requete) { renderListeProduits(produitsCache, true); return; }

  const resultats = produitsCache.filter(p =>
    p.nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(requete)
  );
  renderListeProduits(resultats, false);
}

function renderListeProduits(produits, avecReorder) {
  const liste = document.getElementById('liste-produits-admin');
  liste.innerHTML = '';

  if (!produits || produits.length === 0) {
    liste.innerHTML = '<p class="empty-state">Aucun produit ne correspond à votre recherche.</p>';
    return;
  }

  if (!avecReorder) {
    // Mode recherche : liste plate (les résultats traversent plusieurs catégories,
    // regrouper n'aiderait pas à retrouver vite un produit précis).
    liste.innerHTML = produits.map(p => construireLigneProduit(p, false)).join('');
    return;
  }

  // Regroupement par catégorie, dans l'ordre d'apparition (cohérent avec le tri
  // global déjà appliqué par "ordre" — la première catégorie rencontrée est celle
  // du produit avec le plus petit ordre).
  const categories = [];
  produits.forEach(p => {
    const cat = p.categorie || 'Sans catégorie';
    if (!categories.includes(cat)) categories.push(cat);
  });

  liste.innerHTML = categories.map((cat, catIndex) => {
    const produitsCategorie = produits.filter(p => (p.categorie || 'Sans catégorie') === cat);
    return `
      <div class="categorie-titre-admin" style="font-size:11.5px; font-weight:700; color:#999; text-transform:uppercase; letter-spacing:0.05em; margin:${catIndex === 0 ? '4px' : '20px'} 0 4px; padding-top:${catIndex === 0 ? '0' : '14px'}; ${catIndex === 0 ? '' : 'border-top:1px solid #f0f0f0;'}">${cat}</div>
      ${produitsCategorie.map((p, index) => construireLigneProduit(p, true, index, produitsCategorie.length)).join('')}
    `;
  }).join('');
}

function construireLigneProduit(p, avecReorder, index, totalCategorie) {
  const imgSrc = p.image_url || '';
  const estPro = auMoins('pro');
  const infoStock = estPro
    ? `<span class="prix">${p.prix.toLocaleString()} FCFA · ${echapperHTML(p.categorie)} · Stock : ${p.quantite_stock === null || p.quantite_stock === undefined ? 'illimité' : p.quantite_stock}</span>`
    : `<span class="prix">${p.prix.toLocaleString()} FCFA · ${echapperHTML(p.categorie)}</span>`;

  const boutonsReorder = avecReorder ? `
        <button class="icon-btn" ${index === 0 ? 'disabled style="opacity:0.3;"' : ''} title="Monter dans cette catégorie" onclick="deplacerProduit('${p.id}', -1)">
          <i class="fa-solid fa-arrow-up"></i>
        </button>
        <button class="icon-btn" ${index === totalCategorie - 1 ? 'disabled style="opacity:0.3;"' : ''} title="Descendre dans cette catégorie" onclick="deplacerProduit('${p.id}', 1)">
          <i class="fa-solid fa-arrow-down"></i>
        </button>` : '';

  return `
    <div class="produit-row" style="${p.actif === false ? 'opacity:0.45;' : ''}">
      ${imgSrc
        ? `<img src="${imgSrc}" class="produit-thumb" alt="${echapperHTML(p.nom)}">`
        : `<div class="produit-thumb" style="display:flex;align-items:center;justify-content:center;color:#ccc;"><i class="fa-solid fa-image"></i></div>`}
      <div class="produit-infos">
        <strong>${echapperHTML(p.nom)}${p.actif === false ? ' <span style="font-size:10px;font-weight:700;color:var(--couleur-accent,#e56400);border:1px solid currentColor;border-radius:6px;padding:1px 6px;vertical-align:middle;">MASQUÉ</span>' : ''}</strong>
        ${infoStock}
      </div>
      <div class="produit-actions">
        ${boutonsReorder}
        <button class="icon-btn" title="Modifier ce produit" onclick="chargerProduitPourEdition('${p.id}')">
          <i class="fa-solid fa-pen"></i>
        </button>
        ${estPro ? `
        <button class="icon-btn" title="Modifier le stock" onclick="modifierStock('${p.id}', ${p.quantite_stock === null || p.quantite_stock === undefined ? 'null' : p.quantite_stock})">
          <i class="fa-solid fa-boxes-stacked"></i>
        </button>` : ''}
        <button class="icon-btn ${p.favori ? 'favori-actif' : ''}" title="${p.favori ? 'Retirer de la une' : 'Mettre en avant'}" onclick="basculerFavori('${p.id}', ${p.favori})">
          <i class="fa-solid fa-star"></i>
        </button>
        <button class="icon-btn ${p.actif === false ? 'favori-actif' : ''}" title="${p.actif === false ? 'Réafficher sur le site' : 'Masquer du site'}" onclick="basculerVisibiliteProduit('${p.id}', ${p.actif !== false})">
          <i class="fa-solid ${p.actif === false ? 'fa-eye' : 'fa-eye-slash'}"></i>
        </button>
        <button class="icon-btn" title="Créer un visuel pour Statut WhatsApp" onclick="genererStatutProduit('${p.id}')">
          <i class="fa-solid fa-camera-retro"></i>
        </button>
      </div>
    </div>
  `;
}

// Génère un visuel prêt pour le Statut WhatsApp (format portrait 1080x1920)
// à partir d'un produit : photo + nom + prix + logo/nom de la boutique.
// Tout se fait localement dans le navigateur via Canvas, aucun envoi serveur.
async function genererStatutProduit(id) {
  const p = produitsCache.find(x => x.id === id);
  if (!p) return;

  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext('2d');

  const couleurAccent = (vendeurConnecte && vendeurConnecte.couleur_accent) || '#e56400';

  // Fond en dégradé, teinté par la couleur de la boutique
  const degrade = ctx.createLinearGradient(0, 0, 0, canvas.height);
  degrade.addColorStop(0, couleurAccent);
  degrade.addColorStop(1, '#1a1a1a');
  ctx.fillStyle = degrade;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Nom de la boutique en haut
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 46px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(vendeurConnecte.nom_boutique || 'Ma boutique', canvas.width / 2, 130);

  // Carte blanche centrale avec la photo du produit
  const carteX = 90, carteY = 300, carteW = canvas.width - 180, carteH = 1100;
  ctx.fillStyle = '#ffffff';
  arrondi(ctx, carteX, carteY, carteW, carteH, 32);
  ctx.fill();

  async function chargerImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  if (p.image_url) {
    const img = await chargerImage(p.image_url);
    if (img) {
      // Recadrage "cover" pour remplir la carte sans déformer l'image
      const pad = 30;
      const zoneW = carteW - pad * 2, zoneH = carteH - pad * 2 - 40;
      const ratioZone = zoneW / zoneH;
      const ratioImg = img.width / img.height;
      let sx, sy, sw, sh;
      if (ratioImg > ratioZone) { sh = img.height; sw = sh * ratioZone; sx = (img.width - sw) / 2; sy = 0; }
      else { sw = img.width; sh = sw / ratioZone; sx = 0; sy = (img.height - sh) / 2; }

      ctx.save();
      arrondi(ctx, carteX + pad, carteY + pad, zoneW, zoneH, 20);
      ctx.clip();
      ctx.drawImage(img, sx, sy, sw, sh, carteX + pad, carteY + pad, zoneW, zoneH);
      ctx.restore();
    }
  }

  // Nom du produit
  ctx.fillStyle = '#1a1a1a';
  ctx.font = '700 52px Arial, sans-serif';
  enveloppeTexte(ctx, p.nom, canvas.width / 2, carteY + carteH - 90, carteW - 80, 58);

  // Prix, en bas de la carte
  ctx.fillStyle = couleurAccent;
  ctx.font = '800 64px Arial, sans-serif';
  ctx.fillText(`${p.prix.toLocaleString('fr-FR')} FCFA`, canvas.width / 2, carteY + carteH + 90);

  // Appel à l'action en bas de l'écran
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 40px Arial, sans-serif';
  ctx.fillText('📲 Commande sur WhatsApp', canvas.width / 2, canvas.height - 120);

  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `statut-${p.nom.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

// Dessine un rectangle aux coins arrondis (utilisé par le générateur de statut)
function arrondi(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Écrit un texte centré sur plusieurs lignes si besoin, jamais coupé au milieu d'un mot
function enveloppeTexte(ctx, texte, cx, y, largeurMax, interligne) {
  const mots = texte.split(' ');
  const lignes = [];
  let ligneActuelle = '';
  mots.forEach(mot => {
    const test = ligneActuelle ? ligneActuelle + ' ' + mot : mot;
    if (ctx.measureText(test).width > largeurMax && ligneActuelle) {
      lignes.push(ligneActuelle);
      ligneActuelle = mot;
    } else {
      ligneActuelle = test;
    }
  });
  if (ligneActuelle) lignes.push(ligneActuelle);

  const yDepart = y - (lignes.length - 1) * interligne / 2;
  lignes.forEach((ligne, i) => ctx.fillText(ligne, cx, yDepart + i * interligne));
}

// Échange l'ordre du produit avec son voisin immédiat DANS LA MÊME CATÉGORIE
// (direction : -1 = monter, 1 = descendre). On ne mélange jamais deux catégories entre elles.
async function deplacerProduit(id, direction) {
  const produit = produitsCache.find(p => p.id === id);
  if (!produit) return;

  const memeCategorie = produitsCache.filter(p => (p.categorie || 'Sans catégorie') === (produit.categorie || 'Sans catégorie'));
  const index = memeCategorie.findIndex(p => p.id === id);
  const indexVoisin = index + direction;
  if (indexVoisin < 0 || indexVoisin >= memeCategorie.length) return;

  const voisin = memeCategorie[indexVoisin];

  await supabaseClient.from('produits').update({ ordre: voisin.ordre }).eq('id', produit.id);
  await supabaseClient.from('produits').update({ ordre: produit.ordre }).eq('id', voisin.id);

  await chargerProduits();
}

async function modifierStock(id, stockActuel) {
  const saisie = prompt("Nouvelle quantité en stock (laisser vide pour illimité) :", stockActuel === null ? '' : stockActuel);
  if (saisie === null) return; // annulé

  const valeur = saisie.trim() === '' ? null : parseInt(saisie);
  await supabaseClient.from('produits').update({ quantite_stock: valeur }).eq('id', id);
  await chargerProduits();
}

async function ajouterProduit() {
  const nom = document.getElementById('nouveau-nom').value;
  const prix = parseInt(document.getElementById('nouveau-prix').value);
  const fichier = document.getElementById('nouveau-image-fichier').files[0];
  const fichierVideo = document.getElementById('nouveau-video-fichier').files[0];
  const selectCategorie = document.getElementById('nouveau-categorie-select').value;
  const texteCategorie = document.getElementById('nouveau-categorie').value.trim();
  const categorie = (selectCategorie === '__nouvelle__' ? texteCategorie : selectCategorie) || 'general';
  const description = document.getElementById('nouveau-description').value.trim();
  const favori = document.getElementById('nouveau-favori').checked;
  const stockInput = document.getElementById('nouveau-stock');
  const messageEl = document.getElementById('produit-message');
  const enEdition = !!produitEnEdition;

  if (!nom || !prix) {
    messageEl.textContent = "Nom et prix sont obligatoires.";
    messageEl.style.color = 'red';
    return;
  }

  // ---- Limites de la formule Standard (uniquement à l'ajout, pas à la modification) ----
  if (!enEdition && !auMoins('pro')) {
    const { data: produitsExistants } = await supabaseClient
      .from('produits')
      .select('categorie')
      .eq('vendeur_id', vendeurConnecte.id)
      .eq('actif', true);

    const nbProduits = produitsExistants ? produitsExistants.length : 0;
    const categoriesExistantes = new Set((produitsExistants || []).map(p => p.categorie || 'general'));

    if (nbProduits >= 20) {
      messageEl.textContent = "Limite de 20 produits atteinte avec la formule Standard. Passez en Pro pour continuer.";
      messageEl.style.color = 'red';
      return;
    }

    if (!categoriesExistantes.has(categorie) && categoriesExistantes.size >= 5) {
      messageEl.textContent = "Limite de 5 catégories atteinte avec la formule Standard. Passez en Pro pour en ajouter davantage.";
      messageEl.style.color = 'red';
      return;
    }
  }

  let image_url = enEdition ? undefined : ''; // en édition, undefined = on ne touche pas au champ si pas de nouvelle photo

  if (fichier) {
    messageEl.textContent = "Envoi de la photo en cours...";
    messageEl.style.color = '#777';

    const nomFichier = `${vendeurConnecte.id}/${Date.now()}-${nettoyerNomFichier(fichier.name)}`;

    const { error: erreurUpload } = await supabaseClient
      .storage
      .from('produits-images')
      .upload(nomFichier, fichier);

    if (erreurUpload) {
      messageEl.textContent = "Erreur lors de l'envoi de la photo.";
      messageEl.style.color = 'red';
      return;
    }

    const { data: urlData } = supabaseClient
      .storage
      .from('produits-images')
      .getPublicUrl(nomFichier);

    image_url = urlData.publicUrl;
  }

  let video_url = enEdition ? undefined : ''; // même logique que la photo : en édition, on ne touche pas au champ si pas de nouveau fichier

  if (fichierVideo) {
    messageEl.textContent = "Envoi de la vidéo en cours...";
    messageEl.style.color = '#777';

    const nomFichierVideo = `${vendeurConnecte.id}/${Date.now()}-${nettoyerNomFichier(fichierVideo.name)}`;

    const { error: erreurUploadVideo } = await supabaseClient
      .storage
      .from('produits-videos')
      .upload(nomFichierVideo, fichierVideo);

    if (erreurUploadVideo) {
      messageEl.textContent = "Erreur lors de l'envoi de la vidéo.";
      messageEl.style.color = 'red';
      return;
    }

    const { data: urlDataVideo } = supabaseClient
      .storage
      .from('produits-videos')
      .getPublicUrl(nomFichierVideo);

    video_url = urlDataVideo.publicUrl;
  }

  const donneesProduit = { nom, prix, categorie, favori, description };
  if (image_url !== undefined) donneesProduit.image_url = image_url;
  if (video_url !== undefined) donneesProduit.video_url = video_url;
  if (!enEdition) {
    donneesProduit.vendeur_id = vendeurConnecte.id;
    donneesProduit.ordre = produitsCache.length
      ? Math.max(...produitsCache.map(p => p.ordre || 0)) + 1
      : 0;
  }

  if (auMoins('pro') && stockInput && stockInput.value !== '') {
    donneesProduit.quantite_stock = parseInt(stockInput.value);
  }

  const requete = enEdition
    ? supabaseClient.from('produits').update(donneesProduit).eq('id', produitEnEdition)
    : supabaseClient.from('produits').insert(donneesProduit);

  const { error } = await requete;

  if (error) {
    messageEl.textContent = enEdition ? "Erreur lors de la modification." : "Erreur lors de l'ajout.";
    messageEl.style.color = 'red';
    return;
  }

  messageEl.textContent = enEdition ? "Produit modifié ✓" : "Produit ajouté ✓";
  messageEl.style.color = 'green';

  annulerEditionProduit(); // remet le formulaire à zéro et sort du mode édition

  await chargerCategoriesExistantes();
  await chargerProduits();
  await chargerStats();
}

// ---- Édition d'un produit existant ----
function chargerProduitPourEdition(id) {
  const produit = produitsCache.find(p => p.id === id);
  if (!produit) return;

  produitEnEdition = id;

  document.getElementById('nouveau-nom').value = produit.nom;
  document.getElementById('nouveau-prix').value = produit.prix;
  document.getElementById('nouveau-description').value = produit.description || '';
  document.getElementById('nouveau-image-fichier').value = '';
  document.getElementById('nouveau-video-fichier').value = '';
  document.getElementById('nouveau-favori').checked = !!produit.favori;

  const select = document.getElementById('nouveau-categorie-select');
  const options = Array.from(select.options).map(o => o.value);
  if (options.includes(produit.categorie)) {
    select.value = produit.categorie;
    document.getElementById('nouveau-categorie').style.display = 'none';
  } else {
    select.value = '__nouvelle__';
    document.getElementById('nouveau-categorie').value = produit.categorie;
    document.getElementById('nouveau-categorie').style.display = 'block';
  }

  const stockInput = document.getElementById('nouveau-stock');
  if (stockInput) stockInput.value = (produit.quantite_stock === null || produit.quantite_stock === undefined) ? '' : produit.quantite_stock;

  document.getElementById('titre-formulaire-produit').innerHTML = '<i class="fa-solid fa-pen"></i> Modifier ce produit';
  document.getElementById('btn-soumettre-produit').textContent = 'Enregistrer les modifications';
  document.getElementById('annuler-edition-lien').style.display = 'block';
  document.getElementById('photo-optionnelle-edition').style.display = 'inline';
  document.getElementById('produit-message').textContent = '';

  document.getElementById('nouveau-nom').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function annulerEditionProduit() {
  produitEnEdition = null;

  document.getElementById('nouveau-nom').value = '';
  document.getElementById('nouveau-prix').value = '';
  document.getElementById('nouveau-description').value = '';
  document.getElementById('nouveau-image-fichier').value = '';
  document.getElementById('nouveau-video-fichier').value = '';
  document.getElementById('nouveau-categorie').value = '';
  document.getElementById('nouveau-categorie').style.display = 'none';
  document.getElementById('nouveau-categorie-select').value = '';
  document.getElementById('nouveau-favori').checked = false;
  const stockInput = document.getElementById('nouveau-stock');
  if (stockInput) stockInput.value = '';

  document.getElementById('titre-formulaire-produit').innerHTML = '<i class="fa-solid fa-plus"></i> Ajouter un produit';
  document.getElementById('btn-soumettre-produit').textContent = 'Ajouter le produit';
  document.getElementById('annuler-edition-lien').style.display = 'none';
  document.getElementById('photo-optionnelle-edition').style.display = 'none';
}

// ---- Catégories existantes du vendeur (évite les doublons de saisie libre) ----
async function chargerCategoriesExistantes() {
  const select = document.getElementById('nouveau-categorie-select');
  if (!select) return;

  const { data: produitsExistants } = await supabaseClient
    .from('produits')
    .select('categorie')
    .eq('vendeur_id', vendeurConnecte.id)
    .eq('actif', true);

  const categories = [...new Set((produitsExistants || []).map(p => p.categorie || 'general'))].sort();

  const valeurActuelle = select.value;
  select.innerHTML = '<option value="">Catégorie…</option>' +
    categories.map(c => `<option value="${c}">${c}</option>`).join('') +
    '<option value="__nouvelle__">+ Nouvelle catégorie</option>';

  if (categories.includes(valeurActuelle)) select.value = valeurActuelle;
}

function toggleNouvelleCategorie() {
  const select = document.getElementById('nouveau-categorie-select');
  const champTexte = document.getElementById('nouveau-categorie');
  champTexte.style.display = select.value === '__nouvelle__' ? 'block' : 'none';
  if (select.value === '__nouvelle__') champTexte.focus();
}

async function basculerFavori(id, etatActuel) {
  await supabaseClient.from('produits').update({ favori: !etatActuel }).eq('id', id);
  await chargerProduits();
}

async function basculerVisibiliteProduit(id, etatActuel) {
  await supabaseClient.from('produits').update({ actif: !etatActuel }).eq('id', id);
  await chargerProduits();
  await chargerStats();
}