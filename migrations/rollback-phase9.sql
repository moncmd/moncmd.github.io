-- ROLLBACK PHASE 9 : remet toutes les boutiques en FCFA
update vendeurs set devise = 'FCFA';
-- Pour retirer le style Épuré d'une boutique : update vendeurs set theme = theme - 'style' where slug = '...';
