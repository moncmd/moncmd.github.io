-- ============================================
-- AJOUT : réseaux sociaux (tous vendeurs) + adresse (prestataires)
-- ============================================
alter table vendeurs add column if not exists instagram text;
alter table vendeurs add column if not exists tiktok text;
alter table vendeurs add column if not exists facebook text;
alter table vendeurs add column if not exists adresse text;
