-- Backfill of a migration that was applied directly to the remote project and
-- whose file never landed in this repository.
--
-- The remote `supabase_migrations.schema_migrations` table already records the
-- version `20260820120000`, and Supabase matches migrations by their leading
-- timestamp alone. Adding the file therefore changes nothing on the remote:
-- `supabase db push` sees the version as applied and skips it. The point is to
-- stop the repository lying about the production schema — until now
-- `supabase/schemas/01_tables.sql` had no `next_action` columns at all, so a
-- generated `supabase db diff` would have emitted `DROP COLUMN` for two live,
-- populated columns.
--
-- Production was inspected before writing this file. It has exactly:
--     deals.next_action       text
--     deals.next_action_date  date
-- and nothing else from that change — in particular there is no
-- `next_action_owner_id`. Do not add one here: this file must describe what is
-- deployed, not what the cockpit would like to consume.
--
-- Every statement is `if not exists` so replaying the file on a fresh database
-- (local reset, e2e instance, CI) reproduces production without ever failing,
-- and re-running it is a no-op. There is deliberately no DROP, no ALTER TYPE
-- and no data rewrite anywhere in this file.

-- The free-text next commercial action on an opportunity.
alter table public.deals
    add column if not exists next_action text;

-- Its due date. `date`, not `timestamptz`: the action is planned for a day, and
-- storing a timestamp would reintroduce the timezone drift that
-- `formatISODateString` exists to avoid.
alter table public.deals
    add column if not exists next_action_date date;

-- No view is rebuilt here. `deals_summary` selects `d.*`, so it picks both
-- columns up on its next rebuild — which is what the later
-- 20260820130000 and 20260820150000 migrations do. Rebuilding the view in this
-- file would be wrong anyway: on the remote this file never runs.
