-- ============================================
-- AJOUT : date de livraison (commandes) + choix des moyens de paiement (vendeurs)
-- A coller dans Supabase > SQL Editor > Run (sans risque : if not exists)
-- ============================================
alter table commandes add column if not exists date_livraison date;

alter table vendeurs add column if not exists accepte_wave boolean default true;
alter table vendeurs add column if not exists accepte_om boolean default true;

-- Les boutiques existantes continuent d'afficher Wave et Orange Money
update vendeurs set accepte_wave = true where accepte_wave is null;
update vendeurs set accepte_om = true where accepte_om is null;
