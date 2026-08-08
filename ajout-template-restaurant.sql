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
