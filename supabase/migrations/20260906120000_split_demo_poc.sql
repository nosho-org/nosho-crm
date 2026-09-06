-- Decouper l'etape "Demo / POC" en deux : `demo` puis `poc` (NOS-1377).
--
-- Simon, le 06/09/2026 : "je pense aussi utile de separer le statut demo et
-- poc car ce ne sont pas les memes niveaux d'avancement".
--
-- Ce n'est pas une invention : la refonte v2 avait FUSIONNE deux etapes qui
-- existaient separement -- `d-mo-rdv` ("Demo booked") et `poc-lanc` ("POC
-- lance"), toutes deux encore presentes dans `archivedDealStages`. On revient
-- a la distinction d'origine, avec des slugs propres.
--
-- ## La reprise des donnees
--
-- Les 14 opportunites en `demo-poc` passent en `demo`, a une exception nommee
-- par Simon : le Cabinet Dentaire Saint Louis ABOULKER (deal 287), qui va en
-- `poc`. Un cas nomme ne se deduit pas d'une regle -- il est traite a part, et
-- l'assertion plus bas verifie qu'il a bien ete trouve plutot que de laisser
-- une faute de frappe le rater en silence.
--
-- ## Pourquoi `app.change_source`
--
-- Le trigger `log_deal_change` journalise chaque changement d'etape, et le
-- rapport hebdomadaire en cours de construction (NOS-1378) compte les
-- opportunites "ayant avance" a partir de ce journal.
--
-- Sans precaution, cette reprise y ecrirait 14 lignes `demo-poc -> demo` que
-- le rapport lirait comme quatorze avancees commerciales survenues un
-- dimanche. Ce sont des reclassements administratifs, pas des mouvements de
-- pipeline. `app.change_source` est le mecanisme prevu par le trigger pour le
-- dire : les lignes portent `source = 'migration'`, et le rapport n'aura qu'a
-- ne compter que `source = 'user'`.
--
-- L'historique, lui, n'est pas reecrit : les centaines de lignes existantes
-- qui portent "demo-poc" restent telles quelles. C'est pourquoi l'etape
-- rejoint `archivedDealStages` -- son libelle doit rester resoluble pour que
-- la timeline d'activite affiche "Demo / POC" et non son slug brut.
--
-- Note d'encodage : `scripts/supabase-push.sh` corrompt les caracteres non
-- ASCII. Ce fichier est donc en ASCII strict, et les libelles accentues
-- sont construits avec chr(233), qui rend le e accent aigu en UTF-8 sans faire
-- entrer un seul octet non ASCII dans le fichier.

set local app.change_source = 'migration';

-- Le cas nomme d'abord, pour qu'il ne soit pas emporte par la regle generale.
update public.deals
set stage = 'poc'
where id = 287 and stage = 'demo-poc';

do $$
begin
  if not exists (select 1 from public.deals where id = 287 and stage = 'poc') then
    raise exception 'Deal 287 (Saint Louis ABOULKER) attendu en POC, introuvable ou deja deplace';
  end if;
end $$;

update public.deals
set stage = 'demo'
where stage = 'demo-poc';

-- 1. Le pipeline : `demo-poc` remplacee, en place, par `demo` puis `poc`.
--
-- L'etape est retiree et deux etapes inserees a sa position exacte. On
-- reconstruit le tableau plutot que de le reecrire en dur : une etape ajoutee
-- a la main dans la configuration ne doit pas disparaitre au passage.
with remplacement as (
  select etape.rang_element, x.rang_interne, x.valeur
  from public.configuration c,
       jsonb_array_elements(c.config -> 'dealStages')
         with ordinality as etape(element, rang_element)
       cross join lateral (
         select 1 as rang_interne, etape.element as valeur
         where etape.element ->> 'value' <> 'demo-poc'
         union all
         select 1, jsonb_build_object('value', 'demo', 'label', ('D' || chr(233) || 'mo'))
         where etape.element ->> 'value' = 'demo-poc'
         union all
         select 2, jsonb_build_object('value', 'poc', 'label', 'POC')
         where etape.element ->> 'value' = 'demo-poc'
       ) x
)
update public.configuration
set config = jsonb_set(
  config,
  '{dealStages}',
  (
    select jsonb_agg(valeur order by rang_element, rang_interne)
    from remplacement
  )
);

-- 2. Les probabilites. `demo` herite des 40 % de l'etape fusionnee -- c'est la
--    valeur que la production connaissait, et la demo est la premiere des
--    deux. `poc` vaut 55 %, entre la demo et la proposition (70 %) : un POC
--    lance engage l'etablissement sans que le prix soit acte.
update public.configuration
set config = jsonb_set(
  config,
  '{dealStageProbabilities}',
  (config -> 'dealStageProbabilities') - 'demo-poc'
    || jsonb_build_object('demo', 40, 'poc', 55)
);

-- 3. L'archive, pour que l'historique reste lisible.
update public.configuration
set config = jsonb_set(
  config,
  '{archivedDealStages}',
  (config -> 'archivedDealStages')
    || jsonb_build_array(
         jsonb_build_object('value', 'demo-poc', 'label', ('D' || chr(233) || 'mo / POC'))
       )
)
where not exists (
  select 1
  from jsonb_array_elements(config -> 'archivedDealStages') as archivee
  where archivee ->> 'value' = 'demo-poc'
);
