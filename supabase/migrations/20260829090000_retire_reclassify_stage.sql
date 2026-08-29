-- Retrait de l'etape "A reclasser" du pipeline (demande de Simon, 29/08/2026).
--
-- Fichier en ASCII pur : `scripts/supabase-push.sh` passe la migration a
-- `jq --arg` apres un `cat`, et sous Git Bash / Windows tout caractere
-- non-ASCII y devient U+FFFD. Voir 20260827100000.
--
-- ---------------------------------------------------------------------------
-- Archivee plutot que supprimee
-- ---------------------------------------------------------------------------
-- `archivedDealStages` est l'endroit ou ce depot range ses etapes retirees --
-- il en contient deja dix-sept, heritees de la refonte v2. Y deplacer celle-ci
-- la fait disparaitre du pipeline, du kanban, des filtres et des defauts,
-- exactement comme une suppression, mais son libelle reste resoluble si un
-- enregistrement egare refait surface un jour. Une etape supprimee tout court
-- afficherait son slug brut.
--
-- Sans risque : verifie avant ecriture, AUCUNE opportunite ne porte cette
-- etape en production. C'etait la file d'attente de la migration v2, et elle a
-- ete videe.
--
-- La CATEGORIE `a-reclasser`, elle, n'est pas touchee : 18 opportunites la
-- portent encore, et c'est un axe distinct de l'etape.
--
-- Manipulation par reference : le libelle "A reclasser" porte un accent, et le
-- reecrire en litteral le detruirait.

update public.configuration
   set config = jsonb_set(
         jsonb_set(
           config,
           '{dealStages}',
           coalesce(
             (
               select jsonb_agg(entry order by position)
                 from jsonb_array_elements(config->'dealStages')
                      with ordinality as t(entry, position)
                where entry->>'value' <> 'a-reclasser'
             ),
             '[]'::jsonb
           )
         ),
         '{archivedDealStages}',
         coalesce(config->'archivedDealStages', '[]'::jsonb)
           || coalesce(
                (
                  select jsonb_agg(entry)
                    from jsonb_array_elements(config->'dealStages') entry
                   where entry->>'value' = 'a-reclasser'
                ),
                '[]'::jsonb
              )
       )
 where exists (
         select 1
           from jsonb_array_elements(config->'dealStages') entry
          where entry->>'value' = 'a-reclasser'
       );
