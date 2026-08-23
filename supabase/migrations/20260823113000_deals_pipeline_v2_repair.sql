-- Repair for 20260823093000_deals_pipeline_v2.sql
--
-- That migration switched the stages in two passes, and the second one undid
-- most of the first.
--
-- Pass 2 parked any deal whose stage was not a KEY of `deal_migration_map`.
-- But pass 1 had just rewritten those stages to their new values, and `lost`,
-- `demo-poc` and `proposal` are only ever *targets* in that table, never keys.
-- So `not exists (... where old_stage = d.stage ...)` was true for every deal
-- pass 1 had touched, and 71 of them went straight into the reclassification
-- queue: 58 lost deals, 11 demo/POC, 2 proposals.
--
-- `lead`, `qualified`, `closed-won` and `churn` survived because they map onto
-- themselves and are therefore keys. Deal 108 ("Strong Hands") survived as
-- `lost` because its investisseur company_type excluded it from pass 2 — the
-- one row the exclusion was written for.
--
-- No data was lost: `legacy_stage` had already recorded every origin, and the
-- `private.deals_backup_20260823` snapshot was untouched. The correct target is
-- therefore derivable without inventing anything.
--
-- Applied to production on 2026-08-23, before this file existed; its version is
-- registered in `supabase_migrations.schema_migrations` so `db push` skips it
-- there. On a fresh database, 20260823093000 reproduces the bug and this file
-- corrects it — the migration history stays faithful to what production ran.

-- ---------------------------------------------------------------------------
-- 1. Send the wrongly parked deals back to their real stage
-- ---------------------------------------------------------------------------
--
-- Genuinely ambiguous deals (`opportunity`, and `partenariats` with no custom
-- view) have no `new_stage`, so they are left in the queue — which is where the
-- spec wants them.

update public.deals d
set stage = m.new_stage
from public.deal_migration_map m
where d.stage = 'a-reclasser'
  and m.old_stage = d.legacy_stage
  and m.new_stage is not null;

-- ---------------------------------------------------------------------------
-- 2. Verification (rule 8) — blocking
-- ---------------------------------------------------------------------------

do $$
declare
    v_nb_before  bigint;
    v_arr_before numeric;
    v_nb         bigint;
    v_arr        numeric;
    v_parked     bigint;
    v_orphans    bigint;
begin
    select count(*), coalesce(sum(amount), 0) into v_nb_before, v_arr_before
      from private.deals_backup_20260823;
    select count(*), coalesce(sum(amount), 0) into v_nb, v_arr from public.deals;

    if v_nb <> v_nb_before or v_arr is distinct from v_arr_before then
        raise exception 'Réparation pipeline v2 : invariants rompus (% deals / % ARR, attendu % / %)',
            v_nb, v_arr, v_nb_before, v_arr_before;
    end if;

    -- Only the deals with no certain target may remain queued. A larger number
    -- means the repair did not catch everything pass 2 mislabelled.
    select count(*) into v_parked
      from public.deals d
      where d.stage = 'a-reclasser'
        and exists (
            select 1 from public.deal_migration_map m
            where m.old_stage = d.legacy_stage and m.new_stage is not null
        );

    if v_parked > 0 then
        raise exception 'Réparation pipeline v2 : % opportunité(s) encore mal classées', v_parked;
    end if;

    select count(*) into v_orphans
      from public.deals d
      where d.stage not in (
          select jsonb_array_elements(config->'dealStages')->>'value'
            from public.configuration where id = 1
          union
          select jsonb_array_elements(coalesce(config->'archivedDealStages', '[]'::jsonb))->>'value'
            from public.configuration where id = 1
      );

    if v_orphans > 0 then
        raise exception 'Réparation pipeline v2 : % opportunité(s) hors référentiel', v_orphans;
    end if;

    raise notice 'Réparation pipeline v2 : % opportunités, % en file "À reclasser"',
        v_nb, (select count(*) from public.deals where stage = 'a-reclasser');
end
$$;
