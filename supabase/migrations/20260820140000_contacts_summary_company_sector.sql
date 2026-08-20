-- Issue #97 — establishment-typology pictogram on the Contacts list
--
-- The typology of an establishment (hôpital, cabinet dentaire, imagerie,
-- clinique esthétique…) is `companies.sector`. The Companies list already gets
-- it for free through `companies_summary` (`c.*`), but the Contacts list reads
-- `contacts_summary`, which only carries the company *name*. Expose the sector
-- too so the list can render the pictogram without an extra request per row.
--
-- DROP+CREATE (not CREATE OR REPLACE) because `co.*` now also expands
-- `contacts._sync_origin`, added after the view was last rebuilt in
-- 20260416120000_search_strip_spaces.sql; inserting a column mid-list is
-- rejected as a column rename. Same pattern as that migration.
drop view if exists public.contacts_summary;

create view public.contacts_summary with (security_invoker = on) as
select
    co.*,
    c.name                                                                    as company_name,
    replace(lower(immutable_unaccent(coalesce(c.name, ''))), ' ', '')         as company_name_search,
    c.sector                                                                  as company_sector,
    jsonb_path_query_array(co.email_jsonb, '$[*].email')::text                as email_fts,
    jsonb_path_query_array(co.phone_jsonb, '$[*].number')::text               as phone_fts,
    count(distinct t.id) filter (where t.done_date is null)                   as nb_tasks
from public.contacts co
    left join public.tasks t     on co.id = t.contact_id
    left join public.companies c on co.company_id = c.id
group by co.id, c.name, c.sector;

-- Restore the exact grants the DROP removed. `anon` keeps the SELECT it was
-- given in 20260416120000_search_strip_spaces.sql: this is the status quo, not
-- a widening. The grant is inert anyway — the view is security_invoker, so the
-- restrictive `deny_anon_all` policy on `public.contacts` still blocks anon.
grant all on table public.contacts_summary to authenticated;
grant all on table public.contacts_summary to service_role;
grant select on table public.contacts_summary to anon;
