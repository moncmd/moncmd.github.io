-- ============================================================
-- PHASE 2 — Inscription autonome + essai Premium 14 jours
-- Prérequis : phase1a déjà lancée.
-- Avant de lancer : Database > Extensions > activer "pg_cron"
-- (sinon tout marche, mais les essais ne redescendent pas tout seuls).
-- Rejouable sans erreur. Ne touche à aucune boutique existante.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Nouvelles colonnes (les boutiques existantes : essai_fin = null,
--    origine = 'manuel' → aucun changement pour elles)
-- ------------------------------------------------------------
alter table vendeurs add column if not exists essai_fin timestamptz;
alter table vendeurs add column if not exists origine text default 'manuel';


-- ------------------------------------------------------------
-- 2. Protection élargie : en plus de la phase 1, les options que TU
--    débloques à la main (logo, recherche, commentaire produit) et la
--    date de fin d'essai ne sont plus modifiables par le vendeur.
-- ------------------------------------------------------------
create or replace function proteger_champs_vendeur()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.formule                     is distinct from old.formule
  or new.actif                       is distinct from old.actif
  or new.slug                        is distinct from old.slug
  or new.template                    is distinct from old.template
  or new.id                          is distinct from old.id
  or new.date_creation               is distinct from old.date_creation
  or new.essai_fin                   is distinct from old.essai_fin
  or new.origine                     is distinct from old.origine
  or new.logo_debloque               is distinct from old.logo_debloque
  or new.recherche_debloquee         is distinct from old.recherche_debloquee
  or new.masquer_commentaire_produit is distinct from old.masquer_commentaire_produit then
    raise exception 'Champ réservé : ce réglage ne peut pas être modifié depuis la boutique.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_proteger_champs_vendeur on vendeurs;
create trigger trg_proteger_champs_vendeur
  before update on vendeurs
  for each row execute function proteger_champs_vendeur();


-- ------------------------------------------------------------
-- 3. Règles de slug
--    - 3 à 30 caractères, minuscules, chiffres, tirets
--    - pas un nom de page du site. Attention : supabase-config.js
--      regarde le morceau AVANT le premier tiret, donc "admin-shop"
--      ou "panier-mode" casseraient aussi → interdits.
-- ------------------------------------------------------------
create or replace function slug_valide(p_slug text)
returns boolean
language sql
immutable
as $$
  select p_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     and length(p_slug) between 3 and 30
     and split_part(p_slug, '-', 1) not in (
       'index', 'panier', 'commande', 'admin', '404', 'inscription',
       'demo', 'www', 'api', 'app', 'shop', 'moncmd', 'cmd',
       'connexion', 'login', 'aide', 'support', 'tarifs', 'prestations'
     );
$$;

-- Accessible sans être connecté (vérification en direct pendant la saisie).
-- security definer : voit aussi les boutiques désactivées, pour ne jamais
-- redonner le slug d'un ancien client.
create or replace function slug_disponible(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select slug_valide(lower(p_slug))
     and not exists (select 1 from vendeurs where slug = lower(p_slug));
$$;

grant execute on function slug_disponible(text) to anon, authenticated;


-- ------------------------------------------------------------
-- 4. Création d'une boutique par le client lui-même
--    Appelée par inscription.html (ou par l'admin au premier login
--    si la confirmation email est activée).
-- ------------------------------------------------------------
create or replace function creer_boutique(
  p_slug text,
  p_nom text,
  p_whatsapp text,
  p_type_activite text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_slug text := lower(trim(p_slug));
  v_nom text := trim(p_nom);
  v_tel text := regexp_replace(coalesce(p_whatsapp, ''), '[^0-9]', '', 'g');
  v_type text := case when p_type_activite = 'prestation' then 'prestation' else 'produit' end;
  v_vendeur_id uuid;
begin
  if v_uid is null then
    raise exception 'Connecte-toi avant de créer ta boutique.';
  end if;

  if exists (select 1 from admins where auth_user_id = v_uid) then
    raise exception 'Ce compte a déjà une boutique.';
  end if;

  if v_nom is null or length(v_nom) < 2 or length(v_nom) > 60 then
    raise exception 'Le nom de la boutique doit faire entre 2 et 60 caractères.';
  end if;

  if not slug_valide(v_slug) then
    raise exception 'Adresse invalide : 3 à 30 caractères, lettres minuscules, chiffres et tirets.';
  end if;

  -- Numéro sénégalais à 9 chiffres (77..., 78..., 70...) → on ajoute 221
  if length(v_tel) = 9 and left(v_tel, 1) = '7' then
    v_tel := '221' || v_tel;
  end if;
  if length(v_tel) < 8 or length(v_tel) > 15 then
    raise exception 'Numéro WhatsApp invalide.';
  end if;

  begin
    insert into vendeurs (
      slug, nom_boutique, numero_whatsapp, type_activite,
      template, formule, essai_fin, origine, actif
    ) values (
      v_slug, v_nom, v_tel, v_type,
      case when v_type = 'prestation' then 'minimal' else '' end,
      'premium', now() + interval '14 days', 'inscription', true
    )
    returning id into v_vendeur_id;
  exception when unique_violation then
    raise exception 'Cette adresse est déjà prise, choisis-en une autre.';
  end;

  insert into admins (auth_user_id, vendeur_id) values (v_uid, v_vendeur_id);

  return json_build_object('slug', v_slug, 'type_activite', v_type);
end;
$$;

revoke execute on function creer_boutique(text, text, text, text) from public, anon;
grant execute on function creer_boutique(text, text, text, text) to authenticated;


-- ------------------------------------------------------------
-- 5. Fin d'essai : repasse en standard les essais expirés.
--    Si un client a payé, tu changes sa formule à la main ET tu mets
--    essai_fin à null → il n'est plus concerné.
-- ------------------------------------------------------------
create or replace function terminer_essais_expires()
returns integer
language sql
security definer
set search_path = public
as $$
  with maj as (
    update vendeurs
    set formule = 'standard', essai_fin = null
    where essai_fin is not null and essai_fin < now()
    returning 1
  )
  select count(*)::integer from maj;
$$;

revoke execute on function terminer_essais_expires() from public, anon, authenticated;

-- Tâche automatique toutes les heures (si pg_cron est activé)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'moncmd-fin-essais';
    perform cron.schedule('moncmd-fin-essais', '0 * * * *', 'select public.terminer_essais_expires()');
    raise notice 'Tâche fin des essais programmée.';
  else
    raise notice 'pg_cron non activé : active-le puis relance ce script.';
  end if;
end;
$$;
