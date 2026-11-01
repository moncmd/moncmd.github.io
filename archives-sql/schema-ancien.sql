-- ============================================
-- CMD. — Schéma de base de données Supabase
-- ============================================

create table vendeurs (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  nom_boutique text not null,
  numero_whatsapp text not null,
  couleur_accent text default '#e56400',
  logo_url text,
  wave_numero text,
  om_numero text,
  actif boolean default true,
  date_creation timestamp default now()
);

create table produits (
  id uuid primary key default gen_random_uuid(),
  vendeur_id uuid references vendeurs(id) on delete cascade,
  nom text not null,
  prix integer not null,
  image_url text,
  categorie text default 'general',
  description text,
  favori boolean default false,           -- mis en avant par le vendeur (produit populaire)
  actif boolean default true,
  date_creation timestamp default now()
);

create table commandes (
  id uuid primary key default gen_random_uuid(),
  vendeur_id uuid references vendeurs(id) on delete cascade,
  nom_client text,
  prenom_client text,
  numero_client text,
  adresse text,
  heure_recuperation text,
  mode_paiement text,
  contenu jsonb not null,
  total integer not null,
  statut text default 'nouvelle',
  date_creation timestamp default now()
);

create table admins (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique not null,
  vendeur_id uuid references vendeurs(id) on delete cascade
);

alter table vendeurs enable row level security;
alter table produits enable row level security;
alter table commandes enable row level security;
alter table admins enable row level security;

create policy "Lecture publique vendeurs actifs" on vendeurs
  for select using (actif = true);

create policy "Vendeur modifie ses propres informations" on vendeurs
  for update using (
    id in (select vendeur_id from admins where auth_user_id = auth.uid())
  );

create policy "Lecture publique produits actifs" on produits
  for select using (actif = true);

create policy "Creation publique commandes" on commandes
  for insert with check (true);

create policy "Admin lit sa propre ligne" on admins
  for select using (auth_user_id = auth.uid());

create policy "Vendeur voit ses commandes" on commandes
  for select using (
    vendeur_id in (select vendeur_id from admins where auth_user_id = auth.uid())
  );

create policy "Vendeur gere ses produits" on produits
  for all using (
    vendeur_id in (select vendeur_id from admins where auth_user_id = auth.uid())
  );

insert into vendeurs (slug, nom_boutique, numero_whatsapp, wave_numero, om_numero)
values ('demo', 'CMD Démo', '221784218267', '784218267', '775683106');

-- ============================================
-- MIGRATION : si tu as déjà exécuté ce script une première fois,
-- exécute seulement la ligne suivante pour ajouter le champ favori
-- (sans rien recréer, sans perdre tes données existantes)
-- ============================================
-- alter table produits add column if not exists favori boolean default false;
--
-- create policy "Vendeur modifie ses propres informations" on vendeurs
--   for update using (
--     id in (select vendeur_id from admins where auth_user_id = auth.uid())
--   );

-- ============================================
-- MIGRATION : formule vendeur (standard/premium), stock produit,
-- liste d'attente de réassort — à exécuter dans Supabase SQL Editor
-- ============================================
alter table vendeurs add column if not exists formule text default 'standard';
alter table produits add column if not exists quantite_stock integer;

create table if not exists liste_attente_stock (
  id uuid primary key default gen_random_uuid(),
  vendeur_id uuid references vendeurs(id) on delete cascade,
  produit_id uuid references produits(id) on delete cascade,
  nom_client text,
  numero_client text not null,
  contacte boolean default false,
  date_creation timestamp default now()
);

alter table liste_attente_stock enable row level security;

create policy "Creation publique liste attente" on liste_attente_stock
  for insert with check (true);

create policy "Vendeur voit sa liste attente" on liste_attente_stock
  for select using (
    vendeur_id in (select vendeur_id from admins where auth_user_id = auth.uid())
  );

create policy "Vendeur met a jour sa liste attente" on liste_attente_stock
  for update using (
    vendeur_id in (select vendeur_id from admins where auth_user_id = auth.uid())
  );

-- ============================================
-- MIGRATION : décompte automatique du stock à la commande
-- (fonction sécurisée, exécutée même pour un client non connecté)
-- ============================================
create or replace function decrementer_stock(p_produit_id uuid, p_quantite integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update produits
  set quantite_stock = greatest(quantite_stock - p_quantite, 0)
  where id = p_produit_id and quantite_stock is not null;
end;
$$;

grant execute on function decrementer_stock(uuid, integer) to anon, authenticated;

-- ============================================
-- MIGRATION : passage à 3 formules (standard/pro/premium) + dépenses
-- ============================================
-- La colonne "formule" existe déjà (texte libre) : elle accepte maintenant
-- 'standard', 'pro' ou 'premium'. Pas de contrainte stricte pour rester souple.

create table if not exists depenses (
  id uuid primary key default gen_random_uuid(),
  vendeur_id uuid references vendeurs(id) on delete cascade,
  montant integer not null,
  note text,
  date_creation timestamp default now()
);

alter table depenses enable row level security;

create policy "Vendeur gere ses depenses" on depenses
  for all using (
    vendeur_id in (select vendeur_id from admins where auth_user_id = auth.uid())
  );

-- ============================================
-- MIGRATION : template visuel du vendeur (urbain / doux / marche / vide pour standard)
-- ============================================
alter table vendeurs add column if not exists template text default '';

-- ============================================
-- MIGRATION : reçu PDF sauvegardé (Premium) — accessible au vendeur
-- ============================================
alter table commandes add column if not exists recu_url text;

-- Après avoir créé le bucket "recus" (Storage → New bucket → Public), lancer :
create policy "Upload public des recus"
on storage.objects for insert
with check (bucket_id = 'recus');

create policy "Lecture publique des recus"
on storage.objects for select
using (bucket_id = 'recus');
