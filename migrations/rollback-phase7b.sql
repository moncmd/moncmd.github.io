-- ROLLBACK PHASE 7B
drop trigger if exists trg_verifier_disponibilite_rdv on rendez_vous;
drop trigger if exists trg_zz_confirmation_auto on rendez_vous;
revoke execute on function mon_rendez_vous(uuid) from anon, authenticated;
revoke execute on function annuler_mon_rendez_vous(uuid) from anon, authenticated;
-- (la correction du stock reste : elle ne gêne pas le vendeur)
