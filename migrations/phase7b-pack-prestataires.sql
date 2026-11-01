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
