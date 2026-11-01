-- ============================================================
-- ROLLBACK PHASE 6 — revient à « fin d'essai = Standard » et
-- réactive toutes les boutiques mises en pause.
-- ============================================================
create or replace function terminer_essais_expires()
returns integer language sql security definer set search_path = public as $$
  with maj as (
    update vendeurs set formule = 'standard', essai_fin = null
    where essai_fin is not null and essai_fin < now()
    returning 1)
  select count(*)::integer from maj;
$$;
create or replace function terminer_abonnements_expires()
returns integer language sql security definer set search_path = public as $$
  with maj as (
    update vendeurs set formule = 'standard', abonnement_fin = null
    where abonnement_fin is not null and abonnement_fin < now() - interval '3 days'
    returning 1)
  select count(*)::integer from maj;
$$;
drop trigger if exists trg_pause_commandes on commandes;
drop trigger if exists trg_pause_rendez_vous on rendez_vous;
update vendeurs set en_pause = false, pause_depuis = null where en_pause = true;
