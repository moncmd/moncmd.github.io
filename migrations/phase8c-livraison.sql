-- ============================================================
-- PHASE 8C — Livraison, version simple
-- Le vendeur répond à UNE question dans ses Réglages :
--   « apres »    : frais annoncés après la commande (par défaut = comme avant)
--   « gratuite » : livraison offerte
--   « fixe »     : un prix fixe ajouté au total
-- + une case « Le client peut venir récupérer sa commande ».
-- Prérequis : phases 8A et 8B. Rejouable. Rien ne change pour les vendeurs
-- actuels tant qu'ils ne modifient pas ce réglage.
-- ============================================================

alter table vendeurs add column if not exists livraison_mode text not null default 'apres';
alter table vendeurs add column if not exists livraison_prix integer not null default 0;
alter table vendeurs add column if not exists retrait_possible boolean not null default false;
alter table vendeurs drop constraint if exists check_livraison_mode;
alter table vendeurs add constraint check_livraison_mode
  check (livraison_mode in ('apres', 'gratuite', 'fixe') and livraison_prix between 0 and 1000000);

alter table commandes add column if not exists mode_reception text not null default 'livraison';
alter table commandes add column if not exists frais_livraison integer not null default 0;

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
  v_mode text;
  v_prix_liv integer;
  v_retrait boolean;
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

  -- Livraison : selon le réglage du vendeur (frais recalculés ici)
  select coalesce(livraison_mode, 'apres'), coalesce(livraison_prix, 0), coalesce(retrait_possible, false)
    into v_mode, v_prix_liv, v_retrait
  from vendeurs where id = new.vendeur_id;
  if new.mode_reception = 'retrait' and v_retrait then
    new.mode_reception := 'retrait';
    new.frais_livraison := 0;
  else
    new.mode_reception := 'livraison';
    new.frais_livraison := case when v_mode = 'fixe' then greatest(v_prix_liv, 0) else 0 end;
  end if;

  new.contenu := v_contenu;
  new.total := v_total - new.reduction + new.frais_livraison;

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
    date_livraison, heure_recuperation, mode_paiement, code_promo, contenu, total, mode_reception
  ) values (
    (p->>'vendeur_id')::uuid, p->>'nom_client', p->>'prenom_client', p->>'numero_client', p->>'adresse',
    nullif(p->>'date_livraison', '')::date, p->>'heure_recuperation', p->>'mode_paiement', p->>'code_promo',
    p->'contenu', 0, coalesce(p->>'mode_reception', 'livraison')
  )
  returning * into c;

  return json_build_object('id', c.id, 'numero', c.numero, 'total', c.total, 'reduction', c.reduction,
                           'code_promo', c.code_promo, 'contenu', c.contenu,
                           'frais_livraison', c.frais_livraison, 'mode_reception', c.mode_reception);
end;
$$;
grant execute on function passer_commande(jsonb) to anon, authenticated;

-- Suivi : affiche aussi la livraison
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
    'mode_reception', c.mode_reception, 'frais_livraison', c.frais_livraison,
    'livraison_mode', v.livraison_mode,
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
