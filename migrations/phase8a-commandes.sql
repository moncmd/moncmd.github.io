-- ============================================================
-- PHASE 8A — Commandes plus sûres et plus pro
--  A. Le total est RECALCULÉ par la base à partir des vrais prix
--     (avant : le navigateur du client envoyait le total, falsifiable)
--     + code promo vérifié côté base
--  B. Numéro de commande court par boutique : #1, #2, #3…
--  C. Page de suivi pour le client (lien secret dans le message WhatsApp)
--  D. Preuve de paiement envoyée par le client (capture Wave / OM)
-- Prérequis : phases 1 à 7, bucket privé « paiements » (phase 5).
-- Rejouable sans erreur.
-- ============================================================

alter table vendeurs  add column if not exists compteur_commandes integer not null default 0;
alter table commandes add column if not exists numero integer;
alter table commandes add column if not exists preuve_chemin text;
alter table commandes add column if not exists preuve_date timestamptz;


-- ============ A + B. Recalcul et numérotation ============
create or replace function normaliser_commande()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ligne jsonb;
  v_contenu jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_q integer;
  p produits%rowtype;
  v_formule text;
  v_pct integer;
begin
  -- Toi dans le SQL Editor (aucun jeton) : pas de recalcul
  if auth.role() is null then
    return new;
  end if;

  if new.contenu is null or jsonb_typeof(new.contenu) <> 'array'
     or jsonb_array_length(new.contenu) = 0 or jsonb_array_length(new.contenu) > 100 then
    raise exception 'Panier invalide.';
  end if;

  for v_ligne in select value from jsonb_array_elements(new.contenu) loop
    begin
      select * into p from produits
      where id = (v_ligne->>'produit_id')::uuid and vendeur_id = new.vendeur_id and actif = true;
    exception when others then
      p := null;
    end;
    if p.id is null then
      raise exception 'Un produit de votre panier n''est plus disponible. Rechargez la page.';
    end if;

    v_q := coalesce(nullif(v_ligne->>'quantite', '')::integer, 1);
    if v_q < 1 or v_q > 999 then
      raise exception 'Quantité invalide.';
    end if;

    v_total := v_total + p.prix * v_q;
    v_contenu := v_contenu || jsonb_build_object(
      'produit_id', p.id,
      'produit', p.nom,
      'reference', p.reference,
      'quantite', v_q,
      'prix', p.prix,
      'commentaire', left(coalesce(v_ligne->>'commentaire', ''), 300)
    );
  end loop;

  -- Code promo : vérifié ici (actif, non expiré, boutique Premium)
  new.reduction := 0;
  if nullif(trim(coalesce(new.code_promo, '')), '') is not null then
    select coalesce(formule, 'standard') into v_formule from vendeurs where id = new.vendeur_id;
    select reduction_pourcent into v_pct from codes_promo
    where vendeur_id = new.vendeur_id and actif = true
      and lower(code) = lower(trim(new.code_promo))
      and (date_expiration is null or date_expiration >= current_date)
    limit 1;
    if v_formule = 'premium' and v_pct is not null and v_pct between 1 and 100 then
      new.reduction := round(v_total * v_pct / 100.0)::integer;
      new.code_promo := upper(trim(new.code_promo));
    else
      new.code_promo := null;
    end if;
  else
    new.code_promo := null;
  end if;

  new.contenu := v_contenu;
  new.total := v_total - new.reduction;

  -- Champs texte : longueurs raisonnables
  new.nom_client := left(new.nom_client, 80);
  new.prenom_client := left(new.prenom_client, 80);
  new.numero_client := left(new.numero_client, 30);
  new.adresse := left(new.adresse, 300);
  new.heure_recuperation := left(new.heure_recuperation, 20);
  new.mode_paiement := left(new.mode_paiement, 30);
  new.recu_url := null;
  new.preuve_chemin := null;

  -- Numéro court propre à la boutique
  update vendeurs set compteur_commandes = compteur_commandes + 1
  where id = new.vendeur_id
  returning compteur_commandes into new.numero;

  return new;
end;
$$;

drop trigger if exists trg_normaliser_commande on commandes;
create trigger trg_normaliser_commande before insert on commandes
  for each row execute function normaliser_commande();

-- Passer commande en une fois et récupérer numéro + total officiels
create or replace function passer_commande(p jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  c commandes%rowtype;
begin
  insert into commandes (
    vendeur_id, nom_client, prenom_client, numero_client, adresse,
    date_livraison, heure_recuperation, mode_paiement, code_promo, contenu, total
  ) values (
    (p->>'vendeur_id')::uuid, p->>'nom_client', p->>'prenom_client', p->>'numero_client', p->>'adresse',
    nullif(p->>'date_livraison', '')::date, p->>'heure_recuperation', p->>'mode_paiement', p->>'code_promo',
    p->'contenu', 0
  )
  returning * into c;

  return json_build_object('id', c.id, 'numero', c.numero, 'total', c.total,
                           'reduction', c.reduction, 'code_promo', c.code_promo, 'contenu', c.contenu);
end;
$$;
grant execute on function passer_commande(jsonb) to anon, authenticated;


-- ============ C. Suivi de commande (lien secret = identifiant) ============
create or replace function ma_commande(p_id uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'numero', c.numero, 'statut', c.statut, 'contenu', c.contenu, 'total', c.total,
    'reduction', c.reduction, 'code_promo', c.code_promo, 'mode_paiement', c.mode_paiement,
    'date_livraison', c.date_livraison, 'heure', c.heure_recuperation, 'adresse', c.adresse,
    'nom_client', c.nom_client, 'date_creation', c.date_creation,
    'preuve_envoyee', c.preuve_chemin is not null,
    'boutique', json_build_object(
      'id', v.id, 'nom', v.nom_boutique, 'slug', v.slug, 'numero_whatsapp', v.numero_whatsapp,
      'logo_url', v.logo_url, 'adresse', v.adresse,
      'wave_numero', case when coalesce(v.accepte_wave, true) then v.wave_numero end,
      'om_numero', case when coalesce(v.accepte_om, true) then v.om_numero end)
  )
  from commandes c join vendeurs v on v.id = c.vendeur_id
  where c.id = p_id;
$$;
grant execute on function ma_commande(uuid) to anon, authenticated;


-- ============ D. Preuve de paiement du client ============
-- Le client dépose sa capture dans le bucket privé « paiements »,
-- dans <boutique>/commandes/<id-commande>-…  (images uniquement)
drop policy if exists "Client depose sa preuve de paiement" on storage.objects;
create policy "Client depose sa preuve de paiement"
on storage.objects for insert
to anon, authenticated
with check (
  bucket_id = 'paiements'
  and (storage.foldername(name))[2] = 'commandes'
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  and (storage.foldername(name))[1] in (select id::text from public.vendeurs where actif = true)
);

create or replace function joindre_preuve_commande(p_id uuid, p_chemin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update commandes c
  set preuve_chemin = p_chemin, preuve_date = now()
  where c.id = p_id
    and c.preuve_chemin is null
    and c.date_creation > (now() - interval '7 days')
    and p_chemin like c.vendeur_id::text || '/commandes/' || c.id::text || '-%'
    and p_chemin not like '%..%';
  if not found then
    raise exception 'Impossible d''ajouter la preuve à cette commande.';
  end if;
end;
$$;
grant execute on function joindre_preuve_commande(uuid, text) to anon, authenticated;


-- Adresse réservée : nouvelle page suivi.html
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
       'connexion', 'login', 'aide', 'support', 'tarifs', 'prestations',
       'rdv', 'apparence', 'abonnement', 'super', 'voirpanier', 'suivi'
     );
$$;
