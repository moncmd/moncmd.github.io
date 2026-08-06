// Mode paiement
let modePaiementActuel = 'surplace';

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
                <img src="${produit.image_url}" alt="${produit.nom}" style="width:50px; height:50px; object-fit:cover; border-radius:8px; flex-shrink:0;">
                <div>
                    <p>${produit.nom} x${item.quantite}</p>
                    ${item.commentaire ? `<p class="commentaire">💬 ${item.commentaire}</p>` : ''}
                    <p>${sousTotal} FCFA</p>
                </div>
            </div>
        `;
    });

    resume.innerHTML += `<p class="total">Total : ${total} FCFA</p>`;
}

// Envoyer sur WhatsApp (+ enregistrer la commande dans Supabase)
async function envoyerCommande() {
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

    message += `\nTotal : ${total} FCFA`;
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
        contenu: contenu,
        total: total
    }).select().single();

    if (error) {
        console.error('Erreur enregistrement commande :', error);
        // On n'empêche pas la commande WhatsApp même si l'enregistrement échoue
    } else {
        // Décompte automatique du stock (uniquement pour les produits qui en suivent un)
        for (const item of contenu) {
            const produit = produits.find(p => p.id === item.produit_id);
            if (produit && produit.quantite_stock !== null && produit.quantite_stock !== undefined) {
                await supabaseClient.rpc('decrementer_stock', {
                    p_produit_id: produit.id,
                    p_quantite: item.quantite
                });
            }
        }
    }

    // Reçu PDF (réservé aux vendeurs Premium)
    if (vendeurActuel.formule === 'premium') {
        genererRecuPDF(contenu, total, nom, prenom, commandeCreee ? commandeCreee.id : null);
    }

    const url = `https://wa.me/${vendeurActuel.numero_whatsapp}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');

    localStorage.removeItem('panier');
    panierData = [];
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
