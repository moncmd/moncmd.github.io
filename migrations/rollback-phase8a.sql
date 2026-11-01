-- ROLLBACK PHASE 8A
drop trigger if exists trg_normaliser_commande on commandes;
revoke execute on function passer_commande(jsonb) from anon, authenticated;
drop policy if exists "Client depose sa preuve de paiement" on storage.objects;
