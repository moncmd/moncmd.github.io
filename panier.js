// Affiche le détail d'un produit (page panier.html?id=...)
// Appelée automatiquement une fois que chargerBoutique() a fini de charger les produits
async function afficherProduitDetail() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id'); // UUID Supabase, pas un nombre — pas de parseInt ici

  if (!id) return;

  const produit = produits.find(p => p.id === id);
  if (!produit) return;

  const conteneurGauche = document.querySelector('.left');
  conteneurGauche.innerHTML = produit.video_url
    ? `<video src="${produit.video_url}" muted loop playsinline autoplay controls></video>`
    : `<img src="${produit.image_url}" alt="${produit.nom}">`;

  document.querySelector('.right .nom').textContent = produit.nom;
  document.querySelector('.right .description').textContent = produit.description || '';
  document.querySelector('.right .prix').textContent = produit.prix + ' FCFA';

  document.getElementById('btn-acheter').onclick = function () {
    const commentaire = document.querySelector('textarea')?.value || '';
    ajouterAuPanier(produit.id, commentaire);
  };

  // Masquer le champ commentaire et afficher les avis clients à la place —
  // activable vendeur par vendeur via vendeurs.masquer_commentaire_produit
  // (demande spécifique de Global Finds, ne touche pas aux autres vendeurs import).
  // "await" ici est important : script.js attend la fin de cette fonction avant
  // de cacher l'écran de chargement, pour ne jamais laisser voir le commentaire
  // par défaut une fraction de seconde avant qu'il soit remplacé par les avis.
  if (vendeurActuel && vendeurActuel.masquer_commentaire_produit === true) {
    await afficherAvisAuLieuDuCommentaire();
  }
}

async function afficherAvisAuLieuDuCommentaire() {
  const textarea = document.querySelector('.right textarea');
  if (!textarea) return;

  const conteneurAvis = document.createElement('div');
  conteneurAvis.className = 'avis-produit-remplacement';
  conteneurAvis.style.cssText = 'margin:14px 0;';
  conteneurAvis.innerHTML = '<p style="font-size:13px;color:#999;">Chargement des avis…</p>';
  textarea.replaceWith(conteneurAvis);

  const { data: avis } = await supabaseClient
    .from('avis')
    .select('*')
    .eq('vendeur_id', vendeurActuel.id)
    .eq('statut', 'approuve')
    .order('date_creation', { ascending: false })
    .limit(3);

  if (!avis || avis.length === 0) {
    conteneurAvis.innerHTML = '';
    return;
  }

  conteneurAvis.innerHTML = `
    <p style="font-weight:700; font-size:13px; margin-bottom:8px;">Ce que nos clients disent</p>
    ${avis.map(a => `
      <div style="padding:10px 0; border-top:1px solid #eee;">
        <div style="color:#e8b923; font-size:12px;">${'★'.repeat(a.note || 5)}</div>
        <p style="font-size:13px; margin:4px 0;">${a.commentaire || ''}</p>
        <p style="font-size:11px; color:#999;">${a.nom_client || 'Client'}</p>
      </div>
    `).join('')}
  `;
}
