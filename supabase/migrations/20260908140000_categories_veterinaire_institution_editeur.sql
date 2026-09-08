-- Ajouter Clinique veterinaire, Institution, Editeur / plateforme, et rendre
-- "Autre" au menu (NOS-1398, second passage).
--
-- Simon, le 08/09/2026 : "ajoute donc clinique veterinaire, institution,
-- editeurs plateforme et garde autres alors".
--
-- ## Ce que ce passage corrige
--
-- La migration du matin avait retire "Autre" du menu. Les 15 opportunites qui
-- la portaient ont ete listees a Simon : quatre cliniques veterinaires, la
-- Croix Rouge, l'Ordre des Medecins, l'Institut Curie, Qare, Cpage, Clikodoc,
-- SANTE CIE, SPSTN, Malakoff Humanis et deux associations.
--
-- Cette liste a produit les trois categories ajoutees ici. "Autre" revient
-- parce qu'elles ne couvrent pas tout : un fourre-tout explicite vaut mieux
-- qu'une categorie approchante choisie par depit -- ce qui rendrait les
-- statistiques par categorie fausses sans que personne ne le voie.
--
-- ## Ce que ce passage ne fait PAS
--
-- Il ne reclasse aucune opportunite. Les 15 restent en "Autre" tant que Simon
-- n'a pas tranche : quatre sont evidentes (les veterinaires), les autres le
-- sont moins -- SANTE CIE est un prestataire a domicile, SPSTN un service de
-- sante au travail, Malakoff Humanis une mutuelle. Choisir a sa place
-- ecrirait dans ses donnees une decision qui lui appartient.
--
-- Note d'encodage : `scripts/supabase-push.sh` corrompt les caracteres non
-- ASCII. Ce fichier est en ASCII strict ; les accents passent par chr(233)
-- pour "e accent aigu" et chr(201) pour "E accent aigu".

-- 1. "Clinique veterinaire", juste apres "Clinique".
with remplacement as (
  select etape.rang_element, x.rang_interne, x.valeur
  from public.configuration c,
       jsonb_array_elements(c.config -> 'dealCategories')
         with ordinality as etape(element, rang_element)
       cross join lateral (
         select 1 as rang_interne, etape.element as valeur
         union all
         select 2, jsonb_build_object(
           'value', 'clinique-veterinaire',
           'label', ('Clinique v' || chr(233) || 't' || chr(233) || 'rinaire'))
         where etape.element ->> 'value' = 'clinique'
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
  where cat ->> 'value' = 'clinique-veterinaire'
);

-- 2. "Institution" et "Editeur / plateforme" avant "Partenaire", puis "Autre"
--    en dernier : le fourre-tout se lit mieux en fin de liste.
with remplacement as (
  select etape.rang_element, x.rang_interne, x.valeur
  from public.configuration c,
       jsonb_array_elements(c.config -> 'dealCategories')
         with ordinality as etape(element, rang_element)
       cross join lateral (
         select 1 as rang_interne, etape.element as valeur
         union all
         select 0, jsonb_build_object('value', 'institution', 'label', 'Institution')
         where etape.element ->> 'value' = 'partenaire'
         union all
         select 0, jsonb_build_object(
           'value', 'editeur-plateforme',
           'label', (chr(201) || 'diteur / plateforme'))
         where etape.element ->> 'value' = 'partenaire'
         union all
         select 2, jsonb_build_object('value', 'autre', 'label', 'Autre')
         where etape.element ->> 'value' = 'partenaire'
       ) x
)
update public.configuration
set config = jsonb_set(
  config,
  '{dealCategories}',
  (select jsonb_agg(valeur order by rang_element, rang_interne, valeur ->> 'value')
     from remplacement)
)
where not exists (
  select 1 from jsonb_array_elements(config -> 'dealCategories') as cat
  where cat ->> 'value' = 'institution'
);

-- 3. Retirer "autre" de l'archive : une categorie ne doit figurer que d'un
--    cote, sinon on ne sait plus si elle est proposable.
update public.configuration
set config = jsonb_set(
  config,
  '{archivedDealCategories}',
  (
    select coalesce(jsonb_agg(cat), '[]'::jsonb)
    from jsonb_array_elements(config -> 'archivedDealCategories') as cat
    where cat ->> 'value' <> 'autre'
  )
);

-- 4. Assertions : echouer ici plutot que livrer un menu incomplet.
do $$
declare
  v_menu jsonb;
  v_archive jsonb;
  v_attendu text;
begin
  select config -> 'dealCategories', config -> 'archivedDealCategories'
    into v_menu, v_archive from public.configuration limit 1;

  foreach v_attendu in array array[
    'clinique-veterinaire', 'institution', 'editeur-plateforme', 'autre'
  ] loop
    if not (v_menu @> jsonb_build_array(jsonb_build_object('value', v_attendu))) then
      raise exception 'Categorie manquante dans le menu : %', v_attendu;
    end if;
  end loop;

  if v_archive @> '[{"value":"autre"}]'::jsonb then
    raise exception '"autre" figure a la fois au menu et dans l''archive';
  end if;
end $$;
