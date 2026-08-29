-- Retrait de la categorie "A reclasser" (demande de Simon, 29/08/2026).
--
-- Fichier en ASCII pur : `scripts/supabase-push.sh` passe la migration a
-- `jq --arg` apres un `cat`, et sous Git Bash / Windows tout caractere
-- non-ASCII y devient U+FFFD. Voir 20260827100000.
--
-- ---------------------------------------------------------------------------
-- Pourquoi les opportunites concernees passent SANS categorie
-- ---------------------------------------------------------------------------
-- 25 opportunites portent cette categorie, dont 18 actives -- et ce sont de
-- vraies affaires : CHU, Dentego, Caisse des Depots, OPHTA 34, Rocket School.
--
-- Leur `legacy_category` ne peut pas servir de repli. Elle contient
-- `copywriting`, `print-project`, `ui-design` et `other` : les categories du
-- jeu de demonstration d'Atomic CRM, restees en place avant la refonte v2.
-- Les restaurer mettrait "copywriting" sur un CHU.
--
-- `autre` ne convient pas davantage : ce serait affirmer un classement que
-- personne n'a fait. `null` dit la verite -- ces affaires ne sont pas
-- categorisees -- et laisse le champ ouvert a qui voudra le remplir.
--
-- La trace n'est pas perdue : `legacy_category` reste en base, donc ces
-- opportunites restent identifiables par `category is null and
-- legacy_category is not null` si le besoin s'en presente.
--
-- La categorie n'est PAS ajoutee a `archivedDealCategories`, contrairement a
-- l'etape homonyme archivee ce matin : cette liste sert a resoudre les
-- libelles portes par `legacy_category`, et aucune opportunite n'y porte
-- `a-reclasser`. L'y mettre n'aurait rien a resoudre.

update public.deals
   set category = null
 where category = 'a-reclasser';

-- Manipulation par reference : les libelles restants portent des accents
-- ("A reclasser", "Hopital", "Esthetique"), et reecrire le tableau en litteral
-- les detruirait.
update public.configuration
   set config = jsonb_set(
         config,
         '{dealCategories}',
         coalesce(
           (
             select jsonb_agg(entry order by position)
               from jsonb_array_elements(config->'dealCategories')
                    with ordinality as t(entry, position)
              where entry->>'value' <> 'a-reclasser'
           ),
           '[]'::jsonb
         )
       )
 where exists (
         select 1
           from jsonb_array_elements(config->'dealCategories') entry
          where entry->>'value' = 'a-reclasser'
       );
