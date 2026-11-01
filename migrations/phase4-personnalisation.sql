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
