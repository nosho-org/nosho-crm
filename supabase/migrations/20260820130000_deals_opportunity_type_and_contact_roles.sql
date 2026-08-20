-- Timestamp note: this migration is numbered 20260820130000, not
-- 20260820120000, because the remote database already has a
-- `20260820120000_deals_next_action` migration whose file never landed on
-- `main`. Supabase tracks migrations by their leading timestamp alone, so
-- reusing 20260820120000 would make the remote consider this file already
-- applied and silently skip it — the exact failure documented in
-- 20260409120000_deals_summary_view.sql. Keep this file strictly after it.
--
-- Issue #95 — "Type d'opportunité" (Nouveau client / Extension / Renouvellement)
--
-- This is a property of the DEAL, not of the company: the very point of the
-- field is that one company produces a new-client deal first, then an
-- extension, then a renewal. It therefore lives on `deals`, next to — and
-- deliberately distinct from — `deals.company_type`, which only decides which
-- pipeline view a deal shows up in.
alter table public.deals
    add column if not exists opportunity_type text;

-- Issue #99 — decision-making role of each contact on a deal
--
-- The role (Décideur / Influenceur / Opérationnel) qualifies the DEAL↔CONTACT
-- relation, not the contact itself: the same person can be the decision maker
-- on one opportunity and a mere influencer on another. Deal membership is
-- already denormalised into `deals.contact_ids`, so the role is stored next to
-- it as a `{"<contact_id>": "<role>"}` map instead of in a separate join table.
-- That keeps a single source of truth for membership and leaves every existing
-- pipeline query (`c.id = any(d.contact_ids)`) untouched.
--
-- Defaulting to '{}' means every existing deal keeps its contacts, simply with
-- no role assigned yet — no data is rewritten.
alter table public.deals
    add column if not exists contact_roles jsonb not null default '{}'::jsonb;

-- Refresh deals_summary so the frontend (which reads deals through this view,
-- see providers/supabase/dataProvider.ts getOne/getList) sees the new columns.
--
-- Must DROP+CREATE rather than CREATE OR REPLACE: `d.*` inserts the two new
-- columns in the middle of the select list, which Postgres rejects as a column
-- rename. Same pattern as 20260421120000_add_proposal_urls.sql.
--
-- Keep the `d.*` wildcard. It is what makes this rebuild safe against columns
-- that exist on the remote `deals` table but not in this repo — today the ones
-- added by the unmerged 20260820120000_deals_next_action. Spelling the columns
-- out would silently drop them from the view.
drop view if exists public.deals_summary;

create view public.deals_summary with (security_invoker = on) as
select
    d.*,
    comp.name                                                                                                          as company_name,
    replace(lower(immutable_unaccent(coalesce(comp.name, ''))), ' ', '')                                                as company_name_search,
    coalesce(string_agg((c.first_name || ' ' || c.last_name), ' '), '')                                                as contact_names,
    replace(lower(immutable_unaccent(coalesce(string_agg((c.first_name || ' ' || c.last_name), ' '), ''))), ' ', '')    as contact_names_search
from public.deals d
    left join public.contacts c on c.id = any(d.contact_ids)
    left join public.companies comp on comp.id = d.company_id
group by d.id, comp.name;

-- Restore the grants the DROP removed, identical to the pre-migration state:
-- authenticated + service_role only, never anon (see
-- 20260408120000_enforce_rls_security.sql).
revoke all on table public.deals_summary from anon;
grant all on table public.deals_summary to authenticated;
grant all on table public.deals_summary to service_role;
