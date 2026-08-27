-- Categorie d'opportunite "Partenaire", et retrait des deux vues
-- personnalisees (NOS-1089 / NOS-1090).
--
-- ---------------------------------------------------------------------------
-- Pourquoi ce fichier est en ASCII pur
-- ---------------------------------------------------------------------------
-- `scripts/supabase-push.sh` lit la migration avec `cat` puis la passe a
-- `jq --arg`. Sous Git Bash / Windows, tout caractere non-ASCII y devient
-- U+FFFD : c'est ainsi que la production a affiche "P1 <?>lev<?>e" apres la
-- migration 20260827093000, reparee par 20260827100000.
--
-- "Partenaire" n'a pas d'accent. Mais `dealCategories` contient "A
-- reclasser", "Hopital" et "Esthetique" avec les leurs. Reecrire le
-- tableau en litteral les detruirait tous.
--
-- D'ou la manipulation par reference : `jsonb_array_elements` deplie
-- l'existant, `jsonb_agg` le recompose, et le seul litteral introduit est
-- l'objet neuf, entierement ASCII. Les libelles accentues ne sont jamais
-- reecrits -- ils transitent comme valeurs jsonb, hors de portee du shell.

-- ---------------------------------------------------------------------------
-- 1. La categorie "Partenaire", inseree avant "Autre"
-- ---------------------------------------------------------------------------
-- Avant le fourre-tout, qui se lit mieux en dernier. L'ordre du tableau est
-- celui du menu deroulant.
--
-- Le `where` rend la migration rejouable : la relancer ne creerait pas un
-- doublon.
update public.configuration
   set config = jsonb_set(
         config,
         '{dealCategories}',
         (
           select jsonb_agg(entry order by rank, position)
             from (
               select value as entry,
                      -- "Autre" passe en dernier, le nouveau juste avant.
                      case when value->>'value' = 'autre' then 2 else 0 end as rank,
                      ordinality as position
                 from jsonb_array_elements(config->'dealCategories')
                      with ordinality
               union all
               select '{"label":"Partenaire","value":"partenaire"}'::jsonb,
                      1,
                      0
             ) ordered
         )
       )
 where not exists (
         select 1
           from jsonb_array_elements(config->'dealCategories') entry
          where entry->>'value' = 'partenaire'
       );

-- ---------------------------------------------------------------------------
-- 2. Les vues "Investisseurs" et "Partenaires"
-- ---------------------------------------------------------------------------
-- Retirees a la demande de Simon (NOS-1089). La fonctionnalite reste : c'est
-- `CreateViewDialog` qui alimente ce tableau, et le bouton "+" de la barre
-- de navigation peut en recreer une a tout moment.
--
-- CE QUE CELA COUTE, et qui doit rester ecrit ici :
--
--   investisseur : 18 opportunites (17 ouvertes), 255 001 EUR
--   partenaire   : 10 opportunites (10 ouvertes),  34 400 EUR
--
-- Ces 28 opportunites ne basculent PAS dans le pipeline commercial a la place.
-- `investisseur` et `partenaire` figurent dans `NON_COMMERCIAL_SLUGS`
-- (`dealUtils.ts`) et dans `companyTypes` : `getNonCommercialCompanyTypes` les
-- exclura toujours de l'ecran Opportunites, vues ou pas vues.
--
-- Aucune donnee n'est detruite -- seules les lignes de `deals` comptent, et on
-- n'y touche pas. Elles perdent leur ecran, pas leur existence. Pour les
-- revoir : recreer une vue, ou reclasser ces opportunites (decision metier).
--
-- On cible les deux vues par leur `companyType` plutot que par leur `id`
-- (`view-1774341768854`, `view-1774874374524`) : un identifiant horodate ne
-- dit pas ce qu'il designe, et ne survivrait pas a une recreation de la vue.
update public.configuration
   set config = jsonb_set(
         config,
         '{customViews}',
         coalesce(
           (
             select jsonb_agg(view_entry order by position)
               from jsonb_array_elements(config->'customViews')
                    with ordinality as views(view_entry, position)
              -- `coalesce` avant le `not in` : une vue sans `companyType` a un
              -- `->>` nul, et `null not in (...)` vaut NULL, donc faux -- elle
              -- serait supprimee au passage sans que personne l'ait demande.
              where coalesce(view_entry->>'companyType', '')
                    not in ('investisseur', 'partenaire')
           ),
           -- `jsonb_agg` rend NULL quand il ne reste rien : sans ce repli, la
           -- cle `customViews` disparaitrait et le front lirait `undefined`
           -- la ou il attend un tableau.
           '[]'::jsonb
         )
       )
-- `jsonb_exists` plutot que l'operateur `?` : ce fichier transite par un
-- corps JSON, et un point d'interrogation nu se fait prendre pour un
-- marqueur de parametre par plus d'un pilote.
 where jsonb_exists(config, 'customViews');
