-- Pipeline v2: seven commercial stages (NOS-956)
--
--   Lead -> Qualifié -> Démo/POC -> Proposition -> Négociation -> Close Won -> Lost
--
-- Applies the nine safety rules the spec spells out: full snapshot first, the
-- pre-migration stage kept in `legacy_stage`, automatic mapping only where the
-- correspondence is certain, everything else parked in an "À reclasser" queue
-- with no guessing, and a blocking assertion that the deal count and the total
-- ARR are byte-identical before and after.
--
-- Hand-written. `supabase db diff` is unusable on this project: the ten stored
-- generated `*_search` columns live in production but are not declared in
-- supabase/schemas/, so a generated diff emits DROP COLUMN for each of them.
--
-- Reconnaissance run against production on 2026-08-23 (232 deals, 1 840 131 €
-- ARR) informs every mapping decision below. Three findings drive the shape of
-- this file:
--
--   1. The stored configuration holds NINETEEN stages, not the eight in
--      defaultConfiguration.ts. `d-mo-rdv` is labelled "Démo booked",
--      `poc-lanc` is "POC lancé", and both `proposition-a-envoyer` and
--      `proposition-envoy-e` exist. The spec's mapping table names the labels,
--      not these slugs.
--   2. `dealPipelineStatuses` is `["closed-won"]`. `perdu` (59 deals,
--      415 770 €) and `churn` are therefore counted as OPEN pipeline today.
--      Fixed here.
--   3. Twenty-seven deals sit in the investisseur / partenaire custom views.
--      `getCommercialDealsFilter` already keeps them out of the commercial
--      board, and their stages belong to those views. They are NOT migrated.

-- ---------------------------------------------------------------------------
-- 1. Snapshot (rule 1)
-- ---------------------------------------------------------------------------
--
-- `private` is not exposed by PostgREST, so these tables are invisible to the
-- API while remaining queryable for the verification and rollback scripts.

create schema if not exists private;

drop table if exists private.deals_backup_20260823;
create table private.deals_backup_20260823 as select * from public.deals;

drop table if exists private.configuration_backup_20260823;
create table private.configuration_backup_20260823 as select * from public.configuration;

-- ---------------------------------------------------------------------------
-- 2. The mapping table (rules 3 and 7)
-- ---------------------------------------------------------------------------
--
-- Kept as a table rather than inlined in a CASE so the decisions stay auditable
-- after the fact, and so the reclassification screen can show a deal's origin.

create table if not exists public.deal_migration_map (
    old_stage text primary key,
    new_stage text,
    -- false => park in "à reclasser" and let a human decide. Never guess.
    is_certain boolean not null default false,
    -- Why the row was mapped this way, shown in the reclassification screen.
    note text
);

alter table public.deal_migration_map enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'deal_migration_map'
          and policyname = 'deal_migration_map_select'
    ) then
        create policy deal_migration_map_select on public.deal_migration_map
            for select to authenticated using (true);
    end if;
end
$$;

revoke all on table public.deal_migration_map from anon;
grant all on table public.deal_migration_map to authenticated;
grant all on table public.deal_migration_map to service_role;

insert into public.deal_migration_map (old_stage, new_stage, is_certain, note) values
    -- Unchanged slugs: same commercial meaning, no row is rewritten.
    ('lead',                  'lead',       true,  'Slug inchangé'),
    ('qualified',             'qualified',  true,  'Slug inchangé'),
    ('closed-won',            'closed-won', true,  'Slug inchangé'),
    ('churn',                 'churn',      true,  'Conservé hors kanban, toujours compté en ARR perdu'),
    -- Renamed, one-to-one.
    ('perdu',                 'lost',       true,  'Renommage Perdu -> Lost'),
    -- "Démo booked" and "POC lancé" both land on Démo/POC per the spec table.
    ('d-mo-rdv',              'demo-poc',   true,  'Libellé "Démo booked" ; accent mal encodé à la création'),
    ('poc-lanc',              'demo-poc',   true,  'Libellé "POC lancé"'),
    -- The spec table maps "Proposition à envoyer" and "Proposition envoyée"
    -- onto a single "Proposition" stage, both marked Auto. It is a lossy merge,
    -- but it is the client's explicit instruction, so it stays automatic.
    ('proposition-a-envoyer', 'proposal',   true,  'Fusion demandée par la spec'),
    ('proposition-envoy-e',   'proposal',   true,  'Fusion demandée par la spec'),
    -- Orphan slug: produced by 20260820150000 (trial -> proposal-to-send) but
    -- never added to the stored configuration. Same meaning as the two above.
    ('proposal-to-send',      'proposal',   true,  'Slug orphelin issu de la migration 20260820150000'),
    -- Stages already retired by 20260820150000, kept here so a row that somehow
    -- still carries one is handled rather than parked.
    ('follow-up',             'qualified',  true,  'Retirée en 20260820150000'),
    ('trial',                 'proposal',   true,  'Retirée en 20260820150000'),
    ('trial-failed',          'lost',       true,  'Retirée en 20260820150000'),
    ('declined',              'lost',       true,  'Retirée en 20260820150000'),
    -- No certain target. Parked, never guessed.
    ('logiciels-brique',      null,         false, 'Ancienne colonne kanban sans équivalent commercial'),
    ('opportunity',           null,         false, 'Slug hérité du jeu de démo Atomic CRM')
on conflict (old_stage) do nothing;

-- Anything present in production but absent from the table above is ambiguous
-- by construction. Recorded rather than silently swept into the first column.
insert into public.deal_migration_map (old_stage, new_stage, is_certain, note)
select distinct d.stage, null, false,
       'Valeur trouvée en base sans correspondance déclarée'
from public.deals d
where d.stage is not null
  and not exists (select 1 from public.deal_migration_map m where m.old_stage = d.stage)
on conflict (old_stage) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Stage switchover (rules 2, 4, 5)
-- ---------------------------------------------------------------------------
--
-- Two passes, because "commercial deal" is the wrong axis on its own.
--
-- A certain mapping is a rename that means the same thing on every board:
-- `perdu` -> `lost` is still a lost deal whether the opportunity sits in the
-- commercial pipeline or in the investisseur view. Production has exactly one
-- such row (deal 108, "Strong Hands", investisseur, 30 000 €); skipping it
-- would strand a `perdu` value that no longer exists in the referential.
--
-- An *uncertain* stage is different. `invest`, `partenariats`, `ressources` and
-- `communication-presse` are columns of the custom boards, not leftovers of the
-- commercial pipeline — rewriting them would empty two working views to fix a
-- third. The same slug on a deal with no custom view, though, is a genuine
-- anomaly and goes to the queue.
--
-- `legacy_stage` is never overwritten (coalesce): a row already migrated by
-- 20260820150000 keeps its original pre-v1 value, so the full chain stays
-- reversible.

-- Pass 1 — certain renames, applied everywhere.
update public.deals d
set legacy_stage = coalesce(d.legacy_stage, d.stage),
    stage        = m.new_stage
from public.deal_migration_map m
where m.old_stage = d.stage
  and m.new_stage is not null
  and m.new_stage is distinct from d.stage;

-- Pass 2 — no certain target. Park it, unless it is a custom-view column.
update public.deals d
set legacy_stage = coalesce(d.legacy_stage, d.stage),
    stage        = 'a-reclasser'
where d.stage <> 'a-reclasser'
  and not exists (
      select 1 from public.deal_migration_map m
      where m.old_stage = d.stage and m.new_stage is not null
  )
  and coalesce(d.company_type, '') not in (
      'investisseur', 'investisseurs',
      'partenaire', 'partenaires', 'partenariat', 'partenariats',
      'ressource', 'ressources', 'presse',
      'leads-santexpo', 'lead-santexpo', 'santexpo',
      'logiciels-brique', 'logiciel-brique', 'logiciels-briques'
  );

-- ---------------------------------------------------------------------------
-- 4. Categories, 20 -> 7 (rule 5 applied to categories)
-- ---------------------------------------------------------------------------
--
-- Production holds four values, all residue from the upstream Atomic CRM demo
-- fixture (print-project, ui-design, other, copywriting), and 160 of 232 deals
-- have none at all. Not one of the twenty healthcare categories is in use, so
-- there is nothing to map: the demo values are parked and a human clears them.
--
-- NULL categories stay NULL. "No category" is not "ambiguous category", and
-- turning 160 empty fields into a reclassification backlog would invent work.

update public.deals
set legacy_category = coalesce(legacy_category, category),
    category        = 'a-reclasser'
where category is not null
  and btrim(category) <> ''
  and category not in (
      'hopital', 'imagerie', 'dentaire', 'clinique', 'esthetique', 'cabinet', 'autre'
  );

-- ---------------------------------------------------------------------------
-- 5. Configuration document
-- ---------------------------------------------------------------------------
--
-- `||` merges at the top level, so keys not named here are preserved. That
-- matters: the stored document is missing dealPriorities, dealContactRoles and
-- dealOpportunityTypes because SettingsPage.transform rebuilds the config
-- field by field and drops everything it does not list. The three are restored
-- below, and the transform itself is fixed in the same commit.

update public.configuration
set config = config || jsonb_build_object(

    -- The seven commercial stages, plus the reclassification queue in front and
    -- churn at the back. Churn stays a stage: it is terminal and still counted
    -- in lost ARR, it is only hidden from the board.
    'dealStages', jsonb_build_array(
        jsonb_build_object('value', 'a-reclasser', 'label', 'À reclasser'),
        jsonb_build_object('value', 'lead',        'label', 'Lead'),
        jsonb_build_object('value', 'qualified',   'label', 'Qualifié'),
        jsonb_build_object('value', 'demo-poc',    'label', 'Démo / POC'),
        jsonb_build_object('value', 'proposal',    'label', 'Proposition'),
        jsonb_build_object('value', 'negociation', 'label', 'Négociation'),
        jsonb_build_object('value', 'closed-won',  'label', 'Close Won'),
        jsonb_build_object('value', 'lost',        'label', 'Lost'),
        jsonb_build_object('value', 'churn',       'label', 'Churn')
    ),

    -- Retired stages keep their labels so historical values stay readable:
    -- `legacy_stage` on a migrated deal, and the `visibleStages` of the
    -- investisseur / partenaire custom views, which still point here.
    'archivedDealStages', jsonb_build_array(
        jsonb_build_object('value', 'logiciels-brique',      'label', 'Logiciels (brique)'),
        jsonb_build_object('value', 'declined',              'label', 'Décliné'),
        jsonb_build_object('value', 'follow-up',             'label', 'Follow up'),
        jsonb_build_object('value', 'trial',                 'label', 'Essai'),
        jsonb_build_object('value', 'trial-failed',          'label', 'Essai échoué'),
        jsonb_build_object('value', 'd-mo-rdv',              'label', 'Démo booked'),
        jsonb_build_object('value', 'poc-lanc',              'label', 'POC lancé'),
        jsonb_build_object('value', 'proposition-a-envoyer', 'label', 'Proposition à envoyer'),
        jsonb_build_object('value', 'proposition-envoy-e',   'label', 'Proposition envoyée'),
        jsonb_build_object('value', 'proposal-to-send',      'label', 'Proposition à envoyer (ancien slug)'),
        jsonb_build_object('value', 'perdu',                 'label', 'Perdu'),
        jsonb_build_object('value', 'opportunity',           'label', 'Opportunity'),
        jsonb_build_object('value', 'partenariats',          'label', 'Partenariats'),
        jsonb_build_object('value', 'ressources',            'label', 'Ressources'),
        jsonb_build_object('value', 'invest',                'label', 'Invests potentiel'),
        jsonb_build_object('value', 'communication-presse',  'label', 'Communication / presse'),
        jsonb_build_object('value', 'invests-actifs',        'label', 'Invests actifs')
    ),

    -- Was ["closed-won"], which counted 59 lost deals (415 770 €) and 3 churned
    -- ones as open pipeline. Every weighted figure in the cockpit was inflated
    -- by that amount.
    'dealPipelineStatuses', jsonb_build_array('closed-won', 'lost', 'churn'),

    -- Seeded so the weighted pipeline and the forecast's violet series have
    -- something to show on day one. Terminal stages are deliberately absent:
    -- won and lost are facts, not forecasts, and the weighting cascade handles
    -- them before it ever reads this map.
    'dealStageProbabilities', jsonb_build_object(
        'lead',        10,
        'qualified',   30,
        'demo-poc',    50,
        'proposal',    70,
        'negociation', 85
    ),

    'dealCategories', jsonb_build_array(
        jsonb_build_object('value', 'a-reclasser', 'label', 'À reclasser'),
        jsonb_build_object('value', 'hopital',     'label', 'Hôpital'),
        jsonb_build_object('value', 'imagerie',    'label', 'Imagerie'),
        jsonb_build_object('value', 'dentaire',    'label', 'Dentaire'),
        jsonb_build_object('value', 'clinique',    'label', 'Clinique'),
        jsonb_build_object('value', 'esthetique',  'label', 'Esthétique'),
        jsonb_build_object('value', 'cabinet',     'label', 'Cabinet'),
        jsonb_build_object('value', 'autre',       'label', 'Autre')
    ),

    'dealProducts', jsonb_build_array(
        jsonb_build_object('value', 'no-show', 'label', 'No-show'),
        jsonb_build_object('value', 'entrant', 'label', 'Entrant'),
        jsonb_build_object('value', 'data',    'label', 'Data')
    ),

    -- Labels only. The slugs keep the values the CHECK constraint and the
    -- generated `priority_rank` column already enforce, so no row is rewritten
    -- and no constraint is touched.
    'dealPriorities', jsonb_build_array(
        jsonb_build_object('value', 'urgent',    'label', 'P0 Critique', 'dotClassName', 'bg-red-500',              'weight', 2),
        jsonb_build_object('value', 'important', 'label', 'P1 Élevée',   'dotClassName', 'bg-orange-500',           'weight', 1),
        jsonb_build_object('value', 'normal',    'label', 'P2 Normale',  'dotClassName', 'bg-muted-foreground/40',  'weight', 0)
    ),

    'dealContactRoles', jsonb_build_array(
        jsonb_build_object('value', 'decideur',     'label', 'Décideur'),
        jsonb_build_object('value', 'influenceur',  'label', 'Influenceur'),
        jsonb_build_object('value', 'prescripteur', 'label', 'Prescripteur'),
        jsonb_build_object('value', 'utilisateur',  'label', 'Utilisateur')
    ),

    -- `operationnel` has no obvious equivalent among the five new roles, and
    -- "Utilisateur" would be a guess. Archived so already-saved values keep
    -- resolving; the next person to edit the deal picks from the new list.
    'archivedDealContactRoles', jsonb_build_array(
        jsonb_build_object('value', 'operationnel', 'label', 'Opérationnel (retiré)')
    ),

    -- PJ1 labels the slug `extension` as "Upsell". Label change only.
    'dealOpportunityTypes', jsonb_build_array(
        jsonb_build_object('value', 'nouveau-client',  'label', 'Nouveau client'),
        jsonb_build_object('value', 'extension',       'label', 'Upsell'),
        jsonb_build_object('value', 'renouvellement',  'label', 'Renouvellement')
    ),

    -- Dashboard KPI target, in euros per month (NOS-955).
    'mrrTarget', 25000
)
where id = 1;

-- Custom views still reference retired stages in `visibleStages`. The labels
-- resolve through `archivedDealStages`, so nothing is rewritten here — but any
-- slug that never existed in the configuration is dropped, since it can only
-- ever render an empty unnamed column.
update public.configuration
set config = jsonb_set(config, '{customViews}', (
        select jsonb_agg(
            case
                when view ? 'visibleStages' then jsonb_set(view, '{visibleStages}', (
                    select coalesce(jsonb_agg(stage), '[]'::jsonb)
                    from jsonb_array_elements_text(view->'visibleStages') as stage
                    where stage in (
                        select jsonb_array_elements(config->'dealStages')->>'value' from public.configuration where id = 1
                        union
                        select jsonb_array_elements(config->'archivedDealStages')->>'value' from public.configuration where id = 1
                    )
                ))
                else view
            end
        )
        from jsonb_array_elements(config->'customViews') as view
    ))
where id = 1
  and jsonb_array_length(coalesce(config->'customViews', '[]'::jsonb)) > 0;

-- ---------------------------------------------------------------------------
-- 6. Verification (rule 8) — blocking
-- ---------------------------------------------------------------------------
--
-- scripts/supabase-push.sh sends each migration file as a single request to the
-- Management API, so it runs in an implicit transaction: a raise here rolls the
-- whole file back AND leaves the version unrecorded. That is what makes rule 8
-- enforceable rather than advisory.
--
-- The assertions compare against the snapshot rather than hard-coded totals, so
-- they hold on a local database seeded with different fixtures.

do $$
declare
    v_nb_before     bigint;
    v_nb_after      bigint;
    v_arr_before    numeric;
    v_arr_after     numeric;
    v_vanished      bigint;
    v_side_effects  bigint;
    v_orphans       bigint;
    v_parked        bigint;
begin
    select count(*), coalesce(sum(amount), 0)
      into v_nb_before, v_arr_before
      from private.deals_backup_20260823;

    select count(*), coalesce(sum(amount), 0)
      into v_nb_after, v_arr_after
      from public.deals;

    if v_nb_before <> v_nb_after then
        raise exception 'Pipeline v2 : le nombre d''opportunités a changé (avant %, après %)',
            v_nb_before, v_nb_after;
    end if;

    if v_arr_before is distinct from v_arr_after then
        raise exception 'Pipeline v2 : l''ARR total a changé (avant %, après %)',
            v_arr_before, v_arr_after;
    end if;

    select count(*) into v_vanished
      from private.deals_backup_20260823 b
      where not exists (select 1 from public.deals d where d.id = b.id);

    if v_vanished > 0 then
        raise exception 'Pipeline v2 : % opportunité(s) ont disparu', v_vanished;
    end if;

    -- This migration may only touch stage, legacy_stage, category and
    -- legacy_category. Anything else moving means a trigger fired where it
    -- should not have.
    select count(*) into v_side_effects
      from public.deals d
      join private.deals_backup_20260823 b on b.id = d.id
      where d.amount      is distinct from b.amount
         or d.won_at      is distinct from b.won_at
         or d.company_id  is distinct from b.company_id
         or d.sales_id    is distinct from b.sales_id
         or d.contact_ids is distinct from b.contact_ids
         or d.archived_at is distinct from b.archived_at
         or d.index       is distinct from b.index;

    if v_side_effects > 0 then
        raise exception 'Pipeline v2 : % opportunité(s) modifiées hors du périmètre étape/catégorie',
            v_side_effects;
    end if;

    -- A stage that resolves neither in dealStages nor archivedDealStages falls
    -- into getDealsByStage's silent "first column" fallback: the deal is still
    -- in the database but is displayed under a label that is not its own.
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
        raise exception 'Pipeline v2 : % opportunité(s) portent une étape hors référentiel', v_orphans;
    end if;

    select count(*) into v_parked from public.deals where stage = 'a-reclasser';
    raise notice 'Pipeline v2 : % opportunités migrées, % en file "À reclasser"',
        v_nb_after, v_parked;
end
$$;
