-- Socle for the CRM v2 redesign (NOS-955 dashboard, NOS-956 board, NOS-957/958 deal page)
--
-- The three redesign workstreams run in parallel branches. Everything they all
-- need lands here first, so none of them has to edit the same block of
-- 01_tables.sql, types.ts or defaultConfiguration.ts.
--
-- Strictly additive: no column dropped, no row deleted, no constraint tightened
-- on existing data. Hand-written rather than generated, because
-- supabase/schemas/ does not declare the ten stored generated `*_search`
-- columns that exist in production — `supabase db diff` would emit DROP COLUMN
-- for every one of them. The declarative schema is realigned in the same commit.

-- ---------------------------------------------------------------------------
-- 1. Products (NOS-956 filter, NOS-957 header + synthesis, NOS-955 filter)
-- ---------------------------------------------------------------------------
--
-- A deal can carry several products at once (No-show + Entrant + Data), so this
-- is a set, not a single value. Stored as text[] rather than a join table for
-- the same reason `contact_ids bigint[]` already is: PostgREST filters arrays
-- natively (`products=ov.{no-show,entrant}` for the OR the spec asks for), and
-- a join table would force every list query through an extra embed.
--
-- NOT NULL with a '{}' default matters: `ov.` and `cs.` evaluate to NULL against
-- a NULL array and PostgREST drops the row, which would silently hide every
-- product-less deal from a filtered board.

alter table public.deals add column if not exists products text[] not null default '{}';

create index if not exists deals_products_idx on public.deals using gin (products);

-- ---------------------------------------------------------------------------
-- 2. Per-deal win probability (NOS-817, NOS-955 weighted pipeline)
-- ---------------------------------------------------------------------------
--
-- Nullable on purpose. NULL means "no exception recorded", and the weighting
-- cascade falls back to the stage probability configured in the settings. A
-- default of 0 would be read as "this deal is worth nothing", which is a very
-- different claim from "nobody has set a probability".

alter table public.deals add column if not exists probability smallint;

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'deals_probability_check'
    ) then
        alter table public.deals
            add constraint deals_probability_check
            check (probability is null or (probability >= 0 and probability <= 100));
    end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Next-action owner (NOS-957 §2)
-- ---------------------------------------------------------------------------
--
-- The spec asks for a specific owner on the action, defaulting to the deal
-- owner. `sales_id` cannot carry both: reassigning a deal would silently
-- reassign every pending action with it. Left NULL when it matches the deal
-- owner, so the fallback stays `sales_id` and no backfill is needed.

alter table public.deals add column if not exists next_action_owner_id bigint;

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'deals_next_action_owner_id_fkey'
    ) then
        alter table public.deals
            add constraint deals_next_action_owner_id_fkey
            foreign key (next_action_owner_id) references public.sales(id) on delete set null;
    end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Legacy category (NOS-956 §6)
-- ---------------------------------------------------------------------------
--
-- Same contract as `legacy_stage`: the pre-migration value is kept so the
-- category mapping stays reversible and the historical label stays resolvable.
-- The category migration itself is in 20260823093000.

alter table public.deals add column if not exists legacy_category text;

-- ---------------------------------------------------------------------------
-- 5. Indexes for the new filters
-- ---------------------------------------------------------------------------
--
-- `stage` backs the kanban columns and the dashboard funnel;
-- `expected_closing_date` backs the period filter and the revenue forecast;
-- `next_action_date` backs the "overdue action" pipeline-health alert.

create index if not exists deals_stage_idx on public.deals using btree (stage);
create index if not exists deals_expected_closing_date_idx on public.deals using btree (expected_closing_date);
create index if not exists deals_next_action_date_idx on public.deals using btree (next_action_date);
