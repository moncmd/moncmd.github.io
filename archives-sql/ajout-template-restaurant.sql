-- ============================================
-- AJOUT : template "restaurant" (branche produits)
-- ============================================
alter table vendeurs drop constraint check_template_valide;

alter table vendeurs add constraint check_template_valide
  check (template in ('', 'urbain', 'marche', 'doux', 'minimal', 'editorial', 'restaurant'));

-- ============================================
-- AJOUT : horaires d'ouverture (pour calculer les créneaux)
-- ============================================
alter table vendeurs add column if not exists heure_ouverture time default '09:00';
alter table vendeurs add column if not exists heure_fermeture time default '18:00';

-- ============================================
-- AJOUT : service à domicile (prestataires)
-- ============================================
alter table rendez_vous add column if not exists lieu text default 'boutique';
alter table rendez_vous add column if not exists adresse_client text;

-- ============================================
-- AJOUT : mot du vendeur (message d'accueil affiché en haut de la boutique)
-- ============================================
alter table vendeurs add column if not exists message_accueil text;
alter table prestations add column if not exists categorie text;
