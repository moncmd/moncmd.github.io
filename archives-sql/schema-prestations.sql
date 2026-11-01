-- ============================================
-- MIGRATION : branche "prestations de service" (coiffure/beauté)
-- À exécuter dans Supabase → SQL Editor
-- ============================================

-- Distingue les vendeurs "produits" des prestataires de service.
-- Ne casse rien pour les vendeurs existants (défaut = 'produit').
alter table vendeurs add column if not exists type_activite text default 'produit';

-- ============================================
-- PRESTATIONS (équivalent de "produits" pour les prestataires)
-- ============================================
create table if not exists prestations (
  id uuid primary key default gen_random_uuid(),
  vendeur_id uuid references vendeurs(id) on delete cascade,
  nom text not null,
  prix integer not null,
  duree_minutes integer not null default 30,   -- durée réelle, sert à calculer les créneaux dispo
  image_url text,
  description text,
  favori boolean default false,
  actif boolean default true,
  date_creation timestamp default now()
);

alter table prestations enable row level security;

create policy "Lecture publique prestations actives" on prestations
  for select using (actif = true);

create policy "Vendeur gere ses prestations" on prestations
  for all using (
    vendeur_id in (select vendeur_id from admins where auth_user_id = auth.uid())
  );

-- ============================================
-- PERSONNEL (membres de l'équipe, affichage/sélection côté client uniquement —
-- pas de login séparé, gérés depuis l'admin du vendeur principal)
-- ============================================
create table if not exists personnel (
  id uuid primary key default gen_random_uuid(),
  vendeur_id uuid references vendeurs(id) on delete cascade,
  nom text not null,
  photo_url text,
  actif boolean default true,
  date_creation timestamp default now()
);

-- Table de liaison : quelles prestations chaque personne propose
create table if not exists personnel_prestations (
  personnel_id uuid references personnel(id) on delete cascade,
  prestation_id uuid references prestations(id) on delete cascade,
  primary key (personnel_id, prestation_id)
);

alter table personnel enable row level security;
alter table personnel_prestations enable row level security;

create policy "Lecture publique personnel actif" on personnel
  for select using (actif = true);

create policy "Vendeur gere son personnel" on personnel
  for all using (
    vendeur_id in (select vendeur_id from admins where auth_user_id = auth.uid())
  );

create policy "Lecture publique personnel_prestations" on personnel_prestations
  for select using (true);

create policy "Vendeur gere les liaisons personnel/prestations" on personnel_prestations
  for all using (
    personnel_id in (
      select id from personnel where vendeur_id in (
        select vendeur_id from admins where auth_user_id = auth.uid()
      )
    )
  );

-- ============================================
-- DISPONIBILITÉS : jours bloqués manuellement + réglages
-- ============================================
alter table vendeurs add column if not exists rdv_max_par_jour integer default 8;
alter table vendeurs add column if not exists jours_fermeture_recurrents integer[] default '{0}'; -- 0=dimanche ... 6=samedi

create table if not exists jours_bloques (
  id uuid primary key default gen_random_uuid(),
  vendeur_id uuid references vendeurs(id) on delete cascade,
  date date not null,
  date_creation timestamp default now()
);

alter table jours_bloques enable row level security;

create policy "Lecture publique jours bloques" on jours_bloques
  for select using (true);

create policy "Vendeur gere ses jours bloques" on jours_bloques
  for all using (
    vendeur_id in (select vendeur_id from admins where auth_user_id = auth.uid())
  );

-- ============================================
-- BLOCAGE HORAIRE PRÉCIS (ex: bloquer 14h-15h30 un jour donné)
-- ============================================
create table if not exists blocages_horaires (
  id uuid primary key default gen_random_uuid(),
  vendeur_id uuid references vendeurs(id) on delete cascade,
  personnel_id uuid references personnel(id) on delete cascade, -- null = concerne toute l'équipe
  date date not null,
  heure_debut time not null,
  heure_fin time not null,
  date_creation timestamp default now()
);

alter table blocages_horaires enable row level security;

create policy "Lecture publique blocages horaires" on blocages_horaires
  for select using (true);

create policy "Vendeur gere ses blocages horaires" on blocages_horaires
  for all using (
    vendeur_id in (select vendeur_id from admins where auth_user_id = auth.uid())
  );

-- ============================================
-- GALERIE (photos de réalisations, sans catégorisation)
-- ============================================
create table if not exists galerie (
  id uuid primary key default gen_random_uuid(),
  vendeur_id uuid references vendeurs(id) on delete cascade,
  image_url text not null,
  ordre integer default 0,
  date_creation timestamp default now()
);

alter table galerie enable row level security;

create policy "Lecture publique galerie" on galerie
  for select using (true);

create policy "Vendeur gere sa galerie" on galerie
  for all using (
    vendeur_id in (select vendeur_id from admins where auth_user_id = auth.uid())
  );

-- ============================================
-- DEMANDES DE RENDEZ-VOUS (journal simple — la confirmation finale
-- se fait sur WhatsApp, donc pas de statut complexe à gérer ici)
-- ============================================
create table if not exists rendez_vous (
  id uuid primary key default gen_random_uuid(),
  vendeur_id uuid references vendeurs(id) on delete cascade,
  prestation_id uuid references prestations(id),
  personnel_id uuid references personnel(id), -- null = "n'importe qui"
  nom_client text,
  numero_client text,
  date date not null,
  heure time,
  date_creation timestamp default now()
);

alter table rendez_vous enable row level security;

create policy "Creation publique rendez_vous" on rendez_vous
  for insert with check (true);

create policy "Vendeur voit ses rendez_vous" on rendez_vous
  for select using (
    vendeur_id in (select vendeur_id from admins where auth_user_id = auth.uid())
  );

-- ============================================
-- Storage : buckets "prestations-images" et "personnel-images"
-- (créer ces 2 buckets en Public dans Storage AVANT de lancer ceci)
-- ============================================
create policy "Upload public prestations-images"
on storage.objects for insert
with check (bucket_id = 'prestations-images');

create policy "Lecture publique prestations-images"
on storage.objects for select
using (bucket_id = 'prestations-images');

create policy "Upload public personnel-images"
on storage.objects for insert
with check (bucket_id = 'personnel-images');

create policy "Lecture publique personnel-images"
on storage.objects for select
using (bucket_id = 'personnel-images');

-- ============================================
-- Storage : bucket "galerie" pour les photos de réalisations
-- (créer le bucket "galerie" en Public dans Storage AVANT de lancer ceci)
-- ============================================
create policy "Upload public galerie"
on storage.objects for insert
with check (bucket_id = 'galerie');

create policy "Lecture publique galerie storage"
on storage.objects for select
using (bucket_id = 'galerie');
