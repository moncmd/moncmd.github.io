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
