-- Issue #108 — the "prochaine action" columns of the opportunities list are empty.
--
-- `deals.next_action` and `deals.next_action_date` (added 20260820120000) are
-- fields someone has to type into, and nobody ever has: production carried 0
-- of 215 opportunities with a next action date while 100 pending tasks existed.
-- The sales team records its next steps as tasks — 97 of the 215 opportunities
-- have one reachable through their contacts.
--
-- This exposes that backlog on `deals_summary` so the list can fall back to it.
-- The typed columns keep precedence in the UI; nothing is overwritten here.
--
-- `deals_summary` must be replaced wholesale: `create or replace view` cannot
-- add a column in the middle of the select list, and the two new ones go after
-- `last_activity_at`, so this restates the view in full.

drop view if exists public.deals_summary;

create view public.deals_summary with (security_invoker = on) as
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
    -- Real last activity, replacing the `updated_at` proxy the cockpit used to
    -- read. Computed rather than materialised: a denormalised column kept in
    -- sync by four triggers is exactly the kind of value that drifts unnoticed.
    --
    -- Scalar subqueries, NOT joins — a 1-N join would multiply the rows feeding
    -- the string_agg above and repeat every contact name once per note.
    -- GREATEST ignores NULLs, so a deal with no note and no call falls back to
    -- updated_at on its own.
    greatest(
        d.updated_at,
        (select max(dn.date)       from public.deal_notes dn where dn.deal_id = d.id),
        (select max(cl.started_at) from public.call_logs cl  where cl.deal_id = d.id)
    )                                                                                                                  as last_activity_at,
    -- Next action derived from the task backlog (issue #108).
    --
    -- A task reaches a deal either directly (`tasks.deal_id`, the link the
    -- Tasks UI does not create yet) or through one of the deal's contacts —
    -- which is how all 124 production tasks are attached today.
    --
    -- Scalar subqueries for the same reason as above: joining `tasks` here
    -- would multiply the rows feeding `string_agg` and repeat every contact
    -- name once per task. Ordering by `due_date nulls last` makes an undated
    -- task a fallback rather than a winner.
    (
        select t.due_date from public.tasks t
        where t.done_date is null
          and (t.deal_id = d.id or t.contact_id = any(d.contact_ids))
        order by t.due_date asc nulls last, t.id asc
        limit 1
    )                                                                                                                  as next_task_date,
    (
        select t.text from public.tasks t
        where t.done_date is null
          and (t.deal_id = d.id or t.contact_id = any(d.contact_ids))
        order by t.due_date asc nulls last, t.id asc
        limit 1
    )                                                                                                                  as next_task_text
from public.deals d
    left join public.contacts c on c.id = any(d.contact_ids)
    left join public.companies comp on comp.id = d.company_id
group by d.id, comp.name;
