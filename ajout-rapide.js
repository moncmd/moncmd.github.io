// ============================================
// CMD. — ajout-rapide.js
// Ajout de produits EN MASSE pour les gros catalogues (marchés, grossistes) :
// on choisit 10, 30 ou 50 photos d'un coup, on tape juste le prix (le nom
// vient du nom de la photo, modifiable), et tout est créé en une fois.
// Les photos sont réduites dans le téléphone avant l'envoi (≈ 200 Ko au lieu
// de 3 à 5 Mo) : envoi plus rapide, boutique plus légère.
// ============================================

let lotAjoutRapide = [];

function initAjoutRapide() {
  const onglet = document.getElementById('onglet-produits');
  if (!onglet || document.getElementById('cmd-ajout-rapide')) return;
  const carte = document.createElement('div');
  carte.id = 'cmd-ajout-rapide';
  carte.className = 'admin-card';
  carte.innerHTML = `
    <h3>Ajout rapide</h3>
    <p class="cmd-ar-aide">Beaucoup de produits ? Choisis toutes tes photos d'un coup, puis tape juste le nom et le prix de chacun.</p>
    <label class="cmd-ar-choisir">
      <input type="file" id="cmd-ar-photos" accept="image/*" multiple hidden>
      <span>Choisir des photos</span>
    </label>
    <div id="cmd-ar-liste"></div>
    <div id="cmd-ar-bas" hidden>
      <label class="cmd-ar-cat">Catégorie pour tous <input type="text" id="cmd-ar-categorie" maxlength="40" placeholder="Ex : robes"></label>
      <button type="button" class="cmd-ar-creer" id="cmd-ar-creer">Créer les produits</button>
      <p class="cmd-ar-msg" id="cmd-ar-msg" role="status"></p>
    </div>`;
  onglet.prepend(carte);

  document.getElementById('cmd-ar-photos').addEventListener('change', (e) => {
    const fichiers = Array.from(e.target.files || []).slice(0, 60);
    fichiers.forEach((f) => {
      const nom = f.name.replace(/\.[^.]+$/, '').replace(/^(IMG|DSC|PXL|WhatsApp Image)[-_ ]?/i, '').replace(/[_-]+/g, ' ').replace(/\d{6,}/g, '').trim();
      lotAjoutRapide.push({ fichier: f, apercu: URL.createObjectURL(f), nom: nom.length > 2 ? nom.charAt(0).toUpperCase() + nom.slice(1) : '', prix: '' });
    });
    e.target.value = '';
    dessinerAjoutRapide();
  });
  document.getElementById('cmd-ar-creer').addEventListener('click', creerLotAjoutRapide);

  const style = document.createElement('style');
  style.textContent = `
    .cmd-ar-aide { color: #888; font-size: 13px; margin: 4px 0 12px; }
    .cmd-ar-choisir span { display: block; text-align: center; padding: 14px; border: 1.5px dashed #d5d5d5; border-radius: 12px; font-weight: 600; cursor: pointer; }
    .cmd-ar-ligne { display: grid; grid-template-columns: 56px 1fr 110px 28px; gap: 8px; align-items: center; padding: 8px 0; border-bottom: 1px solid #f2f2f2; }
    .cmd-ar-ligne img { width: 56px; height: 56px; object-fit: cover; border-radius: 10px; background: #f4f4f4; }
    .cmd-ar-ligne input { padding: 10px; border: 1px solid #e3e3e3; border-radius: 10px; font: inherit; font-size: 14px; width: 100%; box-sizing: border-box; margin: 0 !important; }
    .cmd-ar-ligne button { border: none; background: none; color: #c0392b; font-size: 16px; cursor: pointer; }
    .cmd-ar-ligne.ok { opacity: .45; }
    .cmd-ar-ligne.ko input { border-color: #c0392b; }
    #cmd-ar-bas { margin-top: 12px; display: flex; flex-direction: column; gap: 10px; }
    #cmd-ar-bas[hidden] { display: none; }
    .cmd-ar-cat { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #666; }
    .cmd-ar-cat input { padding: 10px; border: 1px solid #e3e3e3; border-radius: 10px; font: inherit; margin: 0 !important; }
    .cmd-ar-creer { border: none; border-radius: 12px; padding: 14px; background: var(--couleur-accent, #e56400); color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
    .cmd-ar-creer:disabled { opacity: .6; cursor: wait; }
    .cmd-ar-msg { margin: 0; font-size: 13.5px; min-height: 1em; }
  `;
  document.head.appendChild(style);
}

function dessinerAjoutRapide() {
  const liste = document.getElementById('cmd-ar-liste');
  liste.innerHTML = lotAjoutRapide.map((p, i) => `
    <div class="cmd-ar-ligne${p.fait ? ' ok' : ''}${p.erreur ? ' ko' : ''}" data-i="${i}">
      <img src="${p.apercu}" alt="">
      <input type="text" data-champ="nom" maxlength="80" placeholder="Nom du produit" value="${echapperHTML(p.nom)}">
      <input type="number" data-champ="prix" inputmode="numeric" min="0" placeholder="Prix" value="${echapperHTML(p.prix)}">
      <button type="button" data-retirer title="Retirer">✕</button>
    </div>`).join('');
  liste.querySelectorAll('.cmd-ar-ligne').forEach((ligne) => {
    const p = lotAjoutRapide[Number(ligne.dataset.i)];
    ligne.querySelector('[data-champ="nom"]').addEventListener('input', (e) => { p.nom = e.target.value; });
    ligne.querySelector('[data-champ="prix"]').addEventListener('input', (e) => { p.prix = e.target.value; });
    ligne.querySelector('[data-retirer]').addEventListener('click', () => {
      URL.revokeObjectURL(p.apercu);
      lotAjoutRapide.splice(Number(ligne.dataset.i), 1);
      dessinerAjoutRapide();
    });
  });
  document.getElementById('cmd-ar-bas').hidden = !lotAjoutRapide.length;
  const restant = lotAjoutRapide.filter((p) => !p.fait).length;
  document.getElementById('cmd-ar-creer').textContent = restant ? `Créer ${restant} produit${restant > 1 ? 's' : ''}` : 'Créer les produits';
}

// Réduit une photo à 1200 px de côté, en JPEG (≈ 150 à 300 Ko)
function reduirePhoto(fichier) {
  return new Promise((resoudre) => {
    const img = new Image();
    img.onload = () => {
      const echelle = Math.min(1, 1200 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * echelle);
      canvas.height = Math.round(img.height * echelle);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => resoudre(blob || fichier), 'image/jpeg', 0.82);
    };
    img.onerror = () => resoudre(fichier);
    img.src = URL.createObjectURL(fichier);
  });
}

async function creerLotAjoutRapide() {
  const btn = document.getElementById('cmd-ar-creer');
  const msg = document.getElementById('cmd-ar-msg');
  const categorie = (document.getElementById('cmd-ar-categorie').value.trim() || 'general').toLowerCase();
  const aFaire = lotAjoutRapide.filter((p) => !p.fait);
  aFaire.forEach((p) => { p.erreur = !(String(p.nom).trim() && Number(p.prix) > 0); });
  if (aFaire.some((p) => p.erreur)) {
    dessinerAjoutRapide();
    msg.style.color = '#c0392b';
    msg.textContent = 'Il manque un nom ou un prix sur les lignes en rouge.';
    return;
  }

  btn.disabled = true;
  msg.style.color = '';
  let ordre = (typeof produitsCache !== 'undefined' && produitsCache.length) ? Math.max(...produitsCache.map((x) => x.ordre || 0)) + 1 : 0;
  let crees = 0;
  for (const p of aFaire) {
    msg.textContent = `Création ${crees + 1} sur ${aFaire.length}…`;
    try {
      const photo = await reduirePhoto(p.fichier);
      const chemin = `${vendeurConnecte.id}/${Date.now()}-${crees}.jpg`;
      const { error: errUp } = await supabaseClient.storage.from('produits-images').upload(chemin, photo, { contentType: 'image/jpeg' });
      if (errUp) throw errUp;
      const { data: url } = supabaseClient.storage.from('produits-images').getPublicUrl(chemin);
      const { error } = await supabaseClient.from('produits').insert({
        vendeur_id: vendeurConnecte.id, nom: String(p.nom).trim().slice(0, 80), prix: Math.round(Number(p.prix)),
        categorie, image_url: url.publicUrl, actif: true, ordre: ordre++
      });
      if (error) throw error;
      p.fait = true;
      crees++;
    } catch (e) {
      p.erreur = true;
      msg.style.color = '#c0392b';
      msg.textContent = `${crees} produit(s) créé(s). Arrêt : ${e.message || 'erreur inconnue'}`;
      break;
    }
  }
  btn.disabled = false;
  if (crees === aFaire.length) {
    msg.style.color = '#1f7a3a';
    msg.textContent = `${crees} produit${crees > 1 ? 's' : ''} ajouté${crees > 1 ? 's' : ''} à ta boutique.`;
    lotAjoutRapide.forEach((p) => URL.revokeObjectURL(p.apercu));
    lotAjoutRapide = [];
  }
  dessinerAjoutRapide();
  if (typeof chargerProduits === 'function') await chargerProduits();
}

document.addEventListener('DOMContentLoaded', initAjoutRapide);
