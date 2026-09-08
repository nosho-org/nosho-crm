-- Ajouter les categories "Mutualiste" et "Association" (NOS-1400).
--
-- Simon, le 08/09/2026 : "ajoute mutualiste dans les categories", puis
-- "ajoute Association aussi".
--
-- Toutes deux placees apres "Institution", dont elles se distinguent : une
-- mutuelle achete pour ses adherents, une association pour ses beneficiaires,
-- ni l'une ni l'autre pour un etablissement de soins. Deux cas attendaient
-- deja en "Autre" -- Malakoff Humanis, et les associations L'Espoir et ANRAS.
--
-- Le tableau est reconstruit plutot que reecrit en dur, pour qu'une categorie
-- ajoutee a la main entre-temps ne disparaisse pas au passage. Chaque insertion
-- est gardee par un `not exists` : la migration se rejoue sans creer de
-- doublon.

-- 1. "Mutualiste", juste apres "Institution".
with remplacement as (
  select etape.rang_element, x.rang_interne, x.valeur
  from public.configuration c,
       jsonb_array_elements(c.config -> 'dealCategories')
         with ordinality as etape(element, rang_element)
       cross join lateral (
         select 1 as rang_interne, etape.element as valeur
         union all
         select 2, jsonb_build_object('value', 'mutualiste', 'label', 'Mutualiste')
         where etape.element ->> 'value' = 'institution'
       ) x
)
update public.configuration
set config = jsonb_set(
  config,
  '{dealCategories}',
  (select jsonb_agg(valeur order by rang_element, rang_interne) from remplacement)
)
where not exists (
  select 1 from jsonb_array_elements(config -> 'dealCategories') as cat
  where cat ->> 'value' = 'mutualiste'
);

-- 2. "Association", a la suite de "Mutualiste".
with remplacement as (
  select etape.rang_element, x.rang_interne, x.valeur
  from public.configuration c,
       jsonb_array_elements(c.config -> 'dealCategories')
         with ordinality as etape(element, rang_element)
       cross join lateral (
         select 1 as rang_interne, etape.element as valeur
         union all
         select 2, jsonb_build_object('value', 'association', 'label', 'Association')
         where etape.element ->> 'value' = 'mutualiste'
       ) x
)
update public.configuration
set config = jsonb_set(
  config,
  '{dealCategories}',
  (select jsonb_agg(valeur order by rang_element, rang_interne) from remplacement)
)
where not exists (
  select 1 from jsonb_array_elements(config -> 'dealCategories') as cat
  where cat ->> 'value' = 'association'
);

-- 3. Trier la liste par ordre alphabetique (NOS-1400).
--
-- Simon : "et classe les par ordre alphabetique". Elle etait rangee par
-- familles -- structures de soins, puis non soignantes -- un ordre qui se
-- defendait tant qu'il y avait huit entrees. A seize, plus personne ne
-- retient la famille d'une categorie : on la cherche par son nom.
--
-- Le tri passe par `immutable_unaccent`, deja utilise par les vues de
-- recherche : sans lui, "Editeur" se rangerait apres "Esthetique" parce que le
-- E accentu'e a un code plus eleve que le s. Les accents ne doivent pas
-- decider de l'ordre d'une liste qu'un humain parcourt.
update public.configuration
set config = jsonb_set(
  config,
  '{dealCategories}',
  (
    select jsonb_agg(cat order by lower(immutable_unaccent(cat ->> 'label')))
    from jsonb_array_elements(config -> 'dealCategories') as cat
  )
);

do $$
declare
  v_menu jsonb;
  v_attendu text;
  v_labels text[];
begin
  select config -> 'dealCategories' into v_menu from public.configuration limit 1;

  foreach v_attendu in array array['mutualiste', 'association'] loop
    if not (v_menu @> jsonb_build_array(jsonb_build_object('value', v_attendu))) then
      raise exception 'Categorie manquante dans le menu : %', v_attendu;
    end if;
  end loop;

  -- Le tri doit tenir : comparer la liste a elle-meme, retriee.
  select array_agg(lower(immutable_unaccent(cat ->> 'label')))
    into v_labels
    from jsonb_array_elements(v_menu) as cat;
  if v_labels is distinct from (select array_agg(x order by x) from unnest(v_labels) as x) then
    raise exception 'Les categories ne sont pas dans l''ordre alphabetique : %', v_labels;
  end if;
end $$;
