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
