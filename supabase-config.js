// ============================================
// Configuration Supabase — CMD.
// ============================================

const SUPABASE_URL = "https://tzzjsorxpmfmoklmvgre.supabase.co";
const SUPABASE_KEY = "sb_publishable_d0OOxgtzghAfkJXpPE6URw_BduJourm";

// Retour d'un lien reçu par email (confirmation d'inscription, mot de passe
// oublié…) arrivé sur une page boutique : on l'envoie vers l'espace vendeur
// AVANT que la page ne charge la boutique de démo.
(function redirigerRetourEmail() {
  const h = window.location.hash || '';
  const q = window.location.search || '';
  const retourEmail = /access_token=|refresh_token=|error_description=|type=(signup|recovery|magiclink|invite|email_change)/.test(h)
    || /[?&](code|token_hash)=/.test(q);
  const pagesCompte = ['/admin.html', '/admin-prestations.html', '/inscription.html', '/super-admin.html', '/apparence.html', '/abonnement.html'];
  if (retourEmail && !pagesCompte.includes(window.location.pathname)) {
    window.location.replace('/admin.html' + q + h);
  }
})();

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Devise d'affichage de la boutique (FCFA par défaut). Réglée par le vendeur.
function deviseBoutique() {
  try {
    if (typeof vendeurActuel !== 'undefined' && vendeurActuel && vendeurActuel.devise) return vendeurActuel.devise;
  } catch (e) { /* page sans boutique */ }
  return 'FCFA';
}

// Récupère le "slug" du vendeur depuis l'URL
// Deux formats supportés :
//   - Lien classique : moncmd.github.io/index.html?v=victoryfood
//   - Lien propre     : shop.moncmd.site/victoryfood
// Si aucun des deux, on utilise "demo"
function getVendeurSlug() {
  const params = new URLSearchParams(window.location.search);
  const slugParam = params.get('v');
  if (slugParam) return slugParam;

  const NOMS_DE_PAGES_CONNUS = ['index', 'panier', 'commande', 'admin', '404'];
  const chemin = window.location.pathname.replace(/^\/|\/$/g, '');
  const premierSegment = chemin.split('/')[0] || '';
  const nomBase = premierSegment.replace('.html', '').split('-')[0];

  if (premierSegment && !NOMS_DE_PAGES_CONNUS.includes(nomBase)) {
    return premierSegment;
  }

  return 'demo';
}

// Nettoie un nom de fichier avant upload vers Supabase Storage.
// Supabase Storage peut rejeter (erreur 400) les clés contenant des espaces,
// des accents ou certains caractères spéciaux — très fréquent avec les noms
// de fichiers par défaut (ex: "Sans titre - 14 juillet 2026 à 18.07.07.png",
// "Capture d'écran...png"). On ne garde que lettres/chiffres/points/tirets.
function nettoyerNomFichier(nom) {
  const dernierPoint = nom.lastIndexOf('.');
  const base = dernierPoint !== -1 ? nom.slice(0, dernierPoint) : nom;
  const extension = dernierPoint !== -1 ? nom.slice(dernierPoint + 1) : '';

  const baseNettoyee = base
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // enlève les accents (é -> e, à -> a...)
    .replace(/[^a-zA-Z0-9]+/g, '-')                    // tout ce qui n'est pas alphanumérique -> tiret
    .replace(/^-+|-+$/g, '')                           // enlève les tirets en début/fin
    .toLowerCase() || 'fichier';

  const extensionNettoyee = extension.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

  return extensionNettoyee ? `${baseNettoyee}.${extensionNettoyee}` : baseNettoyee;
}

// Échappe le HTML avant d'insérer du texte saisi par un client ou un vendeur
// (nom, commentaire, adresse, avis...) dans du innerHTML. Sans ça, n'importe
// qui peut soumettre un avis ou une commande avec un nom du type
// "<img src=x onerror=...>" qui s'exécute ensuite dans le navigateur de tous
// les visiteurs ET dans l'admin du vendeur (XSS stocké). TOUJOURS utiliser
// cette fonction pour toute donnée venant de la base et affichée en innerHTML.
function echapperHTML(texte) {
  if (texte === null || texte === undefined) return '';
  return String(texte)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}