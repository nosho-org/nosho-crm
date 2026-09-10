-- Segmentation "Motion", et la priorite recoloree (NOS-1485).
--
-- Demande de Marc-Henri Bonamy, spec "NOSHO CRM - Motion x Priorite" du
-- 09/09/2026 : "obtenir une segmentation prospects plus precise, plus
-- strategique en fonction du niveau d'effort, cycle de vente, ARR et volumes".
--
-- ## Ce que Motion ajoute, et ce qu'il n'ajoute pas
--
-- Motion est cette segmentation, en un seul champ : Strategic / Core / SMB.
-- Les quatre criteres cites -- effort, cycle, ARR, volume -- varient ensemble,
-- et les porter en quatre colonnes distinctes demanderait quatre saisies pour
-- une seule realite commerciale. Une affaire Strategic est par construction
-- celle qui demande le plus d'effort, prend le plus de temps et rapporte le
-- plus.
--
-- Colonne libre, sans contrainte CHECK, exactement comme `category` : la liste
-- des valeurs vit dans `configuration`, ou elle peut grandir sans migration.
--
-- ## Vide par defaut, et c'est la specification
--
-- "Le champ Motion est vide par defaut pour toutes les nouvelles
-- opportunites" et "pas d'impact sur les opportunites existantes". Aucune
-- reprise de donnees : les 263 opportunites de production naissent avec
-- `motion` a NULL, ce qui est la seule valeur honnete tant que personne ne
-- l'a qualifiee.
--
-- ## Les couleurs de priorite changent
--
-- La spec impose P0 vert, P1 orange, P2 gris. Elle contredit NOS-1067, qui
-- avait choisi P1 bleu parce que l'orange signifie deja "quelque chose ne va
-- pas" dans ce CRM (inactivite, alerte, echeance depassee), et laisse P0 en
-- vert alors que le vert designe ailleurs une affaire gagnee. Le choix est
-- celui du demandeur et il est applique tel quel ; le revenir se fait en
-- trois valeurs, ici et dans defaultConfiguration.ts.
--
-- P2 passe de `bg-muted-foreground/40` a `bg-muted-foreground` : la pastille
-- compacte ecrit "P2" en blanc dessus, et un gris a 40 % d'opacite ne le
-- laisse pas lire.
--
-- Note d'encodage : `scripts/supabase-push.sh` corrompt les caracteres non
-- ASCII. Le seul libelle accentue passe par chr(201) et chr(233).

-- 1. La colonne.
alter table public.deals
  add column if not exists motion text;

comment on column public.deals.motion is
  'Segmentation commerciale (NOS-1485) : Strategic / Core / SMB. Libre, les valeurs vivent dans configuration.dealMotions.';

-- 2. Les valeurs proposees, et les couleurs de priorite.
update public.configuration
set config = jsonb_set(
  jsonb_set(
    config,
    '{dealMotions}',
    jsonb_build_array(
      jsonb_build_object('value', 'strategic', 'label', 'Strategic'),
      jsonb_build_object('value', 'core',      'label', 'Core'),
      jsonb_build_object('value', 'smb',       'label', 'SMB')
    )
  ),
  '{dealPriorities}',
  jsonb_build_array(
    jsonb_build_object(
      'value', 'urgent',
      'label', 'P0 Critique',
      'dotClassName', 'bg-green-600',
      'weight', 2),
    jsonb_build_object(
      'value', 'important',
      'label', ('P1 ' || chr(201) || 'lev' || chr(233) || 'e'),
      'dotClassName', 'bg-orange-500',
      'weight', 1),
    jsonb_build_object(
      'value', 'normal',
      'label', 'P2 Normale',
      'dotClassName', 'bg-muted-foreground',
      'weight', 0)
  )
);

-- 3. Journaliser les changements de Motion.
--
-- La spec le demande explicitement : "les changements doivent etre historises
-- dans l'activite de l'opportunite". La liste blanche de `log_deal_change` est
-- une constante dans le corps de la fonction, donc la fonction est recreee --
-- seul 'motion' est ajoute, tout le reste est identique au deploye.
--
-- Les commentaires du corps sont en ASCII pur, ici comme dans
-- supabase/schemas/02_functions.sql, pour que les deux restent comparables
-- apres le passage de supabase-push.sh.
CREATE OR REPLACE FUNCTION "public"."log_deal_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  -- Whitelist. Anything absent is never journalised, which is what keeps both
  -- the volume and the timeline sane:
  --   * updated_at            rewritten on every single save, so it changes on
  --                           100% of updates and would double every entry;
  --   * index                 kanban ordering, rewritten for a whole column on
  --                           one drag & drop - tens of rows per gesture;
  --   * mrr, priority_rank    generated columns; they would duplicate every
  --     name_search, ...      amount / priority entry;
  --   * won_at                derived from stage, same;
  --   * arr_is_manual         flipped as a side effect of typing an amount;
  --   * legacy_stage/category migration bookkeeping, never business.
  v_tracked constant text[] := array[
    'stage', 'amount', 'priority', 'sales_id', 'expected_closing_date',
    'contact_ids', 'products', 'contact_roles',
    'name', 'company_id', 'company_type', 'opportunity_type', 'category',
    'motion',
    'lead_source', 'referrer_id', 'probability', 'description',
    'next_action', 'next_action_date', 'next_action_owner_id',
    'trial_start_date', 'entered_at', 'archived_at'
  ];
  v_old      jsonb;
  v_new      jsonb;
  v_field    text;
  v_before   jsonb;
  v_after    jsonb;
  v_sales_id bigint;
  v_source   text;
BEGIN
  -- auth.uid() is NULL under service_role and under the Management API, so the
  -- row is left unattributed rather than the write failing.
  SELECT id INTO v_sales_id FROM sales WHERE user_id = auth.uid();
  v_source := coalesce(nullif(current_setting('app.change_source', true), ''), 'user');

  -- Creation is one entry, not one per column: a brand new opportunity with
  -- fifteen "-> value" rows would drown the very timeline it opens.
  IF TG_OP = 'INSERT' THEN
    INSERT INTO deal_change_log (deal_id, operation, field, old_value, new_value, changed_by, source)
    VALUES (NEW.id, 'insert', 'stage', NULL, to_jsonb(NEW.stage), v_sales_id, v_source);
    RETURN NULL;
  END IF;

  v_old := to_jsonb(OLD);
  v_new := to_jsonb(NEW);

  FOREACH v_field IN ARRAY v_tracked LOOP
    v_before := v_old -> v_field;
    v_after  := v_new -> v_field;

    -- Arrays compare as sets. `contact_ids` and `products` come back from the
    -- form in whatever order the inputs produced, and a reorder is not a
    -- business change: it must not fill the timeline with phantom entries.
    IF jsonb_typeof(v_before) = 'array' THEN
      v_before := coalesce(
        (SELECT jsonb_agg(e ORDER BY e::text) FROM jsonb_array_elements(v_before) e),
        '[]'::jsonb);
    END IF;
    IF jsonb_typeof(v_after) = 'array' THEN
      v_after := coalesce(
        (SELECT jsonb_agg(e ORDER BY e::text) FROM jsonb_array_elements(v_after) e),
        '[]'::jsonb);
    END IF;

    CONTINUE WHEN v_before IS NOT DISTINCT FROM v_after;

    INSERT INTO deal_change_log (deal_id, operation, field, old_value, new_value, changed_by, source)
    VALUES (
      NEW.id,
      'update',
      v_field,
      nullif(v_before, 'null'::jsonb),
      nullif(v_after,  'null'::jsonb),
      v_sales_id,
      v_source
    );
  END LOOP;

  RETURN NULL;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'log_deal_change(deal %): %', NEW.id, SQLERRM;
    RETURN NULL;
END;
$$;

-- 4. Assertions : ce que la migration promet doit etre vrai en sortie.
do $$
declare
  v_motions   text[];
  v_couleurs  text[];
  v_journal   boolean;
  v_remplies  int;
begin
  select array_agg(m ->> 'value' order by m ->> 'value')
    into v_motions
    from public.configuration, jsonb_array_elements(config -> 'dealMotions') as m;

  if v_motions is distinct from array['core','smb','strategic'] then
    raise exception 'dealMotions inattendu : %', v_motions;
  end if;

  select array_agg(p ->> 'dotClassName' order by (p ->> 'weight')::int desc)
    into v_couleurs
    from public.configuration, jsonb_array_elements(config -> 'dealPriorities') as p;

  if v_couleurs is distinct from
     array['bg-green-600','bg-orange-500','bg-muted-foreground'] then
    raise exception 'Couleurs de priorite inattendues : %', v_couleurs;
  end if;

  -- La liste blanche est une constante du corps : on la relit dans la source.
  select pg_get_functiondef('public.log_deal_change()'::regprocedure) like '%''motion''%'
    into v_journal;

  if not v_journal then
    raise exception 'log_deal_change ne journalise pas motion';
  end if;

  -- Aucune reprise : la spec dit "pas d'impact sur les opportunites
  -- existantes". Une valeur apparue ici signalerait un backfill involontaire.
  select count(*) into v_remplies from public.deals where motion is not null;

  if v_remplies > 0 then
    raise exception '% opportunite(s) ont deja un motion, aucune reprise n''etait prevue', v_remplies;
  end if;
end $$;
