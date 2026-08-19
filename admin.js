// ============================================
// CMD. — admin.js
// Login vendeur + dashboard (onglets, stats, graphique, produits, commandes)
// ============================================

let vendeurConnecte = null;
let produitsCache = [];
let produitEnEdition = null;

// ---- Hiérarchie des formules : standard < pro < premium ----
const HIERARCHIE_FORMULES = ['standard', 'pro', 'premium'];
function auMoins(niveauRequis) {
  const niveauActuel = HIERARCHIE_FORMULES.indexOf(vendeurConnecte.formule || 'standard');
  const niveauCible = HIERARCHIE_FORMULES.indexOf(niveauRequis);
  return niveauActuel >= niveauCible;
}

document.addEventListener('DOMContentLoaded', verifierSession);

// Redirection vers la boutique (respecte le template du vendeur connecté, s'il y en a un)
function allerVers(destination, id = null) {
  const slug = vendeurConnecte ? vendeurConnecte.slug : null;
  const template = (vendeurConnecte && vendeurConnecte.template) ? vendeurConnecte.template.toLowerCase() : '';
  const nomFichier = template ? `${destination}-${template}` : destination;

  let url = `${nomFichier}.html`;
  const params = [];
  if (slug) params.push(`v=${slug}`);
  if (id) params.push(`id=${id}`);
  if (params.length) url += `?${params.join('&')}`;

  window.location.href = url;
}

async function verifierSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    await chargerDashboard(session.user.id);
  }
}

async function connexion() {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const erreurEl = document.getElementById('login-erreur');
  erreurEl.textContent = '';

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    erreurEl.textContent = "Email ou mot de passe incorrect.";
    return;
  }

  await chargerDashboard(data.user.id);
}

async function deconnexion() {
  await supabaseClient.auth.signOut();
  document.getElementById('vue-login').style.display = 'block';
  document.getElementById('vue-dashboard').style.display = 'none';
}
async function chargerFAQAdmin() {
  const { data: faqs } = await supabaseClient
    .from('faq')
    .select('*')
    .eq('vendeur_id', vendeurConnecte.id)
    .order('ordre', { ascending: true });

  const liste = document.getElementById('liste-faq-admin');
  if (!liste) return;
  liste.innerHTML = '';

  if (!faqs || faqs.length === 0) {
    liste.innerHTML = '<p class="empty-state">Aucune question pour le moment.</p>';
    return;
  }

  faqs.forEach(f => {
    liste.innerHTML += `
      <div class="produit-row">
        <div class="produit-infos">
          <strong>${f.question}</strong>
          <span class="prix">${f.reponse}</span>
        </div>
        <div class="produit-actions">
          <button class="icon-btn danger" onclick="supprimerFAQ('${f.id}')">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  });
}

async function chargerAvisAModerer() {
  const { data: enAttente } = await supabaseClient
    .from('avis')
    .select('*')
    .eq('vendeur_id', vendeurConnecte.id)
    .eq('statut', 'en_attente')
    .order('date_creation', { ascending: false });

  const { data: approuves } = await supabaseClient
    .from('avis')
    .select('*')
    .eq('vendeur_id', vendeurConnecte.id)
    .eq('statut', 'approuve')
    .order('date_creation', { ascending: false })
    .limit(20);

  const listeAttente = document.getElementById('liste-avis-attente');
  const listeApprouves = document.getElementById('liste-avis-approuves');
  if (!listeAttente || !listeApprouves) return;

  listeAttente.innerHTML = (!enAttente || enAttente.length === 0)
    ? '<p class="empty-state">Aucun avis en attente.</p>'
    : enAttente.map(a => `
        <div class="commande-row">
          <strong>${a.nom_client}</strong> — ${'★'.repeat(a.note)}${'☆'.repeat(5 - a.note)}
          <br><small style="color:#999;">${a.commentaire || ''}</small>
          <div style="margin-top:8px; display:flex; gap:8px;">
            <button class="admin-btn" style="width:auto; padding:8px 14px;" onclick="modererAvis('${a.id}', 'approuve')">Approuver</button>
            <button class="admin-btn secondaire" style="width:auto; padding:8px 14px;" onclick="modererAvis('${a.id}', 'rejete')">Rejeter</button>
          </div>
        </div>
      `).join('');

      listeApprouves.innerHTML = (!approuves || approuves.length === 0)
      ? '<p class="empty-state">Aucun avis publié pour le moment.</p>'
      : approuves.map(a => `
          <div class="commande-row">
            <strong>${a.nom_client}</strong> — ${'★'.repeat(a.note)}${'☆'.repeat(5 - a.note)}
            <br><small style="color:#999;">${a.commentaire || ''}</small>
            <div style="margin-top:8px;">
              <button class="admin-btn secondaire" style="width:auto; padding:6px 12px; font-size:12px;" onclick="modererAvis('${a.id}', 'rejete')">Dépublier</button>
            </div>
          </div>
        `).join('');
  
}

async function modererAvis(id, statut) {
  await supabaseClient.from('avis').update({ statut }).eq('id', id);
  await chargerAvisAModerer();
}


async function ajouterFAQ() {
  const question = document.getElementById('nouvelle-faq-question').value.trim();
  const reponse = document.getElementById('nouvelle-faq-reponse').value.trim();
  const messageEl = document.getElementById('faq-message');

  if (!question || !reponse) {
    messageEl.textContent = "Question et réponse sont obligatoires.";
    messageEl.style.color = 'red';
    return;
  }

  if (!auMoins('pro')) {
    const { count } = await supabaseClient
      .from('faq')
      .select('*', { count: 'exact', head: true })
      .eq('vendeur_id', vendeurConnecte.id);

    if ((count || 0) >= 5) {
      messageEl.textContent = "Limite de 5 questions atteinte avec la formule Standard. Passez en Pro pour en ajouter davantage.";
      messageEl.style.color = 'red';
      return;
    }
  }

  const { error } = await supabaseClient.from('faq').insert({
    vendeur_id: vendeurConnecte.id, question, reponse
  });

  if (error) {
    messageEl.textContent = "Erreur lors de l'ajout.";
    messageEl.style.color = 'red';
    return;
  }

  messageEl.textContent = "Question ajoutée ✓";
  messageEl.style.color = 'green';
  document.getElementById('nouvelle-faq-question').value = '';
  document.getElementById('nouvelle-faq-reponse').value = '';
  await chargerFAQAdmin();
}

async function supprimerFAQ(id) {
  await supabaseClient.from('faq').delete().eq('id', id);
  await chargerFAQAdmin();
}


// ---- Navigation par onglets ----
function changerOnglet(nom, boutonEl) {
  document.querySelectorAll('.onglet-panel').forEach(p => p.classList.remove('actif'));
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('actif'));
  document.getElementById('onglet-' + nom).classList.add('actif');
  boutonEl.classList.add('actif');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (nom === 'clients') chargerClientsAdmin();
}

// ============================================
// CODES PROMO (exclusivité Premium)
// ============================================
async function chargerCodesPromo() {
  const { data } = await supabaseClient
    .from('codes_promo')
    .select('*')
    .eq('vendeur_id', vendeurConnecte.id)
    .eq('actif', true)
    .order('date_creation', { ascending: false });

  const liste = document.getElementById('liste-codes-promo');
  if (!liste) return;

  if (!data || !data.length) { liste.innerHTML = '<p class="empty-state">Aucun code promo actif.</p>'; return; }

  liste.innerHTML = data.map(c => `
    <div class="row">
      <div class="row-infos">
        <strong>${c.code}</strong>
        <span class="sub">-${c.reduction_pourcent}%${c.date_expiration ? ' · expire le ' + new Date(c.date_expiration).toLocaleDateString('fr-FR') : ' · sans expiration'}</span>
      </div>
      <button class="icon-btn danger" onclick="supprimerCodePromo('${c.id}')"><i class="fa-solid fa-trash"></i></button>
    </div>
  `).join('');
}

async function ajouterCodePromo() {
  const messageEl = document.getElementById('code-promo-message');
  const code = document.getElementById('nouveau-code-promo').value.trim().toUpperCase();
  const reduction = parseInt(document.getElementById('nouveau-code-reduction').value);
  const expiration = document.getElementById('nouveau-code-expiration').value || null;

  if (!code || !reduction || reduction < 1 || reduction > 90) {
    messageEl.textContent = "Code et réduction (1 à 90%) obligatoires.";
    messageEl.style.color = 'red';
    return;
  }

  const { error } = await supabaseClient.from('codes_promo').insert({
    vendeur_id: vendeurConnecte.id,
    code,
    reduction_pourcent: reduction,
    date_expiration: expiration
  });

  if (error) {
    messageEl.textContent = error.code === '23505' ? "Ce code existe déjà." : "Erreur lors de la création.";
    messageEl.style.color = 'red';
    return;
  }

  messageEl.textContent = "Code promo créé ✓";
  messageEl.style.color = 'green';
  document.getElementById('nouveau-code-promo').value = '';
  document.getElementById('nouveau-code-reduction').value = '';
  document.getElementById('nouveau-code-expiration').value = '';
  await chargerCodesPromo();
}

async function supprimerCodePromo(id) {
  if (!confirm('Désactiver ce code promo ?')) return;
  await supabaseClient.from('codes_promo').update({ actif: false }).eq('id', id);
  await chargerCodesPromo();
}
let clientsCache = [];

// ============================================
// MINI-CRM CLIENTS (agrégé depuis les commandes confirmées, aucune saisie requise)
// ============================================
async function chargerClientsAdmin() {
  const { data, error } = await supabaseClient
    .from('commandes')
    .select('nom_client, prenom_client, numero_client, total, date_creation, statut')
    .eq('vendeur_id', vendeurConnecte.id)
    .eq('statut', 'confirmee');

  const conteneur = document.getElementById('liste-clients-admin');
  if (!conteneur) return;

  if (error) {
    console.error('Erreur chargement clients :', error);
    conteneur.innerHTML = `<p class="empty-state" style="color:#e00;">Erreur de chargement (${error.message}).</p>`;
    return;
  }

  // Regroupement par numéro de téléphone (identifiant fiable, contrairement
  // au nom qui peut être écrit différemment d'une commande à l'autre).
  const parNumero = {};
  (data || []).forEach(c => {
    const cle = c.numero_client || `inconnu-${c.nom_client}-${c.date_creation}`;
    if (!parNumero[cle]) {
      parNumero[cle] = {
        nom: `${c.nom_client || ''} ${c.prenom_client || ''}`.trim() || 'Client',
        numero: c.numero_client,
        nbCommandes: 0,
        total: 0,
        derniere: c.date_creation
      };
    }
    parNumero[cle].nbCommandes++;
    parNumero[cle].total += c.total;
    if (new Date(c.date_creation) > new Date(parNumero[cle].derniere)) parNumero[cle].derniere = c.date_creation;
  });

  clientsCache = Object.values(parNumero).sort((a, b) => b.total - a.total);

  const champRecherche = document.getElementById('recherche-client-admin');
  if (champRecherche) champRecherche.value = '';

  renderListeClients(clientsCache);
}

function filtrerClientsAdmin() {
  const requete = document.getElementById('recherche-client-admin').value
    .trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (!requete) { renderListeClients(clientsCache); return; }

  const resultats = clientsCache.filter(c =>
    c.nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(requete) ||
    (c.numero || '').includes(requete)
  );
  renderListeClients(resultats);
}

function renderListeClients(clients) {
  const conteneur = document.getElementById('liste-clients-admin');
  if (!clients || !clients.length) { conteneur.innerHTML = '<p class="empty-state">Aucun client pour le moment.</p>'; return; }

  conteneur.innerHTML = clients.map(c => {
    const joursDepuis = Math.floor((Date.now() - new Date(c.derniere)) / 86400000);
    const texteDerniere = joursDepuis <= 0 ? "aujourd'hui" : joursDepuis === 1 ? "hier" : `il y a ${joursDepuis} jours`;
    const fidele = c.nbCommandes >= 3;

    return `
      <div class="row">
        <div class="row-infos">
          <strong>${c.nom}${fidele ? ' ⭐' : ''}</strong>
          <span class="sub">${c.nbCommandes} commande${c.nbCommandes > 1 ? 's' : ''} · ${c.total.toLocaleString('fr-FR')} FCFA · dernière ${texteDerniere}</span>
          ${c.numero ? `<span class="sub" style="display:block;">${c.numero}</span>` : ''}
        </div>
        ${c.numero ? `<a href="https://wa.me/${c.numero}" target="_blank" class="icon-btn"><i class="fa-brands fa-whatsapp"></i></a>` : ''}
      </div>
    `;
  }).join('');
}

async function chargerDashboard(authUserId) {
  const { data: admin, error: errAdmin } = await supabaseClient
    .from('admins')
    .select('vendeur_id, vendeurs(*)')
    .eq('auth_user_id', authUserId)
    .single();

  if (errAdmin || !admin) {
    document.getElementById('login-erreur').textContent = "Aucune boutique liée à ce compte.";
    return;
  }

  vendeurConnecte = admin.vendeurs;

  document.getElementById('vue-login').style.display = 'none';
  document.getElementById('vue-dashboard').style.display = 'block';
  document.getElementById('nom-boutique-admin').textContent = vendeurConnecte.nom_boutique;
  document.documentElement.style.setProperty('--couleur-accent', vendeurConnecte.couleur_accent || '#e56400');

  await chargerStats();
  await chargerGraphique7Jours();
  await chargerCategoriesExistantes();
  await chargerProduits();
  await chargerCommandes();
  remplirInfosVendeur();
  genererQRCode();
  chargerFAQAdmin();
  chargerAvisAModerer();
  appliquerLimitesFormule();

}

// ---- Gating Standard / Pro / Premium ----
function appliquerLimitesFormule() {
  const estPro = auMoins('pro');
  const estPremium = auMoins('premium');

  const statsAvancees = document.getElementById('stats-avancees');
  const carteGraphique = document.getElementById('carte-graphique-7jours');
  const champStock = document.getElementById('champ-stock-premium');
  const carteListeAttente = document.getElementById('carte-liste-attente');
  const carteDepenses = document.getElementById('carte-depenses');
  const carteBenefice = document.getElementById('carte-benefice-net');

  if (statsAvancees) statsAvancees.style.display = estPro ? 'grid' : 'none';
  if (carteGraphique) carteGraphique.style.display = estPro ? 'block' : 'none';
  if (champStock) champStock.style.display = estPro ? 'block' : 'none';

  if (estPro) {
    if (carteListeAttente) carteListeAttente.style.display = 'block';
    chargerListeAttenteStock();
  }

  if (carteDepenses) carteDepenses.style.display = estPro ? 'block' : 'none';
  if (estPro) chargerDepenses();

  if (carteBenefice) carteBenefice.style.display = estPremium ? 'block' : 'none';
  if (estPremium) chargerBeneficeNet();

  const btnExport = document.getElementById('btn-export-commandes');
  if (btnExport) btnExport.style.display = estPremium ? 'block' : 'none';

  const blocCodesPromo = document.getElementById('bloc-codes-promo');
  if (blocCodesPromo) blocCodesPromo.classList.toggle('verrouille-premium', !estPremium);
  if (estPremium) chargerCodesPromo();
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
        <strong>${a.produits ? a.produits.nom : 'Produit'}</strong>
        <span class="prix">${a.numero_client}</span>
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

function remplirInfosVendeur() {
  document.getElementById('info-whatsapp').value = vendeurConnecte.numero_whatsapp || '';
  document.getElementById('info-wave').value = vendeurConnecte.wave_numero || '';
  document.getElementById('info-om').value = vendeurConnecte.om_numero || '';
  document.getElementById('info-instagram').value = vendeurConnecte.instagram || '';
  document.getElementById('info-tiktok').value = vendeurConnecte.tiktok || '';
  document.getElementById('info-facebook').value = vendeurConnecte.facebook || '';

  // Logo : fonctionnalité payante à la carte, indépendante de la formule standard/pro/premium.
  // Débloquée uniquement pour les vendeurs qui ont payé spécifiquement pour ça (vendeurs.logo_debloque).
  const blocLogo = document.getElementById('bloc-upload-logo');
  if (blocLogo) blocLogo.classList.toggle('verrouille-logo', !vendeurConnecte.logo_debloque);

  const apercu = document.getElementById('apercu-logo-actuel');
  if (apercu) {
    if (vendeurConnecte.logo_url) { apercu.src = vendeurConnecte.logo_url; apercu.style.display = 'block'; }
    else { apercu.style.display = 'none'; }
  }
}

async function uploaderLogo() {
  const messageEl = document.getElementById('logo-message');

  if (!vendeurConnecte.logo_debloque) {
    messageEl.textContent = "Cette fonctionnalité n'est pas activée sur votre compte.";
    messageEl.style.color = 'red';
    return;
  }

  const fichier = document.getElementById('nouveau-logo-fichier').files[0];
  if (!fichier) {
    messageEl.textContent = "Choisissez d'abord une image.";
    messageEl.style.color = 'red';
    return;
  }

  messageEl.textContent = "Envoi en cours...";
  messageEl.style.color = '#777';

  const nomFichier = `${vendeurConnecte.id}/${Date.now()}-${fichier.name}`;

  const { error: erreurUpload } = await supabaseClient
    .storage
    .from('logos-vendeurs')
    .upload(nomFichier, fichier);

  if (erreurUpload) {
    messageEl.textContent = "Erreur lors de l'envoi.";
    messageEl.style.color = 'red';
    return;
  }

  const { data: urlData } = supabaseClient.storage.from('logos-vendeurs').getPublicUrl(nomFichier);

  const { error: erreurMaj } = await supabaseClient
    .from('vendeurs')
    .update({ logo_url: urlData.publicUrl })
    .eq('id', vendeurConnecte.id);

  if (erreurMaj) {
    messageEl.textContent = "Erreur lors de l'enregistrement.";
    messageEl.style.color = 'red';
    return;
  }

  vendeurConnecte.logo_url = urlData.publicUrl;
  document.getElementById('apercu-logo-actuel').src = urlData.publicUrl;
  document.getElementById('apercu-logo-actuel').style.display = 'block';
  document.getElementById('nouveau-logo-fichier').value = '';

  messageEl.textContent = "Logo mis à jour ✓";
  messageEl.style.color = 'green';
}

async function enregistrerInfos() {
  const numero_whatsapp = document.getElementById('info-whatsapp').value.trim();
  const wave_numero = document.getElementById('info-wave').value.trim();
  const om_numero = document.getElementById('info-om').value.trim();
  const instagram = document.getElementById('info-instagram').value.trim();
  const tiktok = document.getElementById('info-tiktok').value.trim();
  const facebook = document.getElementById('info-facebook').value.trim();

  const messageEl = document.getElementById('info-message');

  if (!numero_whatsapp) {
    messageEl.textContent = "Le numéro WhatsApp est obligatoire.";
    messageEl.style.color = 'red';
    return;
  }

  const { error } = await supabaseClient
    .from('vendeurs')
    .update({ numero_whatsapp, wave_numero, om_numero, instagram, tiktok, facebook, message_accueil })
    .eq('id', vendeurConnecte.id);

  if (error) {
    messageEl.textContent = "Erreur lors de l'enregistrement.";
    messageEl.style.color = 'red';
    return;
  }

  vendeurConnecte.numero_whatsapp = numero_whatsapp;
  vendeurConnecte.wave_numero = wave_numero;
  vendeurConnecte.om_numero = om_numero;
  vendeurConnecte.instagram = instagram;
  vendeurConnecte.tiktok = tiktok;
  vendeurConnecte.facebook = facebook;


  messageEl.textContent = "Informations mises à jour ✓";
  messageEl.style.color = 'green';
}

// ---- Stats principales (mois en cours + panier moyen + produit top) ----
async function chargerStats() {
  const debutMois = new Date();
  debutMois.setDate(1);
  debutMois.setHours(0, 0, 0, 0);

  const { data: commandes } = await supabaseClient
    .from('commandes')
    .select('total, contenu')
    .eq('vendeur_id', vendeurConnecte.id)
    .eq('statut', 'confirmee')
    .gte('date_creation', debutMois.toISOString());

  const { count: nbProduits } = await supabaseClient
    .from('produits')
    .select('*', { count: 'exact', head: true })
    .eq('vendeur_id', vendeurConnecte.id)
    .eq('actif', true);

  const nbCommandes = commandes ? commandes.length : 0;
  const totalFcfa = commandes ? commandes.reduce((sum, c) => sum + c.total, 0) : 0;
  const panierMoyen = nbCommandes > 0 ? Math.round(totalFcfa / nbCommandes) : 0;

  document.getElementById('stat-commandes').textContent = nbCommandes;
  document.getElementById('stat-produits').textContent = nbProduits || 0;
  document.getElementById('stat-total').textContent = totalFcfa.toLocaleString();
  document.getElementById('stat-panier-moyen').textContent = panierMoyen.toLocaleString();

  // Produit le plus commandé, à partir du contenu (jsonb) des commandes du mois
  const compteurProduits = {};
  (commandes || []).forEach(c => {
    (c.contenu || []).forEach(item => {
      const nomItem = item.nom || item.name || item.produit;
      const qte = item.quantite || item.qte || 1;
      if (!nomItem) return;
      compteurProduits[nomItem] = (compteurProduits[nomItem] || 0) + qte;
    });
  });

  const produitTopEl = document.getElementById('stat-produit-top');
  const entries = Object.entries(compteurProduits);
  if (entries.length === 0) {
    produitTopEl.textContent = '—';
  } else {
    entries.sort((a, b) => b[1] - a[1]);
    produitTopEl.textContent = entries[0][0];
  }
}

// ---- Mini graphique en barres : commandes des 7 derniers jours ----
async function chargerGraphique7Jours() {
  const jours = [];
  const debut = new Date();
  debut.setHours(0, 0, 0, 0);
  debut.setDate(debut.getDate() - 6);

  const { data: commandes } = await supabaseClient
    .from('commandes')
    .select('date_creation')
    .eq('vendeur_id', vendeurConnecte.id)
    .eq('statut', 'confirmee')
    .gte('date_creation', debut.toISOString());

  const compteurParJour = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(debut);
    d.setDate(debut.getDate() + i);
    const cle = d.toISOString().slice(0, 10);
    compteurParJour[cle] = 0;
    jours.push(cle);
  }

  (commandes || []).forEach(c => {
    const cle = c.date_creation.slice(0, 10);
    if (compteurParJour[cle] !== undefined) compteurParJour[cle]++;
  });

  const max = Math.max(1, ...Object.values(compteurParJour));
  const conteneur = document.getElementById('chart-7jours');
  conteneur.innerHTML = '';

  const nomsJours = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

  jours.forEach(cle => {
    const val = compteurParJour[cle];
    const d = new Date(cle);
    const hauteur = Math.round((val / max) * 100);
    conteneur.innerHTML += `
      <div class="chart-bar-col">
        <div class="chart-bar-val">${val > 0 ? val : ''}</div>
        <div class="chart-bar" style="height:${Math.max(hauteur, 3)}%;"></div>
        <div class="chart-bar-label">${nomsJours[d.getDay()]}</div>
      </div>
    `;
  });
}

// ---- Produits (avec miniature photo) ----
async function chargerProduits() {
  const { data: produits } = await supabaseClient
    .from('produits')
    .select('*')
    .eq('vendeur_id', vendeurConnecte.id)
    .eq('actif', true)
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
    ? `<span class="prix">${p.prix.toLocaleString()} FCFA · ${p.categorie} · Stock : ${p.quantite_stock === null || p.quantite_stock === undefined ? 'illimité' : p.quantite_stock}</span>`
    : `<span class="prix">${p.prix.toLocaleString()} FCFA · ${p.categorie}</span>`;

  const boutonsReorder = avecReorder ? `
        <button class="icon-btn" ${index === 0 ? 'disabled style="opacity:0.3;"' : ''} title="Monter dans cette catégorie" onclick="deplacerProduit('${p.id}', -1)">
          <i class="fa-solid fa-arrow-up"></i>
        </button>
        <button class="icon-btn" ${index === totalCategorie - 1 ? 'disabled style="opacity:0.3;"' : ''} title="Descendre dans cette catégorie" onclick="deplacerProduit('${p.id}', 1)">
          <i class="fa-solid fa-arrow-down"></i>
        </button>` : '';

  return `
    <div class="produit-row">
      ${imgSrc
        ? `<img src="${imgSrc}" class="produit-thumb" alt="${p.nom}">`
        : `<div class="produit-thumb" style="display:flex;align-items:center;justify-content:center;color:#ccc;"><i class="fa-solid fa-image"></i></div>`}
      <div class="produit-infos">
        <strong>${p.nom}</strong>
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
        <button class="icon-btn danger" title="Retirer du site" onclick="supprimerProduit('${p.id}')">
          <i class="fa-solid fa-trash"></i>
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

    const nomFichier = `${vendeurConnecte.id}/${Date.now()}-${fichier.name}`;

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

    const nomFichierVideo = `${vendeurConnecte.id}/${Date.now()}-${fichierVideo.name}`;

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

async function supprimerProduit(id) {
  await supabaseClient.from('produits').update({ actif: false }).eq('id', id);
  await chargerProduits();
  await chargerStats();
}

// ---- Commandes : version courte (dashboard) + version complète (onglet Commandes) ----
async function chargerCommandes() {
  const { data: commandes } = await supabaseClient
    .from('commandes')
    .select('*')
    .eq('vendeur_id', vendeurConnecte.id)
    .order('date_creation', { ascending: false })
    .limit(5);

  afficherListeCommandes(commandes, 'liste-commandes-admin');

  // Version complète (jusqu'à 50) pour l'onglet dédié
  const { data: commandesCompletes } = await supabaseClient
    .from('commandes')
    .select('*')
    .eq('vendeur_id', vendeurConnecte.id)
    .order('date_creation', { ascending: false })
    .limit(50);

  afficherListeCommandes(commandesCompletes, 'liste-commandes-complete');
}

function afficherListeCommandes(commandes, idConteneur) {
  const liste = document.getElementById(idConteneur);
  liste.innerHTML = '';

  // La sélection multiple n'existe que dans l'onglet "Commandes" complet,
  // pas dans le mini-résumé du dashboard.
  const avecSelection = idConteneur === 'liste-commandes-complete';

  if (!commandes || commandes.length === 0) {
    liste.innerHTML = '<p class="empty-state">Aucune commande pour le moment.</p>';
    if (avecSelection) majBoutonConfirmerSelection();
    return;
  }

  commandes.forEach(c => {
    const date = new Date(c.date_creation).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const estConfirmee = c.statut === 'confirmee';
    const checkbox = (avecSelection && !estConfirmee)
      ? `<input type="checkbox" class="check-commande" data-id="${c.id}" onchange="majBoutonConfirmerSelection()" style="margin-right:8px;">`
      : '';
    liste.innerHTML += `
      <div class="commande-row">
        ${checkbox}<span class="total">${c.total.toLocaleString()} FCFA</span>
        <strong>${c.nom_client} ${c.prenom_client}</strong>
        <span class="badge-statut" style="${estConfirmee ? '' : 'background:#fff3cd;color:#8a6d00;'}">${estConfirmee ? 'Confirmée' : 'En attente'}</span>
        <br><small style="color:#999;">${date} · ${c.numero_client}</small>
        ${!estConfirmee ? `<br><button class="admin-btn" style="width:auto;padding:6px 14px;font-size:12px;margin-top:6px;" onclick="confirmerCommande('${c.id}')">✓ Marquer comme confirmée</button>` : ''}
        ${c.recu_url ? `<br><a href="${c.recu_url}" target="_blank" style="font-size:12px; color:var(--couleur-accent, #e56400); font-weight:600;"><i class="fa-solid fa-file-pdf"></i> Voir le reçu</a>` : ''}
      </div>
    `;
  });

  if (avecSelection) majBoutonConfirmerSelection();
}

// Affiche/masque le bouton "Confirmer la sélection" selon le nombre de
// commandes cochées, et met à jour son texte avec le compteur.
function majBoutonConfirmerSelection() {
  const bouton = document.getElementById('btn-confirmer-selection');
  if (!bouton) return;
  const nb = document.querySelectorAll('#liste-commandes-complete .check-commande:checked').length;
  bouton.style.display = nb ? 'inline-block' : 'none';
  bouton.textContent = `✓ Confirmer la sélection (${nb})`;
}

// Logique de confirmation "brute" (mise à jour du statut + décompte de stock),
// réutilisée par confirmerCommande() (une seule) et confirmerSelection() (plusieurs
// d'un coup) — sans recharger les listes/stats à chaque itération.
async function confirmerCommandeInterne(id) {
  const { data: commande } = await supabaseClient.from('commandes').select('contenu').eq('id', id).single();

  await supabaseClient.from('commandes').update({ statut: 'confirmee' }).eq('id', id);

  // Décompte du stock uniquement maintenant que la commande est confirmée
  if (commande && commande.contenu) {
    for (const item of commande.contenu) {
      if (item.produit_id) {
        await supabaseClient.rpc('decrementer_stock', {
          p_produit_id: item.produit_id,
          p_quantite: item.quantite
        });
      }
    }
  }
}

// Le vendeur confirme qu'il a bien reçu la commande sur WhatsApp (le client a
// vraiment envoyé le message). Seules les commandes confirmées comptent dans
// le chiffre d'affaires et les stats — un simple clic sur "Commander" qui
// ouvre WhatsApp sans envoi réel ne doit pas gonfler les ventes.
async function confirmerCommande(id) {
  await confirmerCommandeInterne(id);
  await chargerCommandes();
  await chargerStats();
}

// Confirme en une seule fois toutes les commandes cochées dans l'onglet
// "Commandes" — utile pour un vendeur qui a beaucoup de commandes en attente
// et ne veut pas cliquer une par une.
async function confirmerSelection() {
  const cases = document.querySelectorAll('#liste-commandes-complete .check-commande:checked');
  const ids = Array.from(cases).map(el => el.dataset.id);
  if (!ids.length) return;

  const bouton = document.getElementById('btn-confirmer-selection');
  if (bouton) { bouton.disabled = true; bouton.textContent = 'Confirmation en cours…'; }

  for (const id of ids) {
    await confirmerCommandeInterne(id);
  }

  if (bouton) bouton.disabled = false;

  await chargerCommandes();
  await chargerStats();
}

// ============================================
// Dépenses (Pro et Premium) + Bénéfice net (Premium uniquement)
// ============================================
async function ajouterDepense() {
  const montant = parseInt(document.getElementById('nouvelle-depense-montant').value);
  const note = document.getElementById('nouvelle-depense-note').value.trim();
  const messageEl = document.getElementById('depense-message');

  if (!montant || montant <= 0) {
    messageEl.textContent = "Indiquez un montant valide.";
    messageEl.style.color = 'red';
    return;
  }

  const { error } = await supabaseClient.from('depenses').insert({
    vendeur_id: vendeurConnecte.id,
    montant,
    note: note || null
  });

  if (error) {
    messageEl.textContent = "Erreur lors de l'ajout.";
    messageEl.style.color = 'red';
    return;
  }

  messageEl.textContent = "Dépense ajoutée ✓";
  messageEl.style.color = 'green';
  document.getElementById('nouvelle-depense-montant').value = '';
  document.getElementById('nouvelle-depense-note').value = '';

  await chargerDepenses();
  if (auMoins('premium')) await chargerBeneficeNet();
}

async function chargerDepenses() {
  const liste = document.getElementById('liste-depenses-admin');
  if (!liste) return;

  const debutMois = new Date();
  debutMois.setDate(1);
  debutMois.setHours(0, 0, 0, 0);

  const { data: depenses } = await supabaseClient
    .from('depenses')
    .select('*')
    .eq('vendeur_id', vendeurConnecte.id)
    .gte('date_creation', debutMois.toISOString())
    .order('date_creation', { ascending: false });

  if (!depenses || depenses.length === 0) {
    liste.innerHTML = '<p class="empty-state">Aucune dépense enregistrée ce mois-ci.</p>';
    return;
  }

  liste.innerHTML = depenses.map(d => {
    const date = new Date(d.date_creation).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    return `
      <div class="commande-row">
        <span class="total">${d.montant.toLocaleString()} FCFA</span>
        <strong>${d.note || 'Dépense'}</strong>
        <br><small style="color:#999;">${date}</small>
      </div>
    `;
  }).join('');
}

async function chargerBeneficeNet() {
  const carte = document.getElementById('stat-benefice-net');
  if (!carte) return;

  const debutMois = new Date();
  debutMois.setDate(1);
  debutMois.setHours(0, 0, 0, 0);

  const { data: commandes } = await supabaseClient
    .from('commandes')
    .select('total')
    .eq('vendeur_id', vendeurConnecte.id)
    .gte('date_creation', debutMois.toISOString());

  const { data: depenses } = await supabaseClient
    .from('depenses')
    .select('montant')
    .eq('vendeur_id', vendeurConnecte.id)
    .gte('date_creation', debutMois.toISOString());

  const totalVentes = (commandes || []).reduce((sum, c) => sum + c.total, 0);
  const totalDepenses = (depenses || []).reduce((sum, d) => sum + d.montant, 0);
  const benefice = totalVentes - totalDepenses;

  carte.textContent = benefice.toLocaleString();
  carte.style.color = benefice >= 0 ? 'inherit' : '#e00';
}

// ============================================
// Export CSV des commandes (Premium uniquement)
// ============================================
async function exporterCommandesCSV() {
  const { data: commandes, error } = await supabaseClient
    .from('commandes')
    .select('*')
    .eq('vendeur_id', vendeurConnecte.id)
    .order('date_creation', { ascending: false });

  if (error || !commandes || commandes.length === 0) {
    alert("Aucune commande à exporter pour le moment.");
    return;
  }

  const echapper = (val) => `"${String(val === null || val === undefined ? '' : val).replace(/"/g, '""')}"`;

  const entetes = ['Date', 'Nom', 'Prénom', 'Numéro', 'Adresse', 'Produits commandés', 'Total (FCFA)', 'Statut'];
  const lignes = commandes.map(c => {
    const date = new Date(c.date_creation).toLocaleString('fr-FR');
    const produits = (c.contenu || []).map(item => `${item.produit} x${item.quantite}`).join(' | ');
    return [date, c.nom_client, c.prenom_client, c.numero_client, c.adresse, produits, c.total, c.statut]
      .map(echapper).join(',');
  });

  // Le \uFEFF (BOM) permet à Excel d'afficher correctement les accents
  const contenuCSV = '\uFEFF' + entetes.map(echapper).join(',') + '\n' + lignes.join('\n');

  const blob = new Blob([contenuCSV], { type: 'text/csv;charset=utf-8;' });
  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(blob);
  lien.download = `commandes-${vendeurConnecte.slug || 'export'}-${Date.now()}.csv`;
  lien.click();
  URL.revokeObjectURL(lien.href);
}

// ============================================
// QR code de la boutique (généré à partir du lien propre)
// ============================================
function genererQRCode() {
  const imgEl = document.getElementById('qr-code-boutique');
  const lienEl = document.getElementById('qr-code-lien');
  const telechargerEl = document.getElementById('qr-code-telecharger');
  if (!imgEl || !vendeurConnecte || !vendeurConnecte.slug) return;

  const lienBoutique = `https://shop.moncmd.site/${vendeurConnecte.slug}`;
  const urlQRCode = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(lienBoutique)}`;

  imgEl.src = urlQRCode;
  lienEl.textContent = lienBoutique;
  telechargerEl.href = urlQRCode;
  telechargerEl.download = `qr-code-${vendeurConnecte.slug}.png`;
}
