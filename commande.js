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

// Afficher le résumé
function afficherResume() {
    const resume = document.getElementById('resume');
    if (!resume) return;
    resume.innerHTML = "";

    let total = 0;

    panierData.forEach(item => {
        const produit = produits.find(p => p.id === item.id);
        if (!produit) return;
        const sousTotal = produit.prix * item.quantite;
        total += sousTotal;

        resume.innerHTML += `
            <div class="resume-item" style="display:flex; gap:12px; align-items:center; margin-bottom:12px;">
                <img src="${produit.image_url}" alt="${echapperHTML(produit.nom)}" style="width:50px; height:50px; object-fit:cover; border-radius:8px; flex-shrink:0;">
                <div>
                    <p>${echapperHTML(produit.nom)} x${item.quantite}</p>
                    ${item.commentaire ? `<p class="commentaire">💬 ${echapperHTML(item.commentaire)}</p>` : ''}
                    <p>${sousTotal} FCFA</p>
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
        resume.innerHTML += `<p style="color:#999; font-size:13px;">Sous-total : ${total.toLocaleString('fr-FR')} FCFA</p>`;
        resume.innerHTML += `<p style="color:green; font-size:13px;">Réduction (${codePromoApplique.code}) : -${reduction.toLocaleString('fr-FR')} FCFA</p>`;
    }

    resume.innerHTML += `<p class="total">Total : ${totalFinal.toLocaleString('fr-FR')} FCFA</p>`;
}

async function appliquerCodePromo() {
    const input = document.getElementById('input-code-promo');
    const messageEl = document.getElementById('message-code-promo');
    const code = input.value.trim().toUpperCase();
    if (!code || !vendeurActuel) return;

    const { data, error } = await supabaseClient
        .from('codes_promo')
        .select('code, reduction_pourcent, date_expiration')
        .eq('vendeur_id', vendeurActuel.id)
        .ilike('code', code)
        .eq('actif', true)
        .maybeSingle();

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
    const heure = document.getElementById('heure').value;

    if (!nom || !prenom || !numero) {
        alert('Veuillez remplir tous les champs !');
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
        const sousTotal = produit.prix * item.quantite;
        total += sousTotal;
        message += `- ${produit.nom} x${item.quantite} → ${sousTotal} FCFA`;
        if (item.commentaire) message += ` (${item.commentaire})`;
        message += `\n`;

        contenu.push({
            produit_id: produit.id,
            produit: produit.nom,
            quantite: item.quantite,
            prix: produit.prix,
            commentaire: item.commentaire || ""
        });
    });

    message += `\nSous-total : ${total} FCFA`;

    let reductionAppliquee = 0;
    if (codePromoApplique) {
        reductionAppliquee = Math.round(total * codePromoApplique.reduction_pourcent / 100);
        message += `\nCode promo ${codePromoApplique.code} : -${reductionAppliquee} FCFA`;
    }
    const totalFinal = total - reductionAppliquee;

    message += `\nTotal : ${totalFinal} FCFA`;
    message += `\n\nNom : ${nom} ${prenom}`;
    message += `\nNuméro : ${numero}`;
    if (adresse) message += `\nAdresse : ${adresse}`;
    message += `\nHeure de récupération : ${heure}`;

    // Enregistrement dans Supabase avant l'ouverture de WhatsApp
    const { data: commandeCreee, error } = await supabaseClient.from('commandes').insert({
        vendeur_id: vendeurActuel.id,
        nom_client: nom,
        prenom_client: prenom,
        numero_client: numero,
        adresse: adresse,
        heure_recuperation: heure,
        mode_paiement: modePaiementActuel,
        code_promo: codePromoApplique ? codePromoApplique.code : null,
        reduction: reductionAppliquee,
        contenu: contenu,
        total: totalFinal
    }).select().single();

    if (error) {
        console.error('Erreur enregistrement commande :', error);
        // On n'empêche pas la commande WhatsApp même si l'enregistrement échoue
    }
    // Le décompte du stock se fait maintenant uniquement quand le vendeur
    // confirme la commande (voir confirmerCommande dans admin.js) — pas ici,
    // pour éviter de décompter un stock pour une commande jamais envoyée.

    // Reçu PDF (réservé aux vendeurs Premium)
    if (vendeurActuel.formule === 'premium') {
        genererRecuPDF(contenu, totalFinal, nom, prenom, commandeCreee ? commandeCreee.id : null);
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
        doc.text(`${sousTotal} FCFA`, 190, y, { align: 'right' });
        y += 7;
    });

    y += 4;
    doc.setDrawColor(220);
    doc.line(20, y, 190, y);

    y += 10;
    doc.setFontSize(12);
    doc.setTextColor(20);
    doc.text(`Total : ${total.toLocaleString()} FCFA`, 20, y);

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

        await supabaseClient.from('commandes').update({
            recu_url: urlData.publicUrl
        }).eq('id', commandeId);
    } catch (err) {
        console.error('Erreur sauvegarde reçu :', err);
    }
}