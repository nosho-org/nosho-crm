-- Type d'opportunite "Partenariat" (NOS-1093).
--
-- Choisir ce type range automatiquement l'opportunite dans la categorie
-- "Partenaire", ajoutee par la migration 20260827110000. La regle elle-meme
-- vit dans le formulaire (`DealOpportunityTypeInput`) et les deux slugs sont
-- nommes dans `dealUtils` : PARTNERSHIP_OPPORTUNITY_TYPE / PARTNER_DEAL_CATEGORY.
--
-- Fichier en ASCII pur : `scripts/supabase-push.sh` passe la migration a
-- `jq --arg` apres un `cat`, et sous Git Bash / Windows tout caractere
-- non-ASCII y devient U+FFFD. Voir 20260827100000 pour la fois ou ca a mordu.
--
-- `dealOpportunityTypes` ne contient aucun accent aujourd'hui ("Nouveau
-- client", "Upsell", "Renouvellement"), mais on manipule quand meme par
-- reference : la migration reste juste si quelqu'un ajoute un libelle accentue
-- avant qu'elle ne soit rejouee sur un autre environnement.
--
-- Ajoute en fin de liste, contrairement a "Partenaire" chez les categories :
-- il n'y a pas ici de fourre-tout "Autre" qui doive rester dernier.
--
-- Le `where` rend la migration rejouable sans creer de doublon.
update public.configuration
   set config = jsonb_set(
         config,
         '{dealOpportunityTypes}',
         config->'dealOpportunityTypes'
           || '[{"label":"Partenariat","value":"partenariat"}]'::jsonb
       )
 where not exists (
         select 1
           from jsonb_array_elements(config->'dealOpportunityTypes') entry
          where entry->>'value' = 'partenariat'
       );
