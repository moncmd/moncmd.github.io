-- ============================================================
-- ROLLBACK PHASE 3 — retire les limites côté base et le super admin.
-- (Les règles de l'admin côté navigateur continuent de s'appliquer.)
-- ============================================================
drop trigger if exists trg_limites_formule on produits;
drop trigger if exists trg_limites_formule on faq;
drop trigger if exists trg_limites_formule on prestations;
drop trigger if exists trg_limites_formule on personnel;
drop trigger if exists trg_limites_formule on codes_promo;
drop trigger if exists trg_limites_formule on depenses;
revoke execute on function sa_liste_boutiques() from authenticated;
revoke execute on function sa_modifier_boutique(uuid, jsonb) from authenticated;
