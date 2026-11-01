-- ============================================================
-- BOUTIQUE DÉMO — style générique (plus "sport")
-- Change uniquement l'apparence de la boutique "demo" :
-- template Classique + bannière, bandeau, à propos, infos pratiques.
-- Les produits ne sont pas touchés (à remplacer depuis l'admin démo).
-- Pour revenir en arrière : update vendeurs set template = 'sport', theme = null where slug = 'demo';
-- ============================================================
update vendeurs set
  template = '',
  formule = 'premium',
  couleur_accent = '#e56400',
  adresse = coalesce(adresse, 'Dakar, Sénégal'),
  theme = '{
    "police": "moderne",
    "fond": "creme",
    "annonce": { "actif": true, "texte": "Boutique de démonstration : testez comme un client, puis créez la vôtre sur moncmd.site" },
    "banniere": { "actif": true, "titre": "Votre boutique, à votre image", "sousTitre": "Parcourez, ajoutez au panier et commandez : c''est exactement ce que vivront vos clients.", "bouton": "Voir les produits" },
    "apropos": { "actif": true, "titre": "À propos de cette démo", "texte": "Cette boutique montre ce que CMD fait pour vous : un catalogue clair, une commande en quelques clics, et tout arrive résumé sur votre WhatsApp. Couleurs, police, bannière, sections : chaque vendeur personnalise la sienne depuis son téléphone." },
    "infos": { "actif": true, "livraison": "Dakar en 24 h, régions en 48 h" },
    "whatsapp": true
  }'::jsonb
where slug = 'demo';
