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
  if (!vendeur || !vendeur.essai_fin) return;
  const fin = new Date(vendeur.essai_fin);
  const msRestants = fin - new Date();
  if (msRestants <= 0) return;

  const jours = Math.ceil(msRestants / 86400000);
  const dateFin = fin.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  const message = encodeURIComponent(`Bonjour, je souhaite garder ma formule pour la boutique "${vendeur.nom_boutique}" (${vendeur.slug}).`);

  const bandeau = document.createElement('div');
  bandeau.className = 'cmd-bandeau-essai';
  bandeau.innerHTML = `
    <span>Essai Premium : <strong>${jours} jour${jours > 1 ? 's' : ''}</strong> restant${jours > 1 ? 's' : ''} (jusqu'au ${echapperHTML(dateFin)}). Ensuite, ta boutique passe en Standard.</span>
    <a href="https://wa.me/${CMD_CONTACT_WHATSAPP}?text=${message}" target="_blank" rel="noopener">Garder Premium</a>`;

  const conteneur = document.getElementById('vue-dashboard');
  if (conteneur && !conteneur.querySelector('.cmd-bandeau-essai')) conteneur.prepend(bandeau);
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
  if (erreurEl && !document.querySelector('.cmd-liens-login')) {
    const liens = document.createElement('div');
    liens.className = 'cmd-liens-login';
    liens.innerHTML = `
      <a onclick="motDePasseOublie()">Mot de passe oublié ?</a>
      <a href="/inscription.html">Pas encore de boutique ? Créer ma boutique</a>`;
    erreurEl.insertAdjacentElement('afterend', liens);
  }
});
