-- Retirer l'etape "Negociation" du pipeline (NOS-1403).
--
-- Simon, le 08/09/2026 : "supprime en negociation".
--
-- ## Le retrait a ete mesure avant d'etre fait
--
--   opportunites portant l'etape .............. 0
--   ARR concerne .............................. 0 EUR
--   passages vers cette etape dans le journal . 0, depuis mars 2026
--
-- C'etait une case du tunnel que personne n'a jamais cochee. Aucune reprise de
-- donnees n'est donc necessaire, et aucune ligne du journal ne la mentionne.
--
-- ## Archivee, pas supprimee
--
-- Elle rejoint `archivedDealStages`, par principe plutot que par necessite :
-- une etape effacee tout court afficherait son slug brut si une ligne egaree
-- venait a la mentionner. C'est la meme regle qui a sauve la lisibilite de
-- l'historique lors du redecoupage de "Demo / POC" (NOS-1377), ou les lignes
-- concernees se comptaient par centaines.
--
-- Sa probabilite (85 %) part avec elle : une etape absente du pipeline qui
-- garderait une ponderation laisserait croire qu'elle pese encore.

-- 1. Retirer l'etape du pipeline.
update public.configuration
set config = jsonb_set(
  config,
  '{dealStages}',
  (
    select coalesce(jsonb_agg(etape), '[]'::jsonb)
    from jsonb_array_elements(config -> 'dealStages') as etape
    where etape ->> 'value' <> 'negociation'
  )
);

-- 2. Retirer sa probabilite.
update public.configuration
set config = jsonb_set(
  config,
  '{dealStageProbabilities}',
  (config -> 'dealStageProbabilities') - 'negociation'
);

-- 3. L'archiver, pour que son libelle reste resoluble.
update public.configuration
set config = jsonb_set(
  config,
  '{archivedDealStages}',
  (config -> 'archivedDealStages')
    || jsonb_build_array(
         jsonb_build_object(
           'value', 'negociation',
           'label', ('N' || chr(233) || 'gociation'))
       )
)
where not exists (
  select 1
  from jsonb_array_elements(config -> 'archivedDealStages') as archivee
  where archivee ->> 'value' = 'negociation'
);

-- 4. Assertions. La premiere est un garde-fou de derniere minute : si une
--    opportunite avait ete creee en Negociation entre la mesure et
--    l'application, la migration echoue plutot que de la rendre orpheline.
do $$
declare
  v_restantes int;
  v_menu jsonb;
  v_archive jsonb;
begin
  select count(*) into v_restantes from public.deals where stage = 'negociation';
  if v_restantes > 0 then
    raise exception
      '% opportunite(s) sont encore en Negociation : les reclasser avant de retirer l''etape',
      v_restantes;
  end if;

  select config -> 'dealStages', config -> 'archivedDealStages'
    into v_menu, v_archive from public.configuration limit 1;

  if v_menu @> '[{"value":"negociation"}]'::jsonb then
    raise exception 'L''etape Negociation est toujours dans le pipeline';
  end if;
  if not (v_archive @> '[{"value":"negociation"}]'::jsonb) then
    raise exception 'L''etape Negociation n''a pas rejoint l''archive';
  end if;
end $$;
