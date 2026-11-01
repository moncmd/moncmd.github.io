-- ROLLBACK PHASE 4 — retire la possibilité de changer de template soi-même.
-- La colonne theme reste (elle ne gêne rien) ; pour masquer toutes les
-- personnalisations d'un coup : update vendeurs set theme = null;
revoke execute on function changer_template(text) from authenticated;
