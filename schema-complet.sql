-- ============================================================
-- CMD. — SCHÉMA COMPLET (état au 1er novembre 2026, après phases 1 à 8B)
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
--      + "paiements" en PRIVÉ (Public décoché)
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

-- Produit le plus commandé des 7 derniers jours (badge « tendance »)
create or replace function produit_tendance(p_vendeur_id uuid)
returns uuid language sql security definer set search_path = public as $$
  select (item->>'produit_id')::uuid as produit_id
  from commandes, jsonb_array_elements(contenu) as item
  where vendeur_id = p_vendeur_id
    and statut = 'confirmee'
    and date_creation >= now() - interval '7 days'
  group by (item->>'produit_id')::uuid
  order by sum((item->>'quantite')::int) desc
  limit 1;
$$;
grant execute on function produit_tendance(uuid) to anon, authenticated;

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

-- >>>>>>>>>> migrations/phase4-personnalisation.sql
-- ============================================================
-- PHASE 4 — Personnalisation des boutiques par le vendeur
-- Prérequis : phases 1 à 3.
-- Rejouable sans erreur. Aucune boutique ne change d'apparence
-- tant que son propriétaire n'a rien enregistré dans « Apparence ».
-- ============================================================


-- 1. Réglages d'apparence (vide = rendu actuel, inchangé)
alter table vendeurs add column if not exists theme jsonb;

alter table vendeurs drop constraint if exists check_theme_taille;
alter table vendeurs add constraint check_theme_taille
  check (theme is null or pg_column_size(theme) < 20000);


-- 2. Le vendeur peut changer lui-même de template (« point de départ »),
--    uniquement via la fonction ci-dessous et parmi une liste autorisée.
--    Le trigger de protection laisse passer CE changement-là seulement.
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
  or new.origine                     is distinct from old.origine
  or new.logo_debloque               is distinct from old.logo_debloque
  or new.recherche_debloquee         is distinct from old.recherche_debloquee
  or new.masquer_commentaire_produit is distinct from old.masquer_commentaire_produit then
    raise exception 'Champ réservé : ce réglage ne peut pas être modifié depuis la boutique.';
  end if;

  return new;
end;
$$;

create or replace function changer_template(p_template text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_type text;
  v_actuel text;
  v_nouveau text := coalesce(lower(trim(p_template)), '');
begin
  select v.id, v.type_activite, coalesce(v.template, '')
    into v_id, v_type, v_actuel
  from admins a join vendeurs v on v.id = a.vendeur_id
  where a.auth_user_id = auth.uid()
  limit 1;

  if v_id is null then
    raise exception 'Aucune boutique liée à ce compte.';
  end if;

  if v_actuel = 'hybride' then
    raise exception 'Le template hybride se modifie avec l''équipe CMD.';
  end if;

  if (v_type = 'prestation' and v_nouveau not in ('minimal', 'editorial'))
  or (coalesce(v_type, 'produit') <> 'prestation'
      and v_nouveau not in ('', 'urbain', 'marche', 'doux', 'restaurant', 'sport', 'import')) then
    raise exception 'Ce point de départ n''est pas disponible pour ton activité.';
  end if;

  perform set_config('cmd.changement_template', '1', true);
  update vendeurs set template = v_nouveau where id = v_id;
  perform set_config('cmd.changement_template', '', true);

  return v_nouveau;
end;
$$;

revoke execute on function changer_template(text) from public, anon;
grant execute on function changer_template(text) to authenticated;


-- 3. Si ta contrainte de templates ne connaît pas encore sport / import /
--    hybride, on la complète. Les nouvelles valeurs sont contrôlées ;
--    les boutiques existantes ne sont pas revérifiées.
alter table vendeurs drop constraint if exists check_template_valide;
alter table vendeurs add constraint check_template_valide
  check (template is null or template in
    ('', 'urbain', 'marche', 'doux', 'minimal', 'editorial', 'restaurant', 'sport', 'import', 'hybride'))
  not valid; -- « not valid » : ne revérifie pas les boutiques existantes, donc ne peut pas échouer

-- >>>>>>>>>> migrations/phase5-paiements.sql
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

-- >>>>>>>>>> migrations/phase6-monetisation-visites.sql
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

-- >>>>>>>>>> migrations/phase7a-correctifs-rendez-vous.sql
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

-- >>>>>>>>>> migrations/phase7b-pack-prestataires.sql
-- ============================================================
-- PHASE 7B — Pack prestataires + 2 failles corrigées
--  A. Vérification des créneaux CÔTÉ BASE (elle n'existait pas : deux
--     clients pouvaient réserver le même créneau)
--  B. Stock : seul le vendeur peut décrémenter le stock de SES produits
--     (avant : n'importe qui pouvait vider le stock de n'importe quelle boutique)
--  C. Confirmation automatique (option), acompte pour tous (option),
--     statut « confirmé », lien « Mon rendez-vous » (voir / annuler),
--     suivi des rappels de la veille.
-- Prérequis : phases 1 à 7A. Rejouable sans erreur.
-- ============================================================


-- ============ A. VÉRIFICATION DES CRÉNEAUX ============
create or replace function verifier_disponibilite_rdv()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v vendeurs%rowtype;
  v_debut integer;
  v_fin integer;
  v_capacite integer;
  v_conflits integer;
begin
  -- Le prestataire qui ajoute un RDV à la main peut faire ce qu'il veut
  if auth.uid() is not null and exists (
       select 1 from admins where auth_user_id = auth.uid() and vendeur_id = new.vendeur_id) then
    return new;
  end if;

  if new.date is null or new.heure is null then
    raise exception 'Choisis une date et un créneau.';
  end if;

  select * into v from vendeurs where id = new.vendeur_id;
  if v.id is null then
    raise exception 'Boutique introuvable.';
  end if;

  if new.date < current_date then
    raise exception 'Ce créneau n''est plus disponible.';
  end if;

  -- Jour fermé (récurrent ou bloqué)
  if extract(dow from new.date)::integer = any (coalesce(v.jours_fermeture_recurrents, '{}'))
     or exists (select 1 from jours_bloques where vendeur_id = new.vendeur_id and date = new.date) then
    raise exception 'Ce jour n''est pas disponible.';
  end if;

  v_debut := extract(hour from new.heure)::integer * 60 + extract(minute from new.heure)::integer;
  v_fin := v_debut + coalesce(new.duree_minutes, 30);

  -- Horaires d'ouverture
  if v.heure_ouverture is not null and v.heure_fermeture is not null and (
       new.heure < v.heure_ouverture
       or v_fin > extract(hour from v.heure_fermeture)::integer * 60 + extract(minute from v.heure_fermeture)::integer) then
    raise exception 'Ce créneau est en dehors des horaires d''ouverture.';
  end if;

  -- Créneau bloqué par le prestataire
  if exists (
    select 1 from blocages_horaires b
    where b.vendeur_id = new.vendeur_id and b.date = new.date
      and (b.personnel_id is null or new.personnel_id is null or b.personnel_id = new.personnel_id)
      and new.heure < b.heure_fin
      and (new.heure + make_interval(mins => coalesce(new.duree_minutes, 30))) > b.heure_debut
  ) then
    raise exception 'Ce créneau n''est plus disponible.';
  end if;

  -- RDV qui se chevauchent (même règle que la page de réservation),
  -- en tenant compte de la capacité simultanée de la prestation
  select coalesce(capacite_simultanee, 1) into v_capacite from prestations where id = new.prestation_id;
  v_capacite := greatest(coalesce(v_capacite, 1), 1);

  select count(*) into v_conflits
  from rendez_vous r
  where r.vendeur_id = new.vendeur_id
    and r.date = new.date
    and coalesce(r.statut, 'en_attente') <> 'annule'
    and (new.groupe_reservation is null or r.groupe_reservation is distinct from new.groupe_reservation)
    and (r.personnel_id is null or new.personnel_id is null or r.personnel_id = new.personnel_id)
    and r.heure < (new.heure + make_interval(mins => coalesce(new.duree_minutes, 30)))
    and (r.heure + make_interval(mins => coalesce(r.duree_minutes, 30))) > new.heure;

  if v_conflits >= v_capacite then
    raise exception 'Ce créneau vient d''être pris. Choisis un autre horaire.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_verifier_disponibilite_rdv on rendez_vous;
create trigger trg_verifier_disponibilite_rdv before insert on rendez_vous
  for each row execute function verifier_disponibilite_rdv();


-- ============ B. STOCK ============
create or replace function decrementer_stock(p_produit_id uuid, p_quantite integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_quantite is null or p_quantite <= 0 or p_quantite > 1000 then
    return;
  end if;
  update produits
  set quantite_stock = greatest(quantite_stock - p_quantite, 0)
  where id = p_produit_id
    and quantite_stock is not null
    and vendeur_id in (select vendeur_id from admins where auth_user_id = auth.uid());
end;
$$;
revoke execute on function decrementer_stock(uuid, integer) from public, anon;
grant execute on function decrementer_stock(uuid, integer) to authenticated;


-- ============ C. PACK PRESTATAIRES ============
-- Réglages du prestataire
alter table vendeurs add column if not exists rdv_confirmation_auto boolean not null default false;
alter table vendeurs add column if not exists acompte_actif boolean not null default false;
alter table vendeurs add column if not exists acompte_message text;
alter table vendeurs add column if not exists rdv_annulation_heures integer not null default 12;

-- La boutique « Lees » avait son message d'acompte codé en dur : on le garde
update vendeurs
set acompte_actif = true,
    acompte_message = coalesce(acompte_message, 'Veuillez m''envoyer le lien de validation Wave pour réserver le créneau.')
where slug = 'Lees' and acompte_actif = false;

-- Suivi des rappels envoyés la veille
alter table rendez_vous add column if not exists rappel_envoye boolean not null default false;

-- Confirmation automatique : un RDV pris en ligne passe directement en
-- « confirme » si le prestataire l'a activée (le créneau a déjà été vérifié)
create or replace function confirmer_rdv_automatiquement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.statut, 'en_attente') = 'en_attente'
     and exists (select 1 from vendeurs where id = new.vendeur_id and rdv_confirmation_auto = true) then
    new.statut := 'confirme';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_zz_confirmation_auto on rendez_vous;
create trigger trg_zz_confirmation_auto before insert on rendez_vous
  for each row execute function confirmer_rdv_automatiquement();

-- « Mon rendez-vous » : le client retrouve sa réservation avec le lien
-- secret reçu (identifiant de groupe, aléatoire et impossible à deviner).
create or replace function mon_rendez_vous(p_groupe uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'boutique', json_build_object(
      'nom', v.nom_boutique, 'slug', v.slug, 'numero_whatsapp', v.numero_whatsapp,
      'adresse', v.adresse, 'logo_url', v.logo_url, 'couleur_accent', v.couleur_accent,
      'template', v.template, 'annulation_heures', v.rdv_annulation_heures,
      'acompte_actif', v.acompte_actif, 'acompte_message', v.acompte_message,
      'wave_numero', v.wave_numero, 'om_numero', v.om_numero),
    'nom_client', min(r.nom_client),
    'lieu', min(r.lieu),
    'adresse_client', min(r.adresse_client),
    'statut', case
      when bool_and(r.statut = 'annule') then 'annule'
      when bool_and(r.statut = 'paye') then 'paye'
      when bool_or(r.statut = 'confirme') or bool_or(r.statut = 'paye') then 'confirme'
      else 'en_attente' end,
    'services', json_agg(json_build_object(
      'nom', p.nom, 'date', r.date, 'heure', r.heure, 'duree_minutes', r.duree_minutes,
      'avec', pe.nom, 'prix', p.prix, 'prix_variable', p.prix_variable) order by r.date, r.heure)
  )
  from rendez_vous r
  join vendeurs v on v.id = r.vendeur_id
  left join prestations p on p.id = r.prestation_id
  left join personnel pe on pe.id = r.personnel_id
  where r.groupe_reservation = p_groupe
  group by v.id;
$$;
grant execute on function mon_rendez_vous(uuid) to anon, authenticated;

create or replace function annuler_mon_rendez_vous(p_groupe uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_debut timestamp;
  v_delai integer;
begin
  select min(r.date + r.heure), max(v.rdv_annulation_heures)
    into v_debut, v_delai
  from rendez_vous r join vendeurs v on v.id = r.vendeur_id
  where r.groupe_reservation = p_groupe and coalesce(r.statut, 'en_attente') <> 'annule';

  if v_debut is null then
    raise exception 'Rendez-vous introuvable ou déjà annulé.';
  end if;
  -- Heure du Sénégal (UTC) ; délai fixé par le prestataire
  if v_debut < (now() at time zone 'UTC') + make_interval(hours => coalesce(v_delai, 12)) then
    raise exception 'Il est trop tard pour annuler en ligne. Contacte directement le prestataire.';
  end if;

  update rendez_vous set statut = 'annule' where groupe_reservation = p_groupe;
  return 'annule';
end;
$$;
grant execute on function annuler_mon_rendez_vous(uuid) to anon, authenticated;


-- ============ D. Adresses réservées : nouvelles pages du site ============
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
       'rdv', 'apparence', 'abonnement', 'super', 'voirpanier'
     );
$$;

-- >>>>>>>>>> migrations/phase8a-commandes.sql
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

-- >>>>>>>>>> migrations/phase8b-options-produits.sql
-- ============================================================
-- PHASE 8B — Options des produits (taille, couleur, pointure, suppléments)
-- Chaque produit peut avoir des groupes d'options, ex. :
--   [{"nom":"Taille","obligatoire":true,"multiple":false,
--     "choix":[{"nom":"M","prix":0,"disponible":true},{"nom":"XL","prix":1000,"disponible":true}]}]
-- « prix » = supplément ajouté au prix du produit (0 = même prix).
-- La base vérifie les options et recalcule le prix de chaque ligne.
-- Prérequis : phase 8A. Rejouable. Les produits sans options ne changent pas.
-- ============================================================

alter table produits add column if not exists options jsonb;
alter table produits drop constraint if exists check_options_taille;
alter table produits add constraint check_options_taille
  check (options is null or (jsonb_typeof(options) = 'array' and pg_column_size(options) < 20000));

create or replace function normaliser_commande()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ligne jsonb;
  v_o jsonb;
  v_g jsonb;
  v_c jsonb;
  v_opts jsonb;
  v_contenu jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_unit integer;
  v_q integer;
  p produits%rowtype;
  v_formule text;
  v_pct integer;
begin
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

    -- Options choisies : chacune doit exister et être disponible
    v_unit := p.prix;
    v_opts := '[]'::jsonb;
    if jsonb_typeof(v_ligne->'options') = 'array' then
      if jsonb_array_length(v_ligne->'options') > 20 then
        raise exception 'Trop d''options.';
      end if;
      for v_o in select value from jsonb_array_elements(v_ligne->'options') loop
        select g.value into v_g from jsonb_array_elements(coalesce(p.options, '[]'::jsonb)) g
        where g.value->>'nom' = v_o->>'groupe' limit 1;
        if v_g is null then
          raise exception 'Une option de « % » n''existe plus. Rechargez la page.', p.nom;
        end if;
        select c.value into v_c from jsonb_array_elements(coalesce(v_g->'choix', '[]'::jsonb)) c
        where c.value->>'nom' = v_o->>'choix' limit 1;
        if v_c is null or coalesce((v_c->>'disponible')::boolean, true) = false then
          raise exception '« % » n''est plus disponible pour « % ».', v_o->>'choix', p.nom;
        end if;
        v_unit := v_unit + coalesce(nullif(v_c->>'prix', '')::integer, 0);
        v_opts := v_opts || jsonb_build_object('groupe', v_g->>'nom', 'choix', v_c->>'nom',
                                                'prix', coalesce(nullif(v_c->>'prix', '')::integer, 0));
      end loop;
    end if;

    -- Options obligatoires présentes, une seule si choix unique
    for v_g in select value from jsonb_array_elements(coalesce(p.options, '[]'::jsonb)) loop
      if coalesce((v_g->>'obligatoire')::boolean, false)
         and not exists (select 1 from jsonb_array_elements(v_opts) o where o.value->>'groupe' = v_g->>'nom') then
        raise exception 'Choisis « % » pour « % ».', v_g->>'nom', p.nom;
      end if;
      if not coalesce((v_g->>'multiple')::boolean, false)
         and (select count(*) from jsonb_array_elements(v_opts) o where o.value->>'groupe' = v_g->>'nom') > 1 then
        raise exception 'Un seul choix possible pour « % ».', v_g->>'nom';
      end if;
    end loop;

    v_unit := greatest(v_unit, 0);
    v_total := v_total + v_unit * v_q;
    v_contenu := v_contenu || jsonb_build_object(
      'produit_id', p.id,
      'produit', p.nom,
      'reference', p.reference,
      'quantite', v_q,
      'prix', v_unit,
      'options', v_opts,
      'commentaire', left(coalesce(v_ligne->>'commentaire', ''), 300)
    );
  end loop;

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

  new.nom_client := left(new.nom_client, 80);
  new.prenom_client := left(new.prenom_client, 80);
  new.numero_client := left(new.numero_client, 30);
  new.adresse := left(new.adresse, 300);
  new.heure_recuperation := left(new.heure_recuperation, 20);
  new.mode_paiement := left(new.mode_paiement, 30);
  new.recu_url := null;
  new.preuve_chemin := null;

  update vendeurs set compteur_commandes = compteur_commandes + 1
  where id = new.vendeur_id
  returning compteur_commandes into new.numero;

  return new;
end;
$$;
