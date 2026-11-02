// Date de livraison : impossible de choisir une date passée
(function () {
    const champDate = document.getElementById('date-livraison');
    if (!champDate) return;
    const auj = new Date();
    auj.setMinutes(auj.getMinutes() - auj.getTimezoneOffset());
    champDate.min = auj.toISOString().split('T')[0];
})();

// Mode paiement
let modePaiementActuel = 'surplace';
let codePromoApplique = null; // { code, reduction_pourcent } — exclusivité premium

function modePaiement(mode, bouton) {
    document.querySelectorAll('.menu-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    bouton.classList.add('active');
    modePaiementActuel = mode;

    if (mode === 'online') {
        document.querySelector('.paiement').style.display = 'flex';
    } else {
        document.querySelector('.paiement').style.display = 'none';
    }
}

// ---- Livraison ou retrait (réglage simple du vendeur, voir phase 8C) ----
let modeReception = 'livraison';

function fraisLivraisonPrevus() {
    if (!vendeurActuel || modeReception === 'retrait') return 0;
    return vendeurActuel.livraison_mode === 'fixe' ? Math.max(Number(vendeurActuel.livraison_prix) || 0, 0) : 0;
}

function texteLivraison() {
    if (!vendeurActuel) return '';
    if (modeReception === 'retrait') return 'Retrait sur place';
    if (vendeurActuel.livraison_mode === 'fixe') return `Livraison : ${fraisLivraisonPrevus().toLocaleString('fr-FR')} ${deviseBoutique()}`;
    if (vendeurActuel.livraison_mode === 'gratuite') return 'Livraison offerte';
    return 'Frais de livraison communiqués par la boutique ou le livreur';
}

function preparerReception() {
    if (!vendeurActuel || document.getElementById('cmd-reception')) return;
    const labelAdresse = document.querySelector('label[for="adresse"]');
    if (!labelAdresse) return;

    if (vendeurActuel.retrait_possible) {
        const bloc = document.createElement('div');
        bloc.id = 'cmd-reception';
        bloc.innerHTML = `
            <p class="cmd-reception-titre">Réception</p>
            <div class="cmd-reception-choix">
                <button type="button" data-mode="livraison" aria-pressed="true">Livraison</button>
                <button type="button" data-mode="retrait" aria-pressed="false">Je récupère</button>
            </div>`;
        labelAdresse.parentNode.insertBefore(bloc, labelAdresse);
        bloc.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
            modeReception = b.dataset.mode;
            bloc.querySelectorAll('[data-mode]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
            majChampsReception();
            afficherResume();
        }));

        const style = document.createElement('style');
        style.textContent = `
            #cmd-reception { margin: 4px 0 14px; }
            .cmd-reception-titre { font-weight: 600; margin: 0 0 8px; }
            .cmd-reception-choix { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
            .cmd-reception-choix button { padding: 12px; border-radius: 10px; border: 1.5px solid rgba(0,0,0,.15); background: transparent; color: inherit; font: inherit; font-weight: 600; cursor: pointer; }
            .cmd-reception-choix button[aria-pressed="true"] { border-color: var(--couleur-accent, #e56400); background: color-mix(in srgb, var(--couleur-accent, #e56400) 10%, transparent); }
            .cmd-livraison-ligne { font-size: 13px; opacity: .75; margin: 6px 0; }
        `;
        document.head.appendChild(style);
    }
    majChampsReception();
}

function majChampsReception() {
    const retrait = modeReception === 'retrait';
    // La note « la livraison n'est pas incluse » des templates ne s'affiche
    // que si elle est vraie (frais annoncés après la commande, en livraison)
    document.querySelectorAll('p, div, small, span').forEach(el => {
        if (el.children.length === 0 && /livraison n'est pas incluse/i.test(el.textContent)) {
            el.style.display = (!retrait && (!vendeurActuel || (vendeurActuel.livraison_mode || 'apres') === 'apres')) ? '' : 'none';
        }
    });
    const labelAdresse = document.querySelector('label[for="adresse"]');
    const champAdresse = document.getElementById('adresse');
    if (labelAdresse) labelAdresse.style.display = retrait ? 'none' : '';
    if (champAdresse) champAdresse.style.display = retrait ? 'none' : '';
    const labelDate = document.querySelector('label[for="date-livraison"]');
    const labelHeure = document.querySelector('label[for="heure"]');
    if (labelDate) labelDate.textContent = retrait ? 'Date de récupération' : 'Date de livraison';
    if (labelHeure) labelHeure.textContent = retrait ? 'Heure de récupération' : 'Heure de livraison';
}

// Afficher le résumé
function afficherResume() {
    preparerReception();
    const resume = document.getElementById('resume');
    if (!resume) return;
    resume.innerHTML = "";

    let total = 0;

    panierData.forEach(item => {
        const produit = produits.find(p => p.id === item.id);
        if (!produit) return;
        const sousTotal = prixUnitaire(produit, item) * item.quantite;
        total += sousTotal;

        resume.innerHTML += `
            <div class="resume-item" style="display:flex; gap:12px; align-items:center; margin-bottom:12px;">
                <img src="${produit.image_url}" alt="${echapperHTML(produit.nom)}" style="width:50px; height:50px; object-fit:cover; border-radius:8px; flex-shrink:0;">
                <div>
                    <p>${echapperHTML(produit.nom)} x${item.quantite}</p>
                    ${libelleOptions(item) ? `<p class="commentaire">${echapperHTML(libelleOptions(item))}</p>` : ''}
                    ${item.commentaire ? `<p class="commentaire">💬 ${echapperHTML(item.commentaire)}</p>` : ''}
                    <p>${sousTotal} ${deviseBoutique()}</p>
                </div>
            </div>
        `;
    });

    // Code promo — exclusivité premium, aucun champ affiché pour les autres formules
    if (vendeurActuel && vendeurActuel.formule === 'premium') {
        resume.innerHTML += `
            <div style="display:flex; gap:8px; margin:14px 0 4px;">
                <input type="text" id="input-code-promo" placeholder="Code promo" maxlength="30"
                    style="flex:1; padding:9px; border-radius:8px; border:1px solid #ddd; text-transform:uppercase; font-family:inherit;"
                    value="${codePromoApplique ? codePromoApplique.code : ''}" ${codePromoApplique ? 'disabled' : ''}>
                ${codePromoApplique
                  ? `<button type="button" onclick="retirerCodePromo()" style="padding:9px 14px; border-radius:8px; border:none; background:#eee; cursor:pointer;">✕</button>`
                  : `<button type="button" onclick="appliquerCodePromo()" style="padding:9px 14px; border-radius:8px; border:none; background:#1a1a1a; color:#fff; cursor:pointer; white-space:nowrap;">Appliquer</button>`}
            </div>
            <p id="message-code-promo" style="font-size:12px; margin-bottom:10px; color:${codePromoApplique ? 'green' : '#999'};">${codePromoApplique ? `Code "${codePromoApplique.code}" appliqué : -${codePromoApplique.reduction_pourcent}%` : ''}</p>
        `;
    }

    let totalFinal = total;
    if (codePromoApplique) {
        const reduction = Math.round(total * codePromoApplique.reduction_pourcent / 100);
        totalFinal = total - reduction;
        resume.innerHTML += `<p style="color:#999; font-size:13px;">Sous-total : ${total.toLocaleString('fr-FR')} ${deviseBoutique()}</p>`;
        resume.innerHTML += `<p style="color:green; font-size:13px;">Réduction (${codePromoApplique.code}) : -${reduction.toLocaleString('fr-FR')} ${deviseBoutique()}</p>`;
    }

    const frais = fraisLivraisonPrevus();
    resume.innerHTML += `<p class="cmd-livraison-ligne">${echapperHTML(texteLivraison())}</p>`;
    resume.innerHTML += `<p class="total">Total : ${(totalFinal + frais).toLocaleString('fr-FR')} ${deviseBoutique()}</p>`;
}

async function appliquerCodePromo() {
    const input = document.getElementById('input-code-promo');
    const messageEl = document.getElementById('message-code-promo');
    const code = input.value.trim().toUpperCase();
    if (!code || !vendeurActuel) return;

    // Vérification côté serveur (fonction verifier_code_promo, phase 1A) :
    // la liste des codes n'est plus lisible publiquement.
    const { data, error } = await supabaseClient
        .rpc('verifier_code_promo', { p_vendeur_id: vendeurActuel.id, p_code: code });

    if (error || !data) {
        messageEl.textContent = "Code promo invalide.";
        messageEl.style.color = 'red';
        return;
    }

    if (data.date_expiration && new Date(data.date_expiration) < new Date()) {
        messageEl.textContent = "Ce code promo a expiré.";
        messageEl.style.color = 'red';
        return;
    }

    codePromoApplique = data;
    afficherResume();
}

function retirerCodePromo() {
    codePromoApplique = null;
    afficherResume();
}

// Envoyer sur WhatsApp (+ enregistrer la commande dans Supabase)
async function envoyerCommande() {
    if (!panierData || panierData.length === 0) {
        alert('Votre panier est vide.');
        return;
    }

    const nom = document.getElementById('nom').value;
    const prenom = document.getElementById('prenom').value;
    const numero = document.getElementById('numero').value;
    const adresse = document.getElementById('adresse').value;
    const dateLivraison = document.getElementById('date-livraison').value;
    const heure = document.getElementById('heure').value;

    if (!nom || !prenom || !numero) {
        alert('Veuillez remplir tous les champs !');
        return;
    }

    if (!dateLivraison || !heure) {
        alert('Veuillez choisir la date et l\'heure de livraison.');
        return;
    }

    if (!vendeurActuel) {
        alert("Erreur : boutique non chargée. Rechargez la page.");
        return;
    }

    let message = `Bonjour, voici ma commande :\n\n`;
    let total = 0;
    const contenu = [];

    panierData.forEach(item => {
        const produit = produits.find(p => p.id === item.id);
        if (!produit) return;
        const sousTotal = prixUnitaire(produit, item) * item.quantite;
        total += sousTotal;
        message += `- ${produit.nom}${produit.reference ? ` (réf. ${produit.reference})` : ''}${libelleOptions(item) ? ` [${libelleOptions(item)}]` : ''} x${item.quantite} → ${sousTotal} ${deviseBoutique()}`;
        if (item.commentaire) message += ` (${item.commentaire})`;
        message += `\n`;

        contenu.push({
            produit_id: produit.id,
            produit: produit.nom,
            reference: produit.reference || null,
            quantite: item.quantite,
            prix: prixUnitaire(produit, item),
            options: Array.isArray(item.options) ? item.options : [],
            commentaire: item.commentaire || ""
        });
    });

    message += `\nSous-total : ${total} ${deviseBoutique()}`;

    let reductionAppliquee = 0;
    if (codePromoApplique) {
        reductionAppliquee = Math.round(total * codePromoApplique.reduction_pourcent / 100);
        message += `\nCode promo ${codePromoApplique.code} : -${reductionAppliquee} ${deviseBoutique()}`;
    }
    const totalFinal = total - reductionAppliquee + fraisLivraisonPrevus();

    message += `\n${texteLivraison()}`;
    message += `\nTotal : ${totalFinal} ${deviseBoutique()}`;
    message += `\n\nNom : ${nom} ${prenom}`;
    message += `\nNuméro : ${numero}`;
    const retrait = modeReception === 'retrait';
    if (adresse && !retrait) message += `\nAdresse : ${adresse}`;
    message += `\nDate de ${retrait ? 'récupération' : 'livraison'} : ${dateLivraison.split('-').reverse().join('/')}`;
    message += `\nHeure de ${retrait ? 'récupération' : 'livraison'} : ${heure}`;

    // Enregistrement : la base recalcule le total à partir des vrais prix,
    // vérifie le code promo et attribue un numéro de commande (#12).
    const charge = {
        vendeur_id: vendeurActuel.id,
        nom_client: nom,
        prenom_client: prenom,
        numero_client: numero,
        adresse: adresse,
        date_livraison: dateLivraison,
        heure_recuperation: heure,
        mode_paiement: modePaiementActuel,
        code_promo: codePromoApplique ? codePromoApplique.code : null,
        contenu: contenu,
        mode_reception: modeReception
    };
    let idCommande = null;
    let { data: officiel, error } = await supabaseClient.rpc('passer_commande', { p: charge });

    if (error && error.code === 'PGRST202') {
        // Fonction pas encore installée (phase 8A) : ancien enregistrement
        idCommande = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : null;
        const { mode_reception: _ignore, ...chargeAncienne } = charge;
        ({ error } = await supabaseClient.from('commandes').insert({
            ...(idCommande ? { id: idCommande } : {}), ...chargeAncienne, reduction: reductionAppliquee, total: totalFinal
        }));
        officiel = null;
    } else if (error) {
        // Refus de la base (produit plus disponible, boutique en pause…) :
        // on prévient le client au lieu d'envoyer une commande fausse.
        alert(error.message || "La commande n'a pas pu être enregistrée. Réessayez.");
        return;
    }

    if (officiel) {
        idCommande = officiel.id;
        // Le message WhatsApp reprend les montants officiels calculés par la base
        if (officiel.total !== totalFinal) {
            message = message
                .replace(/\nTotal : [^\n]*/, `\nTotal : ${officiel.total} ${deviseBoutique()}`);
        }
        const lienSuivi = `${window.location.origin}/suivi.html?c=${officiel.id}`;
        message = `Commande n°${officiel.numero}\n` + message +
            `\n\nSuivre ma commande${modePaiementActuel === 'online' ? ' et envoyer ma preuve de paiement' : ''} : ${lienSuivi}`;
    }

    if (error) {
        console.error('Erreur enregistrement commande :', error);
        // Ancien mode : on n'empêche pas la commande WhatsApp
    }
    // Le décompte du stock se fait uniquement quand le vendeur confirme la
    // commande (voir confirmerCommande dans admin.js).

    // Reçu PDF (réservé aux vendeurs Premium)
    if (vendeurActuel.formule === 'premium') {
        genererRecuPDF(officiel ? officiel.contenu : contenu, officiel ? officiel.total : totalFinal, nom, prenom, error ? null : idCommande);
    }

    const url = `https://wa.me/${vendeurActuel.numero_whatsapp}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');

    localStorage.removeItem('panier');
    panierData = [];
    codePromoApplique = null;
    if (document.getElementById('compteur')) {
        document.getElementById('compteur').textContent = 0;
    }
}

// ============================================
// Reçu PDF simple (formule Premium uniquement)
// Téléchargé côté client ET sauvegardé pour le vendeur (visible dans son admin)
// ============================================
async function genererRecuPDF(contenu, total, nom, prenom, commandeId) {
    if (!window.jspdf) return; // librairie non chargée, on n'interrompt rien

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    let y = 22;

    doc.setFontSize(16);
    doc.text(vendeurActuel.nom_boutique || 'Boutique', 20, y);

    y += 8;
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(new Date().toLocaleDateString('fr-FR'), 20, y);

    y += 6;
    doc.text(`Client : ${nom} ${prenom}`, 20, y);

    y += 14;
    doc.setFontSize(12);
    doc.setTextColor(20);
    doc.text('Reçu de commande', 20, y);

    y += 4;
    doc.setDrawColor(220);
    doc.line(20, y, 190, y);

    y += 10;
    doc.setFontSize(10);
    contenu.forEach(item => {
        const sousTotal = (item.prix * item.quantite).toLocaleString();
        doc.text(`${item.produit} x${item.quantite}`, 20, y);
        doc.text(`${sousTotal} ${deviseBoutique()}`, 190, y, { align: 'right' });
        y += 7;
    });

    y += 4;
    doc.setDrawColor(220);
    doc.line(20, y, 190, y);

    y += 10;
    doc.setFontSize(12);
    doc.setTextColor(20);
    doc.text(`Total : ${total.toLocaleString()} ${deviseBoutique()}`, 20, y);

    y += 20;
    doc.setFontSize(8);
    doc.setTextColor(160);
    doc.text('Reçu généré via CMD.', 20, y);

    const nomFichier = `recu-${vendeurActuel.slug || 'commande'}-${Date.now()}.pdf`;

    // Téléchargement immédiat côté client, comme avant
    doc.save(nomFichier);

    // Sauvegarde dans Supabase Storage, pour que le vendeur y ait accès aussi
    if (!commandeId) return;

    try {
        const blob = doc.output('blob');
        const cheminFichier = `${vendeurActuel.id}/${nomFichier}`;

        const { error: erreurUpload } = await supabaseClient.storage
            .from('recus')
            .upload(cheminFichier, blob, { contentType: 'application/pdf' });

        if (erreurUpload) {
            console.error('Erreur sauvegarde reçu :', erreurUpload);
            return;
        }

        const { data: urlData } = supabaseClient.storage.from('recus').getPublicUrl(cheminFichier);

        // Fonction serveur (phase 3) : le client n'a pas le droit de
        // modifier une commande directement.
        await supabaseClient.rpc('lier_recu_commande', {
            p_commande_id: commandeId,
            p_url: urlData.publicUrl
        });
    } catch (err) {
        console.error('Erreur sauvegarde reçu :', err);
    }
}