-- ============================================================
-- PHASE 6 — Monétisation + statistiques de visites
--  - Fin d'essai (ou d'abonnement non renouvelé) : boutique EN PAUSE
--    (rien n'est supprimé ; le vendeur garde son admin et peut payer)
--  - Inscriptions en ligne : pas de frais de mise en service
--  - 6 mois = 1 offert, 12 mois = 2 offerts
--  - Option « Mise en place par CMD »
--  - Compteur de visites (boutique et produits)
-- Prérequis : phases 1 à 5. Rejouable sans erreur.
-- Tes clients actuels (sans date de fin) ne sont JAMAIS mis en pause.
-- ============================================================


-- ============ 1. PAUSE ============
alter table vendeurs add column if not exists en_pause boolean not null default false;
alter table vendeurs add column if not exists pause_depuis timestamptz;

create or replace function proteger_champs_vendeur()
returns trigger
language plpgsql
as $$
declare
  v_template_autorise boolean := coalesce(current_setting('cmd.changement_template', true), '') = '1';
begin
  if auth.uid() is null or est_super_admin() then
    return new;
  end if;

  if new.formule                     is distinct from old.formule
  or new.actif                       is distinct from old.actif
  or new.en_pause                    is distinct from old.en_pause
  or new.pause_depuis                is distinct from old.pause_depuis
  or new.slug                        is distinct from old.slug
  or (new.template is distinct from old.template and not v_template_autorise)
  or new.id                          is distinct from old.id
  or new.date_creation               is distinct from old.date_creation
  or new.essai_fin                   is distinct from old.essai_fin
  or new.abonnement_fin              is distinct from old.abonnement_fin
  or new.origine                     is distinct from old.origine
  or new.logo_debloque               is distinct from old.logo_debloque
  or new.recherche_debloquee         is distinct from old.recherche_debloquee
  or new.masquer_commentaire_produit is distinct from old.masquer_commentaire_produit then
    raise exception 'Champ réservé : ce réglage ne peut pas être modifié depuis la boutique.';
  end if;

  return new;
end;
$$;

-- Fin d'essai → pause
create or replace function terminer_essais_expires()
returns integer
language sql
security definer
set search_path = public
as $$
  with maj as (
    update vendeurs
    set en_pause = true, pause_depuis = now(), essai_fin = null
    where essai_fin is not null and essai_fin < now() and en_pause = false
    returning 1
  )
  select count(*)::integer from maj;
$$;

-- Abonnement payé non renouvelé (3 jours de grâce) → pause
create or replace function terminer_abonnements_expires()
returns integer
language sql
security definer
set search_path = public
as $$
  with maj as (
    update vendeurs
    set en_pause = true, pause_depuis = now()
    where abonnement_fin is not null and abonnement_fin < now() - interval '3 days' and en_pause = false
    returning 1
  )
  select count(*)::integer from maj;
$$;

revoke execute on function terminer_essais_expires() from public, anon, authenticated;
revoke execute on function terminer_abonnements_expires() from public, anon, authenticated;

-- Une boutique en pause ne reçoit plus de commandes ni de réservations
-- (vérifié par la base, pas seulement par la page)
create or replace function refuser_si_boutique_en_pause()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from vendeurs where id = new.vendeur_id and (en_pause = true or actif = false)) then
    raise exception 'Cette boutique est momentanément indisponible.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pause_commandes on commandes;
create trigger trg_pause_commandes before insert on commandes
  for each row execute function refuser_si_boutique_en_pause();

drop trigger if exists trg_pause_rendez_vous on rendez_vous;
create trigger trg_pause_rendez_vous before insert on rendez_vous
  for each row execute function refuser_si_boutique_en_pause();


-- ============ 2. TARIFS : frais, remises, mise en place ============
insert into parametres_cmd (cle, valeur) values ('prix_mise_en_place', '10000')
on conflict (cle) do nothing;

alter table demandes_paiement add column if not exists mise_en_place boolean not null default false;

-- Les anciennes versions (sans l'option mise en place) sont remplacées
drop function if exists declarer_paiement(text, integer, text, text, text);
drop function if exists mon_montant(text, integer);
drop function if exists calculer_montant(uuid, text, integer);

-- Mois réellement payés : 6 → 5, 12 → 10
create or replace function mois_payes(p_mois integer)
returns integer
language sql
immutable
as $$
  select case p_mois when 6 then 5 when 12 then 10 else p_mois end;
$$;

create or replace function calculer_montant(p_vendeur_id uuid, p_formule text, p_mois integer, p_mise_en_place boolean default false)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_type text;
  v_origine text;
  v_prix integer;
  v_frais integer;
  v_deja_paye boolean;
  v_total integer;
  v_mise integer;
begin
  select coalesce(type_activite, 'produit'), coalesce(origine, 'manuel')
    into v_type, v_origine from vendeurs where id = p_vendeur_id;
  select prix_mensuel, frais_mise_en_service into v_prix, v_frais
    from tarifs where type_activite = v_type and formule = p_formule;
  if v_prix is null or p_mois not in (1, 3, 6, 12) then
    return null;
  end if;

  v_total := v_prix * mois_payes(p_mois);

  -- Frais de mise en service : uniquement pour les boutiques créées à la main
  -- (tes anciennes conditions), au premier paiement validé.
  if v_origine <> 'inscription' then
    select exists (select 1 from demandes_paiement where vendeur_id = p_vendeur_id and statut = 'validee')
      into v_deja_paye;
    if not v_deja_paye then
      v_total := v_total + greatest(v_frais - v_prix, 0);
    end if;
  end if;

  if coalesce(p_mise_en_place, false) then
    select coalesce(nullif(valeur, '')::integer, 0) into v_mise from parametres_cmd where cle = 'prix_mise_en_place';
    v_total := v_total + coalesce(v_mise, 0);
  end if;

  return v_total;
end;
$$;

revoke execute on function calculer_montant(uuid, text, integer, boolean) from public, anon, authenticated;

create or replace function mon_montant(p_formule text, p_mois integer, p_mise_en_place boolean default false)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select calculer_montant(a.vendeur_id, p_formule, p_mois, p_mise_en_place)
  from admins a where a.auth_user_id = auth.uid() limit 1;
$$;
revoke execute on function mon_montant(text, integer, boolean) from public, anon;
grant execute on function mon_montant(text, integer, boolean) to authenticated;

create or replace function declarer_paiement(
  p_formule text,
  p_mois integer,
  p_moyen text,
  p_reference text,
  p_capture_chemin text,
  p_mise_en_place boolean default false
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendeur_id uuid;
  v_montant integer;
  v_ref text := trim(coalesce(p_reference, ''));
  v_capture text := nullif(trim(coalesce(p_capture_chemin, '')), '');
  v_id uuid;
begin
  select vendeur_id into v_vendeur_id from admins where auth_user_id = auth.uid() limit 1;
  if v_vendeur_id is null then
    raise exception 'Aucune boutique liée à ce compte.';
  end if;
  if p_mois not in (1, 3, 6, 12) then
    raise exception 'Durée invalide.';
  end if;
  if p_moyen not in ('wave', 'om') then
    raise exception 'Moyen de paiement invalide.';
  end if;
  if length(v_ref) < 4 or length(v_ref) > 40 or v_ref !~ '^[A-Za-z0-9 ._/-]+$' then
    raise exception 'Référence de transaction invalide (4 à 40 caractères, lettres et chiffres).';
  end if;
  if v_capture is not null and (v_capture not like v_vendeur_id::text || '/%' or v_capture like '%..%') then
    raise exception 'Capture invalide.';
  end if;

  v_montant := calculer_montant(v_vendeur_id, p_formule, p_mois, p_mise_en_place);
  if v_montant is null then
    raise exception 'Cette formule n''est pas disponible pour ton activité.';
  end if;
  if (select count(*) from demandes_paiement where vendeur_id = v_vendeur_id and statut = 'en_attente') >= 3 then
    raise exception 'Tu as déjà 3 paiements en attente de validation. Patiente un peu ou contacte CMD.';
  end if;
  if exists (select 1 from demandes_paiement where upper(reference) = upper(v_ref) and statut <> 'refusee') then
    raise exception 'Cette référence de transaction a déjà été déclarée.';
  end if;

  insert into demandes_paiement (vendeur_id, formule, mois, montant, moyen, reference, capture_chemin, mise_en_place)
  values (v_vendeur_id, p_formule, p_mois, v_montant, p_moyen, v_ref, v_capture, coalesce(p_mise_en_place, false))
  returning id into v_id;

  return json_build_object('id', v_id, 'montant', v_montant);
end;
$$;
revoke execute on function declarer_paiement(text, integer, text, text, text, boolean) from public, anon;
grant execute on function declarer_paiement(text, integer, text, text, text, boolean) to authenticated;

-- Validation : réactive aussi la boutique si elle était en pause
create or replace function sa_traiter_demande(p_demande_id uuid, p_valider boolean, p_motif text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  d demandes_paiement%rowtype;
  v_fin timestamptz;
begin
  if not est_super_admin() then
    raise exception 'Accès refusé.';
  end if;

  select * into d from demandes_paiement where id = p_demande_id for update;
  if d.id is null then
    raise exception 'Demande introuvable.';
  end if;
  if d.statut <> 'en_attente' then
    raise exception 'Cette demande a déjà été traitée.';
  end if;

  if not p_valider then
    update demandes_paiement
      set statut = 'refusee', motif_refus = left(p_motif, 300), date_traitement = now()
      where id = d.id;
    return json_build_object('statut', 'refusee');
  end if;

  update demandes_paiement set statut = 'validee', date_traitement = now() where id = d.id;

  select greatest(coalesce(abonnement_fin, now()), now()) + make_interval(months => d.mois)
    into v_fin from vendeurs where id = d.vendeur_id;

  update vendeurs
    set formule = d.formule, essai_fin = null, abonnement_fin = v_fin,
        en_pause = false, pause_depuis = null
    where id = d.vendeur_id;

  return json_build_object('statut', 'validee', 'abonnement_fin', v_fin);
end;
$$;

-- Super admin : pause / reprise manuelle
create or replace function sa_modifier_boutique(p_vendeur_id uuid, p_modifs jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not est_super_admin() then
    raise exception 'Accès refusé.';
  end if;
  if p_modifs ? 'formule' and coalesce(p_modifs->>'formule', '') not in ('standard', 'pro', 'premium') then
    raise exception 'Formule inconnue.';
  end if;

  update vendeurs set
    formule      = case when p_modifs ? 'formule'   then p_modifs->>'formule' else formule end,
    essai_fin    = case when p_modifs ? 'essai_fin' then (p_modifs->>'essai_fin')::timestamptz else essai_fin end,
    abonnement_fin = case when p_modifs ? 'abonnement_fin' then (p_modifs->>'abonnement_fin')::timestamptz else abonnement_fin end,
    actif        = case when p_modifs ? 'actif'     then coalesce((p_modifs->>'actif')::boolean, actif) else actif end,
    en_pause     = case when p_modifs ? 'en_pause'  then coalesce((p_modifs->>'en_pause')::boolean, en_pause) else en_pause end,
    pause_depuis = case when p_modifs ? 'en_pause'
                        then (case when coalesce((p_modifs->>'en_pause')::boolean, false) then now() else null end)
                        else pause_depuis end,
    template     = case when p_modifs ? 'template'  then coalesce(p_modifs->>'template', '') else template end,
    logo_debloque = case when p_modifs ? 'logo_debloque'
                         then coalesce((p_modifs->>'logo_debloque')::boolean, false) else logo_debloque end,
    recherche_debloquee = case when p_modifs ? 'recherche_debloquee'
                         then coalesce((p_modifs->>'recherche_debloquee')::boolean, false) else recherche_debloquee end,
    masquer_commentaire_produit = case when p_modifs ? 'masquer_commentaire_produit'
                         then coalesce((p_modifs->>'masquer_commentaire_produit')::boolean, false) else masquer_commentaire_produit end
  where id = p_vendeur_id;

  if not found then
    raise exception 'Boutique introuvable.';
  end if;
  return (select row_to_json(v) from vendeurs v where v.id = p_vendeur_id);
end;
$$;

-- Liste super admin : ajoute en_pause et la mise en place demandée
create or replace function sa_liste_boutiques()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not est_super_admin() then
    raise exception 'Accès refusé.';
  end if;
  return coalesce((
    select json_agg(x order by x.date_creation desc)
    from (
      select
        v.id, v.slug, v.nom_boutique, v.type_activite, v.formule, v.essai_fin, v.abonnement_fin,
        v.en_pause, v.pause_depuis,
        v.actif, v.template, v.origine, v.numero_whatsapp, v.date_creation,
        v.logo_debloque, v.recherche_debloquee, v.masquer_commentaire_produit,
        (select u.email from admins a join auth.users u on u.id = a.auth_user_id
          where a.vendeur_id = v.id limit 1) as email,
        (select count(*) from produits p where p.vendeur_id = v.id and p.actif = true) as nb_produits,
        (select count(*) from prestations p where p.vendeur_id = v.id and p.actif = true) as nb_prestations,
        (select count(*) from commandes c where c.vendeur_id = v.id
          and c.date_creation > now() - interval '30 days') as commandes_30j,
        (select count(*) from rendez_vous r where r.vendeur_id = v.id
          and r.date_creation > now() - interval '30 days') as rdv_30j,
        greatest(
          (select max(c.date_creation) from commandes c where c.vendeur_id = v.id),
          (select max(r.date_creation) from rendez_vous r where r.vendeur_id = v.id)
        ) as derniere_activite
      from vendeurs v
    ) x
  ), '[]'::json);
end;
$$;


-- ============ 3. STATISTIQUES DE VISITES ============
-- Compteurs agrégés par jour (aucune donnée personnelle : ni IP, ni appareil).
create table if not exists visites (
  vendeur_id uuid not null references vendeurs(id) on delete cascade,
  jour date not null default current_date,
  type text not null check (type in ('boutique', 'produit')),
  produit_id uuid not null default '00000000-0000-0000-0000-000000000000',
  nb integer not null default 0,
  primary key (vendeur_id, jour, type, produit_id)
);
alter table visites enable row level security;
-- Aucune policy : lecture et écriture uniquement via les fonctions ci-dessous.

create or replace function enregistrer_visite(p_vendeur_id uuid, p_type text, p_produit_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_produit uuid := '00000000-0000-0000-0000-000000000000';
begin
  if p_type not in ('boutique', 'produit') then
    return;
  end if;
  if not exists (select 1 from vendeurs where id = p_vendeur_id and actif = true) then
    return;
  end if;
  if p_type = 'produit' then
    if p_produit_id is null or not exists (select 1 from produits where id = p_produit_id and vendeur_id = p_vendeur_id) then
      return;
    end if;
    v_produit := p_produit_id;
  end if;
  insert into visites (vendeur_id, jour, type, produit_id, nb)
  values (p_vendeur_id, current_date, p_type, v_produit, 1)
  on conflict (vendeur_id, jour, type, produit_id)
  -- plafond par compteur et par jour : limite l'effet d'un abus
  do update set nb = least(visites.nb + 1, 100000);
end;
$$;
grant execute on function enregistrer_visite(uuid, text, uuid) to anon, authenticated;

-- Le vendeur lit SES statistiques. Le détail par produit et par jour est Pro+.
create or replace function mes_visites()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_formule text;
  v_res json;
begin
  select v.id, coalesce(v.formule, 'standard') into v_id, v_formule
  from admins a join vendeurs v on v.id = a.vendeur_id
  where a.auth_user_id = auth.uid() limit 1;
  if v_id is null then
    return null;
  end if;

  select json_build_object(
    'formule', v_formule,
    'aujourdhui', coalesce((select sum(nb) from visites where vendeur_id = v_id and type = 'boutique' and jour = current_date), 0),
    'j7',  coalesce((select sum(nb) from visites where vendeur_id = v_id and type = 'boutique' and jour > current_date - 7), 0),
    'j30', coalesce((select sum(nb) from visites where vendeur_id = v_id and type = 'boutique' and jour > current_date - 30), 0),
    'par_jour', case when v_formule = 'standard' then null else (
      select json_agg(json_build_object('jour', d::date, 'nb', coalesce(
        (select sum(nb) from visites where vendeur_id = v_id and type = 'boutique' and jour = d::date), 0)) order by d)
      from generate_series(current_date - 13, current_date, interval '1 day') d) end,
    'top_produits', case when v_formule = 'standard' then null else (
      select coalesce(json_agg(t), '[]'::json) from (
        select p.nom, sum(vi.nb) as vues
        from visites vi join produits p on p.id = vi.produit_id
        where vi.vendeur_id = v_id and vi.type = 'produit' and vi.jour > current_date - 30
        group by p.nom order by vues desc limit 5) t) end
  ) into v_res;
  return v_res;
end;
$$;
revoke execute on function mes_visites() from public, anon;
grant execute on function mes_visites() to authenticated;
