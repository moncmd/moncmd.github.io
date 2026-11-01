-- ============================================================
-- PHASE 7A — Correctifs rendez-vous (bugs existants trouvés à l'audit)
-- 1. Le prestataire ne pouvait ni modifier ni supprimer un RDV dans son
--    agenda (aucune policy UPDATE/DELETE : la base ignorait sans erreur).
--    → Statut « payé » / « annulé », changement d'heure, suppression : réparés.
-- 2. Les clients ne voyaient pas les créneaux déjà pris (lecture des RDV
--    interdite au public) : tout semblait libre, puis « créneau pris ».
--    → Fonction qui renvoie seulement les créneaux occupés, sans nom ni numéro.
-- Rejouable sans erreur.
-- ============================================================

drop policy if exists "Vendeur modifie ses rendez_vous" on rendez_vous;
create policy "Vendeur modifie ses rendez_vous" on rendez_vous for update
  using (vendeur_id in (select vendeur_id from admins where auth_user_id = auth.uid()))
  with check (vendeur_id in (select vendeur_id from admins where auth_user_id = auth.uid()));

drop policy if exists "Vendeur supprime ses rendez_vous" on rendez_vous;
create policy "Vendeur supprime ses rendez_vous" on rendez_vous for delete
  using (vendeur_id in (select vendeur_id from admins where auth_user_id = auth.uid()));

create or replace function creneaux_occupes(p_vendeur_id uuid, p_date date)
returns table (heure time, personnel_id uuid, duree_minutes integer)
language sql
stable
security definer
set search_path = public
as $$
  select r.heure, r.personnel_id, coalesce(r.duree_minutes, 30)
  from rendez_vous r
  where r.vendeur_id = p_vendeur_id
    and r.date = p_date
    and coalesce(r.statut, 'en_attente') <> 'annule';
$$;

grant execute on function creneaux_occupes(uuid, date) to anon, authenticated;
