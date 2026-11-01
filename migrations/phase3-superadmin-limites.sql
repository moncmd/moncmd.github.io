-- ============================================================
-- PHASE 3 — Super admin + limites des formules vérifiées par la base
--           + reçus PDF reliés aux commandes + essai Pro pour prestataires
-- Prérequis : phases 1A et 2 déjà lancées.
-- Rejouable sans erreur. Aucun changement pour un usage normal :
-- les limites sont exactement celles que l'admin applique déjà.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Super admins (toi). Table invisible depuis le site (RLS sans policy).
-- ------------------------------------------------------------
create table if not exists super_admins (
  auth_user_id uuid primary key
);
alter table super_admins enable row level security;

create or replace function est_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from super_admins where auth_user_id = auth.uid());
$$;

grant execute on function est_super_admin() to authenticated;


-- ------------------------------------------------------------
-- 2. La protection des champs réservés laisse passer le super admin
--    (même liste de champs qu'en phase 2).
-- ------------------------------------------------------------
create or replace function proteger_champs_vendeur()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null or est_super_admin() then
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


-- ------------------------------------------------------------
-- 3. Super admin : liste de toutes les boutiques avec leur activité
-- ------------------------------------------------------------
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
        v.id, v.slug, v.nom_boutique, v.type_activite, v.formule, v.essai_fin,
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

grant execute on function sa_liste_boutiques() to authenticated;


-- ------------------------------------------------------------
-- 4. Super admin : modifier une boutique (seulement les champs listés)
--    p_modifs exemple : {"formule":"pro","essai_fin":null}
-- ------------------------------------------------------------
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
    actif        = case when p_modifs ? 'actif'     then coalesce((p_modifs->>'actif')::boolean, actif) else actif end,
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

grant execute on function sa_modifier_boutique(uuid, jsonb) to authenticated;


-- ------------------------------------------------------------
-- 5. Limites des formules vérifiées par la base.
--    Mêmes règles que admin.js / admin-prestations.js : un client qui
--    passe par l'admin ne voit aucune différence ; quelqu'un qui passe
--    par la console est bloqué. Toi (SQL Editor, super admin) : jamais bloqué.
-- ------------------------------------------------------------
create or replace function verifier_limites_formule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_formule text;
  v_nb integer;
begin
  if auth.uid() is null or est_super_admin() then
    return new;
  end if;

  select coalesce(formule, 'standard') into v_formule from vendeurs where id = new.vendeur_id;
  v_formule := coalesce(v_formule, 'standard');

  if tg_table_name = 'produits' then
    if v_formule = 'standard' then
      select count(*) into v_nb from produits where vendeur_id = new.vendeur_id and actif = true;
      if v_nb >= 20 then
        raise exception 'Limite de 20 produits atteinte avec la formule Standard. Passez en Pro pour continuer.';
      end if;
      if not exists (
           select 1 from produits
           where vendeur_id = new.vendeur_id and actif = true
             and coalesce(categorie, 'general') = coalesce(new.categorie, 'general'))
         and (select count(distinct coalesce(categorie, 'general')) from produits
              where vendeur_id = new.vendeur_id and actif = true) >= 5 then
        raise exception 'Limite de 5 catégories atteinte avec la formule Standard. Passez en Pro pour en ajouter davantage.';
      end if;
    end if;

  elsif tg_table_name = 'faq' then
    if v_formule = 'standard' then
      select count(*) into v_nb from faq where vendeur_id = new.vendeur_id;
      if v_nb >= 5 then
        raise exception 'Limite de 5 questions atteinte avec la formule Standard. Passez en Pro pour en ajouter davantage.';
      end if;
    end if;

  elsif tg_table_name = 'prestations' then
    if v_formule <> 'premium' then
      select count(*) into v_nb from prestations where vendeur_id = new.vendeur_id and actif = true;
      if v_nb >= (case when v_formule = 'pro' then 50 else 20 end) then
        raise exception 'Limite de prestations atteinte pour votre formule. Passez à la formule supérieure pour continuer.';
      end if;
    end if;

  elsif tg_table_name = 'personnel' then
    if v_formule = 'standard' then
      raise exception 'L''équipe est disponible à partir de la formule Pro.';
    end if;
    if v_formule = 'pro' then
      select count(*) into v_nb from personnel where vendeur_id = new.vendeur_id and actif = true;
      if v_nb >= 5 then
        raise exception 'Limite de 5 personnes atteinte avec la formule Pro. Passez en Premium pour continuer.';
      end if;
    end if;

  elsif tg_table_name = 'codes_promo' then
    if v_formule <> 'premium' then
      raise exception 'Les codes promo sont réservés à la formule Premium.';
    end if;

  elsif tg_table_name = 'depenses' then
    if v_formule = 'standard' then
      raise exception 'Le suivi des dépenses est disponible à partir de la formule Pro.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_limites_formule on produits;
create trigger trg_limites_formule before insert on produits
  for each row execute function verifier_limites_formule();

drop trigger if exists trg_limites_formule on faq;
create trigger trg_limites_formule before insert on faq
  for each row execute function verifier_limites_formule();

drop trigger if exists trg_limites_formule on prestations;
create trigger trg_limites_formule before insert on prestations
  for each row execute function verifier_limites_formule();

drop trigger if exists trg_limites_formule on personnel;
create trigger trg_limites_formule before insert on personnel
  for each row execute function verifier_limites_formule();

drop trigger if exists trg_limites_formule on codes_promo;
create trigger trg_limites_formule before insert on codes_promo
  for each row execute function verifier_limites_formule();

drop trigger if exists trg_limites_formule on depenses;
create trigger trg_limites_formule before insert on depenses
  for each row execute function verifier_limites_formule();


-- ------------------------------------------------------------
-- 6. Reçus PDF : relier le reçu à sa commande (bug corrigé).
--    Le client (non connecté) ne peut le faire que pour une commande
--    créée il y a moins d'1 h, sans reçu, et avec un fichier rangé
--    dans le dossier de la bonne boutique.
-- ------------------------------------------------------------
create or replace function lier_recu_commande(p_commande_id uuid, p_url text)
returns void
language sql
security definer
set search_path = public
as $$
  update commandes c
  set recu_url = p_url
  where c.id = p_commande_id
    and c.recu_url is null
    and c.date_creation > (now() - interval '1 hour')
    and p_url like '%/storage/v1/object/public/recus/' || c.vendeur_id::text || '/%';
$$;

grant execute on function lier_recu_commande(uuid, text) to anon, authenticated;


-- ------------------------------------------------------------
-- 7. Essai : Premium pour les vendeurs, Pro pour les prestataires
--    (Premium prestataire n'est pas encore vendu sur le site).
--    Même fonction qu'en phase 2, seule la ligne "formule" change.
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
      case when v_type = 'prestation' then 'pro' else 'premium' end,
      now() + interval '14 days', 'inscription', true
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


-- ============================================================
-- 8. TON ACCÈS SUPER ADMIN — à faire une seule fois, à la main :
--    a) Authentication > Users > "Add user" : crée ton compte
--       (un email à toi, différent des comptes boutiques).
--    b) Copie son "User UID", puis lance (en remplaçant) :
--
--    insert into super_admins (auth_user_id) values ('COLLE-ICI-TON-USER-UID')
--    on conflict do nothing;
-- ============================================================
