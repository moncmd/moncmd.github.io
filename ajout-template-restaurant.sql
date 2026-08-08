-- ============================================
-- AJOUT : template "restaurant" (branche produits)
-- ============================================
alter table vendeurs drop constraint check_template_valide;

alter table vendeurs add constraint check_template_valide
  check (template in ('', 'urbain', 'marche', 'doux', 'minimal', 'editorial', 'restaurant'));
