-- ============================================================
-- PHASE 9 — Devise par boutique + style « Épuré » par défaut
--  - vendeurs.devise : FCFA (par défaut), €, $, $ CAD, £, MAD, TND, GNF
--    Affichage uniquement (aucune conversion). Les prix restent des nombres
--    entiers : 25 €, 40 $…
--  - Les nouveaux inscrits « produits » démarrent sur le style Épuré
--    (fond blanc, beaucoup d'espace) avec une devise devinée d'après
--    l'indicatif de leur numéro.
-- Prérequis : phases 1 à 8C. Rejouable. Rien ne change pour les boutiques
-- existantes (elles restent en FCFA, avec leur apparence actuelle).
-- ============================================================

alter table vendeurs add column if not exists devise text not null default 'FCFA';
alter table vendeurs drop constraint if exists check_devise;
alter table vendeurs add constraint check_devise
  check (devise in ('FCFA', '€', '$', '$ CAD', '£', 'MAD', 'TND', 'GNF'));

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
  v_devise text := 'FCFA';
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

  -- Devise proposée d'après l'indicatif (modifiable ensuite dans Réglages)
  v_devise := case
    when v_tel ~ '^(33|32|41|39|34|49|351)' then '€'
    when v_tel ~ '^44' then '£'
    when v_tel ~ '^1' then '$'
    when v_tel ~ '^212' then 'MAD'
    when v_tel ~ '^216' then 'TND'
    when v_tel ~ '^224' then 'GNF'
    else 'FCFA' end;

  begin
    insert into vendeurs (
      slug, nom_boutique, numero_whatsapp, type_activite,
      template, formule, essai_fin, origine, actif, devise, theme
    ) values (
      v_slug, v_nom, v_tel, v_type,
      case when v_type = 'prestation' then 'minimal' else '' end,
      case when v_type = 'prestation' then 'pro' else 'premium' end,
      now() + interval '14 days', 'inscription', true, v_devise,
      case when v_type = 'prestation' then null else '{"style": "epure", "whatsapp": true}'::jsonb end
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
      'wave_numero', v.wave_numero, 'om_numero', v.om_numero, 'devise', v.devise),
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
      'logo_url', v.logo_url, 'adresse', v.adresse, 'devise', v.devise,
      'wave_numero', case when coalesce(v.accepte_wave, true) then v.wave_numero end,
      'om_numero', case when coalesce(v.accepte_om, true) then v.om_numero end)
  )
  from commandes c join vendeurs v on v.id = c.vendeur_id
  where c.id = p_id;
$$;
grant execute on function ma_commande(uuid) to anon, authenticated;
