// Affiche le détail d'un produit (page panier.html?id=...)
// Appelée automatiquement une fois que chargerBoutique() a fini de charger les produits
function afficherProduitDetail() {
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
    const commentaire = document.querySelector('textarea').value;
    ajouterAuPanier(produit.id, commentaire);
  };
}
