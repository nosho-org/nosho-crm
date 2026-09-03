--
-- Views
-- This file declares all views in the public schema.
--

create or replace view public.activity_log with (security_invoker = on) as
select
    ('company.' || c.id || '.created') as id,
    'company.created' as type,
    c.created_at as date,
    c.id as company_id,
    c.sales_id,
    to_json(c.*) as company,
    null::json as contact,
    null::json as deal,
    null::json as contact_note,
    null::json as deal_note
from public.companies c
union all
select
    ('contact.' || co.id || '.created') as id,
    'contact.created' as type,
    co.first_seen as date,
    co.company_id,
    co.sales_id,
    null::json as company,
    to_json(co.*) as contact,
    null::json as deal,
    null::json as contact_note,
    null::json as deal_note
from public.contacts co
union all
select
    ('contactNote.' || cn.id || '.created') as id,
    'contactNote.created' as type,
    cn.date,
    co.company_id,
    cn.sales_id,
    null::json as company,
    null::json as contact,
    null::json as deal,
    to_json(cn.*) as contact_note,
    null::json as deal_note
from public.contact_notes cn
    left join public.contacts co on co.id = cn.contact_id
union all
select
    ('deal.' || d.id || '.created') as id,
    'deal.created' as type,
    d.created_at as date,
    d.company_id,
    d.sales_id,
    null::json as company,
    null::json as contact,
    to_json(d.*) as deal,
    null::json as contact_note,
    null::json as deal_note
from public.deals d
union all
select
    ('dealNote.' || dn.id || '.created') as id,
    'dealNote.created' as type,
    dn.date,
    d.company_id,
    dn.sales_id,
    null::json as company,
    null::json as contact,
    null::json as deal,
    null::json as contact_note,
    to_json(dn.*) as deal_note
from public.deal_notes dn
    left join public.deals d on d.id = dn.deal_id;

create or replace view public.companies_summary with (security_invoker = on) as
select
    c.*,
    count(distinct d.id) as nb_deals,
    count(distinct co.id) as nb_contacts,
    -- Scalar subqueries, not joins: a join here would multiply the rows feeding
    -- the two count(distinct) above.
    (select p.name from public.companies p where p.id = c.parent_company_id)   as parent_company_name,
    (select count(*) from public.companies s where s.parent_company_id = c.id) as nb_subsidiaries
from public.companies c
    left join public.deals d on c.id = d.company_id
    left join public.contacts co on c.id = co.company_id
group by c.id;

create or replace view public.contacts_summary with (security_invoker = on) as
select
    co.*,
    c.name                                                                    as company_name,
    replace(lower(immutable_unaccent(coalesce(c.name, ''))), ' ', '')         as company_name_search,
    -- Establishment typology, used to render the sector pictogram in the
    -- Contacts list without one extra request per row.
    c.sector                                                                  as company_sector,
    jsonb_path_query_array(co.email_jsonb, '$[*].email')::text                as email_fts,
    jsonb_path_query_array(co.phone_jsonb, '$[*].number')::text               as phone_fts,
    count(distinct t.id) filter (where t.done_date is null)                   as nb_tasks
from public.contacts co
    left join public.tasks t    on co.id = t.contact_id
    left join public.companies c on co.company_id = c.id
group by co.id, c.name, c.sector;

create or replace view public.deals_summary with (security_invoker = on) as
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
    -- L email des contacts, mis a plat (NOS-1235). La sous-requete est
    -- correlee au contact de la jointure : un jsonb_array_elements dans le
    -- FROM multiplierait les lignes et repeterait chaque nom autant de fois
    -- que le contact a d adresses.
    coalesce(string_agg((select string_agg(e.value ->> 'email', ' ') from jsonb_array_elements(coalesce(c.email_jsonb, '[]'::jsonb)) e), ' '), '')  as contact_emails,
    replace(lower(immutable_unaccent(coalesce(string_agg((select string_agg(e.value ->> 'email', ' ') from jsonb_array_elements(coalesce(c.email_jsonb, '[]'::jsonb)) e), ' '), ''))), ' ', '') as contact_emails_search,
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
    -- `deals.next_action`/`next_action_date` are columns someone has to type
    -- into, and nobody ever has: 0 of 215 opportunities carried one in
    -- production while 100 pending tasks existed. The sales team records its
    -- next steps as tasks, so that is where the list must read them from.
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

-- `deal_stage_history` was a table until 20260825120000. It is now a projection
-- of the generic journal, filtered on the single field it ever carried. Kept
-- under its original name and shape so the deal page's right column, the
-- FakeRest demo generator and any external reader keep working unchanged.
--
-- Nothing writes here: `deal_change_log` has one writer, and it is a trigger.
--
-- `#>> '{}'` unwraps a jsonb scalar to unquoted text and yields NULL for both a
-- SQL NULL and a `'null'::jsonb`, so `from_stage` stays NULL on a creation row
-- and the timeline still reads "Étape initiale : X".
create or replace view public.deal_stage_history with (security_invoker = on) as
select
    l.id,
    l.deal_id,
    l.old_value #>> '{}' as from_stage,
    l.new_value #>> '{}' as to_stage,
    l.changed_at,
    l.changed_by,
    l.source
from public.deal_change_log l
where l.field = 'stage';

create or replace view public.init_state with (security_invoker = off) as
select count(sub.id) as is_initialized
from (
    select sales.id from public.sales limit 1
) sub;
