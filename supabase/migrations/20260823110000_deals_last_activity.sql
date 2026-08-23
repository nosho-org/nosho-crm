-- A real "last activity" for deals (NOS-955 pipeline-health alerts)
--
-- ORDER MATTERS. This file must run AFTER 20260823093000_deals_pipeline_v2.sql,
-- which is why it is a separate migration rather than part of it.
--
-- `deals.updated_at` has a default but no trigger, and no Supabase-side code
-- writes it: production has 0 of 232 rows where `updated_at <> created_at`.
-- The cockpit uses it as a last-activity proxy (dealFields.ts), so the
-- "dormant deal" alert currently measures age-since-creation, not inactivity.
--
-- Installing the trigger before the stage switchover would have stamped
-- `updated_at = now()` on every migrated row, resetting the dormancy counter
-- for the whole portfolio on the very day we claim to make it trustworthy.

-- ---------------------------------------------------------------------------
-- 1. Keep updated_at honest from now on
-- ---------------------------------------------------------------------------
--
-- `set_updated_at()` already exists (02_functions.sql) and is used by
-- `prospects`. Only the wiring was missing.

create or replace trigger deals_set_updated_at
    before update on public.deals
    for each row execute function public.set_updated_at();

-- No backfill. The historical values are wrong and cannot be reconstructed;
-- inventing them would be worse than the expression below, which derives the
-- truth from activity that actually happened.

-- ---------------------------------------------------------------------------
-- 2. Expose last_activity_at on deals_summary
-- ---------------------------------------------------------------------------
--
-- Computed in the view rather than materialised in a column. A denormalised
-- column maintained by four triggers is exactly the kind of value that drifts
-- in silence — the bug this migration exists to fix. The expression cannot lie,
-- and it retroactively repairs the frozen `updated_at` values above: a deal
-- with a note from three days ago and an `updated_at` from eight months ago
-- correctly reads as three days.
--
-- Scalar subqueries, NOT joins. A 1-N join here would multiply the rows feeding
-- the `string_agg` below and repeat every contact name once per note.
-- GREATEST ignores NULLs, so a deal with no note and no call simply falls back
-- to `updated_at`.
--
-- DROP + CREATE, not CREATE OR REPLACE: `select d.*` is expanded and frozen at
-- creation time, so the view has to be rebuilt to pick up the columns added by
-- 20260823090000. DROP also resets privileges, hence the re-grants.

drop view if exists public.deals_summary;

create view public.deals_summary
  with (security_invoker = on)
  as
select
    d.*,
    -- Filterable mirror of company_type with NULL folded to '' (NOS-797).
    -- PostgREST evaluates `not.in.(...)` as NULL for a NULL column and drops
    -- the row, which would have hidden every untyped opportunity — exactly the
    -- ones the commercial pipeline is made of.
    coalesce(d.company_type, '')                                                                                       as company_type_key,
    comp.name                                                                                                          as company_name,
    replace(lower(immutable_unaccent(coalesce(comp.name, ''))), ' ', '')                                                as company_name_search,
    coalesce(string_agg((c.first_name || ' ' || c.last_name), ' '), '')                                                as contact_names,
    replace(lower(immutable_unaccent(coalesce(string_agg((c.first_name || ' ' || c.last_name), ' '), ''))), ' ', '')    as contact_names_search,
    greatest(
        d.updated_at,
        (select max(dn.date)       from public.deal_notes dn where dn.deal_id = d.id),
        (select max(cl.started_at) from public.call_logs cl  where cl.deal_id = d.id)
    )                                                                                                                  as last_activity_at
from public.deals d
    left join public.contacts c on c.id = any(d.contact_ids)
    left join public.companies comp on comp.id = d.company_id
group by d.id, comp.name;

revoke all on table public.deals_summary from anon;
grant all on table public.deals_summary to authenticated;
grant all on table public.deals_summary to service_role;
