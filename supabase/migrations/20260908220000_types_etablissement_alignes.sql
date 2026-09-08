-- Aligner les types d'etablissement sur les categories d'opportunite (NOS-1404).
--
-- Simon, le 08/09/2026 : "quand on cree une opportunite et qu'on cree une
-- societe depuis la creation d'opportunite, le champ categorie ne reprend pas
-- toutes les categories".
--
-- ## Une collision de vocabulaire
--
-- Deux taxonomies portaient le nom "Categorie" a deux endroits du meme
-- formulaire :
--
--   dealCategories ...... 16 entrees, sur l'opportunite
--   establishmentTypes ... 3 entrees, sur la societe creee a la volee
--                          (Cabinet, Clinique, Hopital)
--
-- Creer une societe depuis une opportunite proposait donc trois choix la ou
-- l'ecran d'a cote en offrait seize. Ce n'etait pas un oubli d'affichage mais
-- deux listes differentes, dont l'une s'appelait comme l'autre.
--
-- Les trois valeurs existantes sont un SOUS-ENSEMBLE exact des categories,
-- slugs compris : l'alignement n'ecrase rien et ne casse aucune societe. Six
-- societes sur 402 portent une valeur, toutes parmi ces trois.
--
-- ## Le tarif ne suit pas
--
-- `arr` alimente l'ARR propose a la creation d'une opportunite. Les trois
-- paliers connus sont conserves ; les treize nouveaux n'en ont pas, et
-- `getSuggestedArr` rend alors `null` -- aucune suggestion plutot qu'un montant
-- invente. Un prix faux se propagerait dans le pipeline pondere sans que
-- personne ne sache d'ou il vient.
--
-- Note d'encodage : `scripts/supabase-push.sh` corrompt les caracteres non
-- ASCII. Les libelles accentues passent par chr(233) et chr(201).

update public.configuration
set config = jsonb_set(
  config,
  '{establishmentTypes}',
  jsonb_build_array(
    jsonb_build_object('value', 'association', 'label', 'Association'),
    jsonb_build_object('value', 'autre', 'label', 'Autre'),
    jsonb_build_object('value', 'cabinet', 'label', 'Cabinet', 'arr', 800),
    jsonb_build_object('value', 'centre-de-sante',
      'label', ('Centre de sant' || chr(233))),
    jsonb_build_object('value', 'clinique', 'label', 'Clinique', 'arr', 5000),
    jsonb_build_object('value', 'clinique-veterinaire',
      'label', ('Clinique v' || chr(233) || 't' || chr(233) || 'rinaire')),
    jsonb_build_object('value', 'dentaire', 'label', 'Dentaire'),
    jsonb_build_object('value', 'editeur-plateforme',
      'label', (chr(201) || 'diteur / plateforme')),
    jsonb_build_object('value', 'esthetique',
      'label', ('Esth' || chr(233) || 'tique')),
    jsonb_build_object('value', 'hopital',
      'label', ('H' || chr(244) || 'pital'), 'arr', 15000),
    jsonb_build_object('value', 'imagerie', 'label', 'Imagerie'),
    jsonb_build_object('value', 'institution', 'label', 'Institution'),
    jsonb_build_object('value', 'msp', 'label', 'MSP'),
    jsonb_build_object('value', 'mutualiste', 'label', 'Mutualiste'),
    jsonb_build_object('value', 'partenaire', 'label', 'Partenaire'),
    jsonb_build_object('value', 'scm', 'label', 'SCM')
  )
);

-- Assertions : les deux listes doivent porter exactement les memes valeurs, et
-- aucune societe existante ne doit se retrouver avec un type inconnu.
do $$
declare
  v_types text[];
  v_categories text[];
  v_orphelines int;
begin
  select array_agg(t ->> 'value' order by t ->> 'value')
    into v_types
    from public.configuration, jsonb_array_elements(config -> 'establishmentTypes') as t;

  select array_agg(c ->> 'value' order by c ->> 'value')
    into v_categories
    from public.configuration, jsonb_array_elements(config -> 'dealCategories') as c;

  if v_types is distinct from v_categories then
    raise exception
      'Les types d''etablissement ne correspondent pas aux categories : % vs %',
      v_types, v_categories;
  end if;

  select count(*) into v_orphelines
    from public.companies
   where establishment_type is not null
     and establishment_type <> ''
     and not (establishment_type = any(v_types));

  if v_orphelines > 0 then
    raise exception
      '% societe(s) portent un type d''etablissement absent de la nouvelle liste',
      v_orphelines;
  end if;
end $$;
