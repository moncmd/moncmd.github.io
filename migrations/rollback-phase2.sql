-- ============================================================
-- ROLLBACK PHASE 2 — désactive l'inscription autonome.
-- Les boutiques déjà créées par inscription restent en place.
-- ============================================================
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'moncmd-fin-essais';
  end if;
end;
$$;
revoke execute on function creer_boutique(text, text, text, text) from authenticated;
revoke execute on function slug_disponible(text) from anon, authenticated;
-- La protection élargie des champs (étape 2) peut rester : elle ne gêne rien.
