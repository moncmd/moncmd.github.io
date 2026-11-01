-- ============================================================
-- PHASE 1C — À lancer SEULEMENT après avoir mis en ligne le
-- nouveau commande.js (qui utilise verifier_code_promo).
-- Avant : n'importe qui pouvait lister tous les codes promo
-- de toutes les boutiques.
-- ============================================================
drop policy if exists "Lecture publique codes_promo actifs" on codes_promo;
-- La policy "Vendeur gere ses codes_promo" reste : l'admin voit toujours les siens.
