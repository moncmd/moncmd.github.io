-- ============================================================
-- PHASE 5 — Paiement semi-automatique des abonnements
-- Le vendeur paie par Wave / Orange Money, déclare son paiement
-- (référence + capture), tu valides en un clic dans le super admin.
-- Prérequis : phases 1 à 4.
-- AVANT de lancer : Storage > New bucket > nom "paiements",
--   PRIVÉ (Public décoché), taille max 5 MB,
--   types autorisés : image/jpeg, image/png, image/webp
-- Rejouable sans erreur.
-- ============================================================


-- 1. Tarifs (la base calcule elle-même le montant : le navigateur ne
--    peut pas envoyer un prix inventé). Modifiables dans Table Editor.
create table if not exists tarifs (
  type_activite text not null check (type_activite in ('produit', 'prestation')),
  formule text not null check (formule in ('standard', 'pro', 'premium')),
  prix_mensuel integer not null check (prix_mensuel > 0),
  frais_mise_en_service integer not null check (frais_mise_en_service >= 0),
  primary key (type_activite, formule)
);

insert into tarifs (type_activite, formule, prix_mensuel, frais_mise_en_service) values
  ('produit', 'standard', 2500, 6000),
  ('produit', 'pro', 5000, 10000),
  ('produit', 'premium', 10000, 15000),
  ('prestation', 'standard', 6000, 11000),
  ('prestation', 'pro', 12000, 17000)
on conflict (type_activite, formule) do nothing;

alter table tarifs enable row level security;
drop policy if exists "Lecture publique tarifs" on tarifs;
create policy "Lecture publique tarifs" on tarifs for select using (true);


-- 2. Tes numéros de paiement (affichés au vendeur). À vérifier !
create table if not exists parametres_cmd (
  cle text primary key,
  valeur text not null
);

insert into parametres_cmd (cle, valeur) values
  ('numero_wave', '784218267'),
  ('numero_om', '775683106'),
  ('nom_beneficiaire', 'CMD')
on conflict (cle) do nothing;

alter table parametres_cmd enable row level security;
drop policy if exists "Lecture publique parametres" on parametres_cmd;
create policy "Lecture publique parametres" on parametres_cmd for select using (true);


-- 3. Date de fin d'abonnement payé.
--    null = pas de date de fin (tous tes clients actuels) → rien ne change pour eux.
alter table vendeurs add column if not exists abonnement_fin timestamptz;

-- La protection des champs réservés couvre aussi abonnement_fin
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


-- 4. Demandes de paiement
create table if not exists demandes_paiement (
  id uuid primary key default gen_random_uuid(),
  vendeur_id uuid not null references vendeurs(id) on delete cascade,
  formule text not null check (formule in ('standard', 'pro', 'premium')),
  mois integer not null check (mois in (1, 3, 6, 12)),
  montant integer not null,
  moyen text not null check (moyen in ('wave', 'om')),
  reference text not null,
  capture_chemin text,
  statut text not null default 'en_attente' check (statut in ('en_attente', 'validee', 'refusee')),
  motif_refus text,
  date_creation timestamptz not null default now(),
  date_traitement timestamptz
);

create index if not exists idx_demandes_paiement_statut on demandes_paiement (statut, date_creation);

alter table demandes_paiement enable row level security;

-- Le vendeur voit ses propres demandes. Aucune policy d'écriture :
-- création uniquement par la fonction ci-dessous, traitement par toi.
drop policy if exists "Vendeur voit ses demandes de paiement" on demandes_paiement;
create policy "Vendeur voit ses demandes de paiement" on demandes_paiement for select
  using (vendeur_id in (select vendeur_id from admins where auth_user_id = auth.uid()));


-- 5. Montant dû (frais de mise en service au premier paiement validé)
create or replace function calculer_montant(p_vendeur_id uuid, p_formule text, p_mois integer)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_type text;
  v_prix integer;
  v_frais integer;
  v_deja_paye boolean;
begin
  select coalesce(type_activite, 'produit') into v_type from vendeurs where id = p_vendeur_id;
  select prix_mensuel, frais_mise_en_service into v_prix, v_frais
    from tarifs where type_activite = v_type and formule = p_formule;
  if v_prix is null then
    return null;
  end if;
  select exists (select 1 from demandes_paiement where vendeur_id = p_vendeur_id and statut = 'validee')
    into v_deja_paye;
  if v_deja_paye then
    return v_prix * p_mois;
  end if;
  -- Premier paiement : les frais incluent le premier mois
  return v_frais + v_prix * (p_mois - 1);
end;
$$;

-- Accessible au vendeur connecté, pour sa propre boutique uniquement
create or replace function mon_montant(p_formule text, p_mois integer)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select calculer_montant(a.vendeur_id, p_formule, p_mois)
  from admins a where a.auth_user_id = auth.uid() limit 1;
$$;

revoke execute on function calculer_montant(uuid, text, integer) from public, anon, authenticated;
revoke execute on function mon_montant(text, integer) from public, anon;
grant execute on function mon_montant(text, integer) to authenticated;


-- 6. Le vendeur déclare un paiement
create or replace function declarer_paiement(
  p_formule text,
  p_mois integer,
  p_moyen text,
  p_reference text,
  p_capture_chemin text
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

  v_montant := calculer_montant(v_vendeur_id, p_formule, p_mois);
  if v_montant is null then
    raise exception 'Cette formule n''est pas disponible pour ton activité.';
  end if;

  if (select count(*) from demandes_paiement where vendeur_id = v_vendeur_id and statut = 'en_attente') >= 3 then
    raise exception 'Tu as déjà 3 paiements en attente de validation. Patiente un peu ou contacte CMD.';
  end if;

  if exists (select 1 from demandes_paiement where upper(reference) = upper(v_ref) and statut <> 'refusee') then
    raise exception 'Cette référence de transaction a déjà été déclarée.';
  end if;

  insert into demandes_paiement (vendeur_id, formule, mois, montant, moyen, reference, capture_chemin)
  values (v_vendeur_id, p_formule, p_mois, v_montant, p_moyen, v_ref, v_capture)
  returning id into v_id;

  return json_build_object('id', v_id, 'montant', v_montant);
end;
$$;

revoke execute on function declarer_paiement(text, integer, text, text, text) from public, anon;
grant execute on function declarer_paiement(text, integer, text, text, text) to authenticated;


-- 7. Super admin : liste et traitement des demandes
create or replace function sa_liste_demandes(p_statut text default 'en_attente')
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
      select d.*, v.nom_boutique, v.slug, v.numero_whatsapp, v.formule as formule_actuelle,
             v.abonnement_fin, v.type_activite
      from demandes_paiement d join vendeurs v on v.id = d.vendeur_id
      where p_statut is null or d.statut = p_statut
      order by d.date_creation desc
      limit 200
    ) x
  ), '[]'::json);
end;
$$;

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

  -- La période payée commence maintenant, ou à la fin de la période en cours
  select greatest(coalesce(abonnement_fin, now()), now()) + make_interval(months => d.mois)
    into v_fin from vendeurs where id = d.vendeur_id;

  update vendeurs
    set formule = d.formule, essai_fin = null, abonnement_fin = v_fin
    where id = d.vendeur_id;

  return json_build_object('statut', 'validee', 'abonnement_fin', v_fin);
end;
$$;

grant execute on function sa_liste_demandes(text) to authenticated;
grant execute on function sa_traiter_demande(uuid, boolean, text) to authenticated;


-- 8. La liste des boutiques du super admin affiche la fin d'abonnement
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


-- 9. Fin d'abonnement non renouvelé : 3 jours de grâce, puis Standard
--    (même règle que la fin d'essai ; ne concerne que les abonnements
--    payés via ce système, jamais tes clients actuels sans date de fin)
create or replace function terminer_abonnements_expires()
returns integer
language sql
security definer
set search_path = public
as $$
  with maj as (
    update vendeurs
    set formule = 'standard', abonnement_fin = null
    where abonnement_fin is not null and abonnement_fin < now() - interval '3 days'
    returning 1
  )
  select count(*)::integer from maj;
$$;

revoke execute on function terminer_abonnements_expires() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'moncmd-fin-abonnements';
    perform cron.schedule('moncmd-fin-abonnements', '15 * * * *', 'select public.terminer_abonnements_expires()');
    raise notice 'Tâche fin des abonnements programmée.';
  else
    raise notice 'pg_cron non activé : active-le puis relance ce script.';
  end if;
end;
$$;


-- 10. Captures de paiement : bucket PRIVÉ "paiements"
--     Le vendeur n'écrit et ne lit que dans son dossier ; toi, tu lis tout.
drop policy if exists "Vendeur depose ses captures de paiement" on storage.objects;
create policy "Vendeur depose ses captures de paiement"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'paiements'
  and (storage.foldername(name))[1] in (
    select vendeur_id::text from public.admins where auth_user_id = auth.uid()
  )
);

drop policy if exists "Lecture des captures de paiement" on storage.objects;
create policy "Lecture des captures de paiement"
on storage.objects for select
to authenticated
using (
  bucket_id = 'paiements'
  and (
    (storage.foldername(name))[1] in (
      select vendeur_id::text from public.admins where auth_user_id = auth.uid()
    )
    or public.est_super_admin()
  )
);
