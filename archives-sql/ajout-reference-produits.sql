-- ============================================
-- AJOUT : numéro de référence par produit (#1, #2, #3...), propre à chaque boutique
-- Permet de distinguer deux produits au même nom dans le message WhatsApp.
-- Le numéro n'est jamais réutilisé, même si un produit est supprimé.
-- A coller dans Supabase > SQL Editor > Run
-- ============================================
alter table produits add column if not exists reference integer;
alter table vendeurs add column if not exists compteur_produits integer default 0;

-- Numérote les produits existants (par boutique, du plus ancien au plus récent)
with n as (
  select id, row_number() over (partition by vendeur_id order by date_creation, id) as rn
  from produits
  where reference is null
)
update produits p set reference = n.rn from n where p.id = n.id;

-- Le compteur de chaque boutique repart du plus grand numéro existant
update vendeurs v
set compteur_produits = coalesce((select max(reference) from produits p where p.vendeur_id = v.id), 0);

-- Numéro attribué automatiquement à chaque nouveau produit
create or replace function attribuer_reference_produit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.reference is null then
    update vendeurs
    set compteur_produits = coalesce(compteur_produits, 0) + 1
    where id = new.vendeur_id
    returning compteur_produits into new.reference;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reference_produit on produits;
create trigger trg_reference_produit
  before insert on produits
  for each row execute function attribuer_reference_produit();
