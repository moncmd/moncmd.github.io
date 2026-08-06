// ============================================
// Configuration Supabase — CMD.
// ============================================

const SUPABASE_URL = "https://tzzjsorxpmfmoklmvgre.supabase.co";
const SUPABASE_KEY = "sb_publishable_d0OOxgtzghAfkJXpPE6URw_BduJourm";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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
