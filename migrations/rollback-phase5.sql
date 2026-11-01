-- ROLLBACK PHASE 5 — désactive la déclaration de paiement et l'expiration automatique.
-- Les demandes déjà enregistrées sont conservées.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'moncmd-fin-abonnements';
  end if;
end;
$$;
revoke execute on function declarer_paiement(text, integer, text, text, text) from authenticated;
