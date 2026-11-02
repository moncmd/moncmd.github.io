-- ROLLBACK PHASE 8C : relance migrations/phase8b-options-produits.sql puis
-- remets tous les vendeurs sur le mode par défaut :
update vendeurs set livraison_mode = 'apres', retrait_possible = false;
