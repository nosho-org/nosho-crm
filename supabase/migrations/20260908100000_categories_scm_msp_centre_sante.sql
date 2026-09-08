-- Retirer "Autre" et ajouter SCM, MSP, Centre de sante (NOS-1398).
--
-- Simon, le 08/09/2026 : "je veux que tu supprimes autres et que tu ajoutes
-- SCM, MSP, Centre de sante".
--
-- ## Les trois nouvelles
--
-- Ce sont des structures d'exercice coordonne : SCM (societe civile de moyens),
-- MSP (maison de sante pluriprofessionnelle), centre de sante. Elles sont
-- placees a la suite de "Cabinet" plutot qu'en fin de liste -- ce sont des
-- cabinets de groupe sous des formes juridiques differentes, et les lire cote
-- a cote evite de parcourir toute la liste pour les comparer.
--
-- ## "Autre" est archivee, pas supprimee
--
-- 15 opportunites OUVERTES la portaient au moment de cette migration :
-- quatre cliniques veterinaires, Croix Rouge, Ordre des Medecins, Qare,
-- Cpage, SANTE CIE, Institut Curie, deux associations, une mutuelle, SPSTN,
-- Clikodoc. Aucune ne releve des trois categories ajoutees.
--
-- Leur `category` n'est donc PAS reecrite : rien ne permettrait de choisir a
-- leur place, et poser une categorie fausse serait pire que d'en laisser une
-- retiree. L'entree rejoint `archivedDealCategories`, ou le libelle reste
-- resoluble -- la fiche affiche "Autre" plutot que le slug brut.
--
-- Consequence assumee et voulue : ces 15 ne peuvent plus etre RE-classees en
-- "Autre". Qui en modifiera une devra lui trouver une vraie categorie.
--
-- Note d'encodage : `scripts/supabase-push.sh` corrompt les caracteres non
-- ASCII. Ce fichier est en ASCII strict, et "Centre de sante" est construit
-- avec chr(233), qui rend le e accent aigu en UTF-8 sans faire entrer un seul
-- octet non ASCII dans le fichier.

-- 1. Le menu : "Autre" retiree, les trois nouvelles inserees apres
--    "Cabinet". On reconstruit le tableau plutot que de le reecrire en dur,
--    pour qu'une categorie ajoutee a la main ne disparaisse pas au passage.
with remplacement as (
  select etape.rang_element, x.rang_interne, x.valeur
  from public.configuration c,
       jsonb_array_elements(c.config -> 'dealCategories')
         with ordinality as etape(element, rang_element)
       cross join lateral (
         select 1 as rang_interne, etape.element as valeur
         where etape.element ->> 'value' <> 'autre'
         union all
         select 2, jsonb_build_object(
           'value', 'centre-de-sante',
           'label', ('Centre de sant' || chr(233)))
         where etape.element ->> 'value' = 'cabinet'
         union all
         select 3, jsonb_build_object('value', 'msp', 'label', 'MSP')
         where etape.element ->> 'value' = 'cabinet'
         union all
         select 4, jsonb_build_object('value', 'scm', 'label', 'SCM')
         where etape.element ->> 'value' = 'cabinet'
       ) x
)
update public.configuration
set config = jsonb_set(
  config,
  '{dealCategories}',
  (
    select jsonb_agg(valeur order by rang_element, rang_interne)
    from remplacement
  )
);

-- 2. L'archive, pour que les 15 opportunites gardent un libelle lisible.
update public.configuration
set config = jsonb_set(
  config,
  '{archivedDealCategories}',
  (config -> 'archivedDealCategories')
    || jsonb_build_array(jsonb_build_object('value', 'autre', 'label', 'Autre'))
)
where not exists (
  select 1
  from jsonb_array_elements(config -> 'archivedDealCategories') as archivee
  where archivee ->> 'value' = 'autre'
);

-- 3. Verifications : le menu doit contenir les trois nouvelles et plus
--    "Autre", et l'archive doit l'avoir recueillie. Echouer ici vaut mieux
--    que livrer un menu ampute sans filet.
do $$
declare
  v_menu jsonb;
  v_archive jsonb;
begin
  select config -> 'dealCategories', config -> 'archivedDealCategories'
    into v_menu, v_archive from public.configuration limit 1;

  if v_menu @> '[{"value":"autre"}]'::jsonb then
    raise exception 'La categorie "autre" est toujours dans le menu';
  end if;
  if not (v_archive @> '[{"value":"autre"}]'::jsonb) then
    raise exception 'La categorie "autre" n''a pas rejoint l''archive';
  end if;
  for i in 1..3 loop
    if not (v_menu @> (array['[{"value":"scm"}]','[{"value":"msp"}]',
                             '[{"value":"centre-de-sante"}]'])[i]::jsonb) then
      raise exception 'Categorie manquante dans le menu : %',
        (array['scm','msp','centre-de-sante'])[i];
    end if;
  end loop;
end $$;
