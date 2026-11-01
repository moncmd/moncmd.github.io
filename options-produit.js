// ============================================
// CMD. — options-produit.js
// Éditeur des options d'un produit dans l'admin (taille, couleur,
// pointure, suppléments…). Chargé par admin.html et admin-prestations.html.
// Les données vont dans produits.options (jsonb), vérifiées par la base
// au moment de la commande.
// ============================================

let optionsProduitEnCours = [];

function initEditeurOptionsProduit() {
  const description = document.getElementById('nouveau-description');
  if (!description || document.getElementById('cmd-editeur-options')) return;

  const bloc = document.createElement('div');
  bloc.id = 'cmd-editeur-options';
  bloc.innerHTML = `
    <div class="cmd-eo-entete">
      <strong>Options</strong>
      <span>Taille, couleur, pointure, suppléments… (facultatif)</span>
    </div>
    <div id="cmd-eo-groupes"></div>
    <div class="cmd-eo-raccourcis">
      <button type="button" data-modele="taille">+ Tailles</button>
      <button type="button" data-modele="couleur">+ Couleurs</button>
      <button type="button" data-modele="pointure">+ Pointures</button>
      <button type="button" data-modele="supplement">+ Suppléments</button>
      <button type="button" data-modele="vide">+ Autre</button>
    </div>`;
  description.insertAdjacentElement('afterend', bloc);

  const MODELES = {
    taille: { nom: 'Taille', obligatoire: true, multiple: false, choix: ['S', 'M', 'L', 'XL'] },
    couleur: { nom: 'Couleur', obligatoire: true, multiple: false, choix: ['Noir', 'Blanc'] },
    pointure: { nom: 'Pointure', obligatoire: true, multiple: false, choix: ['38', '39', '40', '41', '42'] },
    supplement: { nom: 'Suppléments', obligatoire: false, multiple: true, choix: ['Emballage cadeau'] },
    vide: { nom: '', obligatoire: false, multiple: false, choix: [''] }
  };
  bloc.querySelectorAll('[data-modele]').forEach((b) => b.addEventListener('click', () => {
    const m = MODELES[b.dataset.modele];
    optionsProduitEnCours.push({ nom: m.nom, obligatoire: m.obligatoire, multiple: m.multiple,
      choix: m.choix.map((c) => ({ nom: c, prix: 0, disponible: true })) });
    dessinerEditeurOptions();
  }));

  const style = document.createElement('style');
  style.textContent = `
    #cmd-editeur-options { border: 1px solid #e5e5e5; border-radius: 12px; padding: 12px; margin-bottom: 12px; background: #fcfcfc; }
    .cmd-eo-entete strong { display: block; font-size: 14px; }
    .cmd-eo-entete span { font-size: 12.5px; color: #888; }
    .cmd-eo-raccourcis { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
    .cmd-eo-raccourcis button, .cmd-eo-mini { border: 1px solid #ddd; background: #fff; border-radius: 999px; padding: 6px 11px; font: inherit; font-size: 12.5px; cursor: pointer; }
    .cmd-eo-groupe { border-top: 1px solid #eee; padding-top: 10px; margin-top: 10px; }
    .cmd-eo-ligne { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
    .cmd-eo-ligne input[type="text"], .cmd-eo-ligne input[type="number"] { padding: 8px; border: 1px solid #ddd; border-radius: 8px; font: inherit; font-size: 13px; margin: 0; min-width: 0; }
    .cmd-eo-ligne input.nom { flex: 1; }
    .cmd-eo-ligne input.prix { width: 90px; }
    .cmd-eo-ligne label { font-size: 12px; color: #666; display: flex; align-items: center; gap: 4px; white-space: nowrap; }
    .cmd-eo-ligne label input { width: auto; margin: 0; }
    .cmd-eo-suppr { border: none; background: none; color: #c0392b; font-size: 16px; cursor: pointer; padding: 4px 6px; }
    .cmd-eo-reglages { display: flex; flex-wrap: wrap; gap: 12px; margin: 2px 0 8px; }
    #cmd-editeur-options input[type="checkbox"] { width: auto !important; margin: 0 !important; padding: 0 !important; flex: 0 0 auto; }
    .cmd-eo-reglages label { display: flex !important; flex-direction: row; align-items: center; gap: 6px; white-space: nowrap; font-size: 12.5px; color: #555; margin: 0 !important; }
  `;
  document.head.appendChild(style);
  dessinerEditeurOptions();
}

function dessinerEditeurOptions() {
  const zone = document.getElementById('cmd-eo-groupes');
  if (!zone) return;
  zone.innerHTML = optionsProduitEnCours.map((g, gi) => `
    <div class="cmd-eo-groupe" data-g="${gi}">
      <div class="cmd-eo-ligne">
        <input type="text" class="nom" data-champ="nom" maxlength="40" placeholder="Nom (ex : Taille)" value="${echapperHTML(g.nom)}">
        <button type="button" class="cmd-eo-suppr" data-suppr-groupe title="Supprimer ce groupe">✕</button>
      </div>
      <div class="cmd-eo-reglages">
        <label class="cmd-eo-ligne" style="margin:0"><input type="checkbox" data-champ="obligatoire" ${g.obligatoire ? 'checked' : ''}> Choix obligatoire</label>
        <label class="cmd-eo-ligne" style="margin:0"><input type="checkbox" data-champ="multiple" ${g.multiple ? 'checked' : ''}> Plusieurs choix possibles</label>
      </div>
      ${g.choix.map((c, ci) => `
        <div class="cmd-eo-ligne" data-c="${ci}">
          <input type="text" class="nom" data-choix="nom" maxlength="40" placeholder="Choix" value="${echapperHTML(c.nom)}">
          <input type="number" class="prix" data-choix="prix" step="50" placeholder="+ prix" value="${Number(c.prix) || ''}" title="Supplément en FCFA (vide = même prix)">
          <label><input type="checkbox" data-choix="disponible" ${c.disponible !== false ? 'checked' : ''}> Dispo</label>
          <button type="button" class="cmd-eo-suppr" data-suppr-choix title="Retirer ce choix">✕</button>
        </div>`).join('')}
      <button type="button" class="cmd-eo-mini" data-ajout-choix>+ Ajouter un choix</button>
    </div>`).join('');

  zone.querySelectorAll('[data-g]').forEach((bloc) => {
    const g = optionsProduitEnCours[Number(bloc.dataset.g)];
    bloc.querySelector('[data-champ="nom"]').addEventListener('input', (e) => { g.nom = e.target.value; });
    bloc.querySelector('[data-champ="obligatoire"]').addEventListener('change', (e) => { g.obligatoire = e.target.checked; });
    bloc.querySelector('[data-champ="multiple"]').addEventListener('change', (e) => { g.multiple = e.target.checked; });
    bloc.querySelector('[data-suppr-groupe]').addEventListener('click', () => {
      optionsProduitEnCours.splice(Number(bloc.dataset.g), 1); dessinerEditeurOptions();
    });
    bloc.querySelector('[data-ajout-choix]').addEventListener('click', () => {
      g.choix.push({ nom: '', prix: 0, disponible: true }); dessinerEditeurOptions();
    });
    bloc.querySelectorAll('[data-c]').forEach((ligne) => {
      const c = g.choix[Number(ligne.dataset.c)];
      ligne.querySelector('[data-choix="nom"]').addEventListener('input', (e) => { c.nom = e.target.value; });
      ligne.querySelector('[data-choix="prix"]').addEventListener('input', (e) => { c.prix = parseInt(e.target.value, 10) || 0; });
      ligne.querySelector('[data-choix="disponible"]').addEventListener('change', (e) => { c.disponible = e.target.checked; });
      ligne.querySelector('[data-suppr-choix]').addEventListener('click', () => {
        g.choix.splice(Number(ligne.dataset.c), 1); dessinerEditeurOptions();
      });
    });
  });
}

// Options propres à enregistrer (null = aucune)
function lireOptionsProduit() {
  const propres = optionsProduitEnCours
    .map((g) => ({
      nom: String(g.nom || '').trim().slice(0, 40),
      obligatoire: !!g.obligatoire,
      multiple: !!g.multiple,
      choix: g.choix
        .map((c) => ({ nom: String(c.nom || '').trim().slice(0, 40), prix: Math.max(-1000000, Math.min(1000000, parseInt(c.prix, 10) || 0)), disponible: c.disponible !== false }))
        .filter((c) => c.nom)
        .filter((c, i, liste) => liste.findIndex((x) => x.nom === c.nom) === i)
    }))
    .filter((g) => g.nom && g.choix.length)
    .filter((g, i, liste) => liste.findIndex((x) => x.nom === g.nom) === i)
    .slice(0, 10);
  return propres.length ? propres : null;
}

function remplirOptionsProduit(options) {
  optionsProduitEnCours = Array.isArray(options) ? JSON.parse(JSON.stringify(options)) : [];
  dessinerEditeurOptions();
}

function reinitialiserOptionsProduit() {
  optionsProduitEnCours = [];
  dessinerEditeurOptions();
}

document.addEventListener('DOMContentLoaded', initEditeurOptionsProduit);
