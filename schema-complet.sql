-- ============================================================
-- CMD. — SCHÉMA COMPLET (état au 1er novembre 2026, après phases 1 à 3)
--
-- À QUOI ÇA SERT : recréer la base à l'identique dans un projet
-- Supabase VIDE (projet de test, nouveau projet, secours).
-- NE PAS lancer sur la base de prod : elle a déjà tout.
--
-- Avant de lancer, dans le nouveau projet :
--   1. Database > Extensions : activer pg_cron
--   2. Storage : créer ces buckets en "Public" :
--      produits-images, produits-videos, logos-vendeurs, recus,
--      galerie, prestations-images, personnel-images
-- Reconstitué à partir de ta base réelle (colonnes et policies que tu
-- m'as envoyées) : si tu ajoutes une colonne à la main dans Supabase,
-- ajoute-la aussi ici pour que ce fichier reste la référence.
-- ============================================================


-- ============ TABLES ============

create table if not exists vendeurs (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  nom_boutique text not null,
  numero_whatsapp text not null,
  couleur_accent text default '#e56400',
  logo_url text,
  wave_numero text,
  om_numero text,
  actif boolean default true,
  date_creation timestamp default now(),
  formule text default 'standard',
  template text,
  type_activite text default 'produit',
  rdv_max_par_jour integer default 8,
  jours_fermeture_recurrents integer[] default '{0}',
  instagram text,
  tiktok text,
  facebook text,
  adresse text,
  heure_ouverture time default '09:00',
  heure_fermeture time default '18:00',
  logo_debloque boolean default false,
  message_accueil text,
  recherche_debloquee boolean default false,
  masquer_commentaire_produit boolean default false,
  accepte_wave boolean default true,
  accepte_om boolean default true,
  compteur_produits integer default 0,
  essai_fin timestamptz,
  origine text default 'manuel',
  constraint check_template_valide check (template in
    ('', 'urbain', 'marche', 'doux', 'minimal', 'editorial', 'restaurant', 'sport', 'import', 'hybride'))
);

create table if not exists admins (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique not null,
  vendeur_id uuid references vendeurs(id) on delete cascade
);

create table if not exists produits (
  id uuid primary key default gen_random_uuid(),
  vendeur_id uuid references vendeurs(id) on delete cascade,
  nom text not null,
  prix integer not null,
  image_url text,
  categorie text default 'general',
  description text,
  actif boolean default true,
  date_creation timestamp default now(),
  favori boolean default false,
  quantite_stock integer,
  video_url text,
  ordre integer default 0,
  reference integer
);

create table if not exists commandes (
  id uuid primary key default gen_random_uuid(),
  vendeur_id uuid references vendeurs(id) on delete cascade,
  nom_client text,
  prenom_client text,
  numero_client text,
  heure_recuperation text,
  mode_paiement text,
  contenu jsonb not null,
  total integer not null,
  statut text default 'nouvelle',
  date_creation timestamp default now(),
  adresse text,
  recu_url text,
  code_promo text,
  reduction integer default 0,
  date_livraison date
);

create table if not exists avis (
  id uuid primary key default gen_random_uuid(),
  vendeur_id uuid references vendeurs(id) on delete cascade,
  nom_client text,
  numero_client text,
  note integer,
  commentaire text,
  statut text default 'en_attente',
  date_creation timestamptz default now()
);

create table if not exists faq (
  id uuid primary key default gen_random_uuid(),
  vendeur_id uuid references vendeurs(id) on delete cascade,
  question text,
  reponse text,
  ordre integer default 0,
  date_creation timestamptz default now()
);

create table if not exists codes_promo (
  id uuid primary key default gen_random_uuid(),
  vendeur_id uuid references vendeurs(id) on delete cascade,
  code text,
  reduction_pourcent integer,
  date_expiration date,
  actif boolean default true,
  date_creation timestamp default now()
);

create table if not exists depenses (
  id uuid primary key default gen_random_uuid(),
  vendeur_id uuid references vendeurs(id) on delete cascade,
  montant integer not null,
  note text,
  date_creation timestamp default now()
);

create table if not exists liste_attente_stock (
  id uuid primary key default gen_random_uuid(),
  vendeur_id uuid references vendeurs(id) on delete cascade,
  produit_id uuid references produits(id) on delete cascade,
  nom_client text,
  numero_client text not null,
  contacte boolean default false,
  date_creation timestamp default now()
);

create table if not exists prestations (
  id uuid primary key default gen_random_uuid(),
  vendeur_id uuid references vendeurs(id) on delete cascade,
  nom text not null,
  prix integer not null,
  duree_minutes integer not null default 30,
  image_url text,
  description text,
  favori boolean default false,
  actif boolean default true,
  date_creation timestamp default now(),
  categorie text,
  ordre integer default 0,
  capacite_simultanee integer default 1,
  prix_variable boolean default false
);

create table if not exists personnel (
  id uuid primary key default gen_random_uuid(),
  vendeur_id uuid references vendeurs(id) on delete cascade,
  nom text not null,
  photo_url text,
  actif boolean default true,
  date_creation timestamp default now()
);

create table if not exists personnel_prestations (
  personnel_id uuid references personnel(id) on delete cascade,
  prestation_id uuid references prestations(id) on delete cascade,
  primary key (personnel_id, prestation_id)
);

create table if not exists jours_bloques (
  id uuid primary key default gen_random_uuid(),
  vendeur_id uuid references vendeurs(id) on delete cascade,
  date date not null,
  date_creation timestamp default now()
);

create table if not exists blocages_horaires (
  id uuid primary key default gen_random_uuid(),
  vendeur_id uuid references vendeurs(id) on delete cascade,
  personnel_id uuid references personnel(id) on delete cascade,
  date date not null,
  heure_debut time not null,
  heure_fin time not null,
  date_creation timestamp default now()
);

create table if not exists galerie (
  id uuid primary key default gen_random_uuid(),
  vendeur_id uuid references vendeurs(id) on delete cascade,
  image_url text not null,
  ordre integer default 0,
  date_creation timestamp default now(),
  type text default 'photo'
);

create table if not exists rendez_vous (
  id uuid primary key default gen_random_uuid(),
  vendeur_id uuid references vendeurs(id) on delete cascade,
  prestation_id uuid references prestations(id),
  personnel_id uuid references personnel(id),
  nom_client text,
  numero_client text,
  date date not null,
  heure time,
  date_creation timestamp default now(),
  statut text default 'en_attente',
  duree_minutes integer default 30,
  groupe_reservation uuid,
  lieu text default 'boutique',
  adresse_client text
);


-- ============ RLS ============

do $$
declare t text;
begin
  foreach t in array array['vendeurs','admins','produits','commandes','avis','faq','codes_promo',
    'depenses','liste_attente_stock','prestations','personnel','personnel_prestations',
    'jours_bloques','blocages_horaires','galerie','rendez_vous']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Raccourci lisible pour "les lignes de MA boutique"
-- (identique aux policies existantes en prod)
drop policy if exists "Lecture publique vendeurs actifs" on vendeurs;
create policy "Lecture publique vendeurs actifs" on vendeurs for select using (actif = true);
drop policy if exists "Vendeur modifie ses propres informations" on vendeurs;
create policy "Vendeur modifie ses propres informations" on vendeurs for update
  using (id in (select vendeur_id from admins where auth_user_id = auth.uid()));

drop policy if exists "Admin lit sa propre ligne" on admins;
create policy "Admin lit sa propre ligne" on admins for select using (auth_user_id = auth.uid());

drop policy if exists "Lecture publique produits actifs" on produits;
create policy "Lecture publique produits actifs" on produits for select using (actif = true);
drop policy if exists "Vendeur gere ses produits" on produits;
create policy "Vendeur gere ses produits" on produits for all
  using (vendeur_id in (select vendeur_id from admins where auth_user_id = auth.uid()));

drop policy if exists "Creation publique commandes" on commandes;
create policy "Creation publique commandes" on commandes for insert with check (true);
drop policy if exists "Vendeur voit ses commandes" on commandes;
create policy "Vendeur voit ses commandes" on commandes for select
  using (vendeur_id in (select vendeur_id from admins where auth_user_id = auth.uid()));
drop policy if exists "Vendeur confirme ses commandes" on commandes;
create policy "Vendeur confirme ses commandes" on commandes for update
  using (vendeur_id in (select vendeur_id from admins where auth_user_id = auth.uid()));

drop policy if exists "Creation publique d'avis" on avis;
create policy "Creation publique d'avis" on avis for insert with check (true);
drop policy if exists "Lecture publique avis approuves" on avis;
create policy "Lecture publique avis approuves" on avis for select using (statut = 'approuve');
drop policy if exists "Vendeur voit tous ses avis" on avis;
create policy "Vendeur voit tous ses avis" on avis for select
  using (vendeur_id in (select vendeur_id from admins where auth_user_id = auth.uid()));
drop policy if exists "Vendeur modere ses avis" on avis;
create policy "Vendeur modere ses avis" on avis for update
  using (vendeur_id in (select vendeur_id from admins where auth_user_id = auth.uid()));

drop policy if exists "Lecture publique FAQ" on faq;
create policy "Lecture publique FAQ" on faq for select using (true);
drop policy if exists "Vendeur gere sa FAQ" on faq;
create policy "Vendeur gere sa FAQ" on faq for all
  using (vendeur_id in (select vendeur_id from admins where auth_user_id = auth.uid()));

drop policy if exists "Vendeur gere ses codes_promo" on codes_promo;
create policy "Vendeur gere ses codes_promo" on codes_promo for all
  using (vendeur_id in (select vendeur_id from admins where auth_user_id = auth.uid()));

drop policy if exists "Vendeur gere ses depenses" on depenses;
create policy "Vendeur gere ses depenses" on depenses for all
  using (vendeur_id in (select vendeur_id from admins where auth_user_id = auth.uid()));

drop policy if exists "Creation publique liste attente" on liste_attente_stock;
create policy "Creation publique liste attente" on liste_attente_stock for insert with check (true);
drop policy if exists "Vendeur voit sa liste attente" on liste_attente_stock;
create policy "Vendeur voit sa liste attente" on liste_attente_stock for select
  using (vendeur_id in (select vendeur_id from admins where auth_user_id = auth.uid()));
drop policy if exists "Vendeur met a jour sa liste attente" on liste_attente_stock;
create policy "Vendeur met a jour sa liste attente" on liste_attente_stock for update
  using (vendeur_id in (select vendeur_id from admins where auth_user_id = auth.uid()));

drop policy if exists "Lecture publique prestations actives" on prestations;
create policy "Lecture publique prestations actives" on prestations for select using (actif = true);
drop policy if exists "Vendeur gere ses prestations" on prestations;
create policy "Vendeur gere ses prestations" on prestations for all
  using (vendeur_id in (select vendeur_id from admins where auth_user_id = auth.uid()));

drop policy if exists "Lecture publique personnel actif" on personnel;
create policy "Lecture publique personnel actif" on personnel for select using (actif = true);
drop policy if exists "Vendeur gere son personnel" on personnel;
create policy "Vendeur gere son personnel" on personnel for all
  using (vendeur_id in (select vendeur_id from admins where auth_user_id = auth.uid()));

drop policy if exists "Lecture publique personnel_prestations" on personnel_prestations;
create policy "Lecture publique personnel_prestations" on personnel_prestations for select using (true);
drop policy if exists "Vendeur gere les liaisons personnel/prestations" on personnel_prestations;
create policy "Vendeur gere les liaisons personnel/prestations" on personnel_prestations for all
  using (personnel_id in (select id from personnel where vendeur_id in
    (select vendeur_id from admins where auth_user_id = auth.uid())));

drop policy if exists "Lecture publique jours bloques" on jours_bloques;
create policy "Lecture publique jours bloques" on jours_bloques for select using (true);
drop policy if exists "Vendeur gere ses jours bloques" on jours_bloques;
create policy "Vendeur gere ses jours bloques" on jours_bloques for all
  using (vendeur_id in (select vendeur_id from admins where auth_user_id = auth.uid()));

drop policy if exists "Lecture publique blocages horaires" on blocages_horaires;
create policy "Lecture publique blocages horaires" on blocages_horaires for select using (true);
drop policy if exists "Vendeur gere ses blocages horaires" on blocages_horaires;
create policy "Vendeur gere ses blocages horaires" on blocages_horaires for all
  using (vendeur_id in (select vendeur_id from admins where auth_user_id = auth.uid()));

drop policy if exists "Lecture publique galerie" on galerie;
create policy "Lecture publique galerie" on galerie for select using (true);
drop policy if exists "Vendeur gere sa galerie" on galerie;
create policy "Vendeur gere sa galerie" on galerie for all
  using (vendeur_id in (select vendeur_id from admins where auth_user_id = auth.uid()));

drop policy if exists "Creation publique rendez_vous" on rendez_vous;
create policy "Creation publique rendez_vous" on rendez_vous for insert with check (true);
drop policy if exists "Vendeur voit ses rendez_vous" on rendez_vous;
create policy "Vendeur voit ses rendez_vous" on rendez_vous for select
  using (vendeur_id in (select vendeur_id from admins where auth_user_id = auth.uid()));

-- Storage : lecture publique de tous les buckets d'images/vidéos/reçus
do $$
declare b text;
begin
  foreach b in array array['produits-images','produits-videos','logos-vendeurs','recus',
    'galerie','prestations-images','personnel-images']
  loop
    execute format('drop policy if exists %I on storage.objects', 'Lecture publique ' || b);
    execute format('create policy %I on storage.objects for select using (bucket_id = %L)', 'Lecture publique ' || b, b);
  end loop;
end $$;


-- ============ FONCTIONS D'ORIGINE ============

create or replace function decrementer_stock(p_produit_id uuid, p_quantite integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  update produits set quantite_stock = greatest(quantite_stock - p_quantite, 0)
  where id = p_produit_id and quantite_stock is not null;
end;
$$;
grant execute on function decrementer_stock(uuid, integer) to anon, authenticated;

create or replace function attribuer_reference_produit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.reference is null then
    update vendeurs set compteur_produits = coalesce(compteur_produits, 0) + 1
    where id = new.vendeur_id
    returning compteur_produits into new.reference;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_reference_produit on produits;
create trigger trg_reference_produit before insert on produits
  for each row execute function attribuer_reference_produit();

-- Boutique de démo
insert into vendeurs (slug, nom_boutique, numero_whatsapp, wave_numero, om_numero, template)
values ('demo', 'CMD Démo', '221784218267', '784218267', '775683106', '')
on conflict (slug) do nothing;


-- ============================================================
-- PHASES 1 À 3 (copie exacte des fichiers du dossier migrations/)
-- ============================================================

-- >>>>>>>>>> migrations/phase1a-securite.sql
-- ============================================================
-- PHASE 1A — Sécurité (sans impact sur le site actuel)
-- À lancer d'abord sur le projet Supabase de TEST, puis en prod.
-- Chaque bloc est rejouable sans erreur.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Un vendeur ne peut plus modifier sa formule, son statut actif,
--    son slug ni son template depuis le navigateur.
--    Toi (SQL Editor / tableau Supabase) tu gardes la main :
--    auth.uid() y est vide, donc le trigger te laisse passer.
--    NB : compteur_produits n'est PAS protégé, sinon la numérotation
--    automatique des produits casserait.
-- ------------------------------------------------------------
create or replace function proteger_champs_vendeur()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.formule       is distinct from old.formule
  or new.actif         is distinct from old.actif
  or new.slug          is distinct from old.slug
  or new.template      is distinct from old.template
  or new.id            is distinct from old.id
  or new.date_creation is distinct from old.date_creation then
    raise exception 'Champ réservé : formule, actif, slug et template ne peuvent pas être modifiés depuis la boutique.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_proteger_champs_vendeur on vendeurs;
create trigger trg_proteger_champs_vendeur
  before update on vendeurs
  for each row execute function proteger_champs_vendeur();


-- ------------------------------------------------------------
-- 2. Avis : un visiteur ne peut plus publier directement un avis
--    "approuve". Tout nouvel avis passe en modération.
-- ------------------------------------------------------------
create or replace function forcer_avis_en_attente()
returns trigger
language plpgsql
as $$
begin
  new.statut := 'en_attente';
  return new;
end;
$$;

drop trigger if exists trg_avis_en_attente on avis;
create trigger trg_avis_en_attente
  before insert on avis
  for each row execute function forcer_avis_en_attente();


-- ------------------------------------------------------------
-- 3. Commandes : un visiteur ne peut plus insérer une commande déjà
--    "confirmee" (ce qui gonflerait le CA et les stats du vendeur).
-- ------------------------------------------------------------
create or replace function forcer_statut_commande()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null
     or new.vendeur_id not in (select vendeur_id from admins where auth_user_id = auth.uid()) then
    new.statut := 'nouvelle';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_statut_commande on commandes;
create trigger trg_statut_commande
  before insert on commandes
  for each row execute function forcer_statut_commande();


-- ------------------------------------------------------------
-- 4. Codes promo : vérification côté serveur.
--    Corrige aussi un bug : avec .ilike(), taper "%" comme code
--    appliquait le premier code actif de la boutique.
--    (La lecture publique de la table est retirée en PHASE 1C,
--     une fois le nouveau commande.js en ligne.)
-- ------------------------------------------------------------
create or replace function verifier_code_promo(p_vendeur_id uuid, p_code text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'code', c.code,
    'reduction_pourcent', c.reduction_pourcent,
    'date_expiration', c.date_expiration
  )
  from codes_promo c
  where c.vendeur_id = p_vendeur_id
    and c.actif = true
    and lower(c.code) = lower(trim(p_code))
  limit 1;
$$;

grant execute on function verifier_code_promo(uuid, text) to anon, authenticated;


-- ------------------------------------------------------------
-- 5. Storage : chaque vendeur n'écrit QUE dans son propre dossier
--    (<vendeur_id>/...). Tes admin.js / admin-prestations.js nomment
--    déjà les fichiers comme ça, donc rien ne change pour eux.
--    Les fichiers déjà en ligne restent lisibles.
-- ------------------------------------------------------------
drop policy if exists "Upload public galerie"             on storage.objects;
drop policy if exists "Upload public logos-vendeurs"      on storage.objects;
drop policy if exists "Upload public personnel-images"    on storage.objects;
drop policy if exists "Upload public prestations-images"  on storage.objects;
drop policy if exists "Upload public produits-videos"     on storage.objects;
drop policy if exists "Vendeurs connectes peuvent uploader" on storage.objects;
drop policy if exists "Vendeur upload dans son dossier"   on storage.objects;

create policy "Vendeur upload dans son dossier"
on storage.objects for insert
to authenticated
with check (
  bucket_id in ('galerie', 'logos-vendeurs', 'personnel-images',
                'prestations-images', 'produits-images', 'produits-videos')
  and (storage.foldername(name))[1] in (
    select vendeur_id::text from public.admins where auth_user_id = auth.uid()
  )
);

-- Reçus : générés par le client (non connecté) au moment de la commande.
-- On garde l'upload anonyme, mais seulement des PDF, et seulement dans
-- le dossier d'une boutique qui existe et est active.
drop policy if exists "Upload public des recus" on storage.objects;
drop policy if exists "Upload recus PDF boutique existante" on storage.objects;

create policy "Upload recus PDF boutique existante"
on storage.objects for insert
to anon, authenticated
with check (
  bucket_id = 'recus'
  and lower(storage.extension(name)) = 'pdf'
  and (storage.foldername(name))[1] in (
    select id::text from public.vendeurs where actif = true
  )
);

-- >>>>>>>>>> migrations/phase1c-fermer-codes-promo.sql
-- ============================================================
-- PHASE 1C — À lancer SEULEMENT après avoir mis en ligne le
-- nouveau commande.js (qui utilise verifier_code_promo).
-- Avant : n'importe qui pouvait lister tous les codes promo
-- de toutes les boutiques.
-- ============================================================
drop policy if exists "Lecture publique codes_promo actifs" on codes_promo;
-- La policy "Vendeur gere ses codes_promo" reste : l'admin voit toujours les siens.

-- >>>>>>>>>> migrations/phase2-inscription.sql
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

-- >>>>>>>>>> migrations/phase3-superadmin-limites.sql
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
