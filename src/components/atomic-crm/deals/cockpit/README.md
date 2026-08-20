# Cockpit Opportunités

Presentation layer and queries for the Opportunités screen: revenue banner,
monthly/quarterly forecast, filters, dense list, and the priority / next action
/ inactivity signals on the board cards.

Covers issues #92, #93, #94, #96 and #101 (NOS-802, NOS-814, NOS-818, NOS-823).

## Contract with the Socle pipeline/données workspace

The cockpit **adds no business field and ships no migration of its own**.
Everything it reads goes through `dealFields.ts`. As of this release the schema
has settled, so the table below records what is real and what is not.

Real columns, read directly off `Deal`:

| Field               | Used by                             |
| ------------------- | ----------------------------------- |
| `priority`          | badge, sort, facet (issue #93)      |
| `opportunity_type`  | type column and facet               |
| `next_action`       | card + list cell (issues #92, #101) |
| `next_action_date`  | due/overdue status                  |

Fields the cockpit reads that **production does not have**. None is being
invented; each degrades explicitly and says so in its result:

| Field                  | Used by                     | Degradation                        |
| ---------------------- | --------------------------- | ---------------------------------- |
| `next_action_owner_id` | owner on card and row       | falls back to `sales_id` (real)    |
| `probability`          | weighted revenue            | stage facts → stage setting → *unweighted* |
| `last_activity_at`     | inactivity alert (issue #94) | falls back to `updated_at` → `created_at` |

**Nothing above is ever sent to PostgREST.** Server-side filtering is limited to
`sales_id`, `category` and the `expected_closing_date` period bounds; sorting is
computed client-side in `dealSort.ts`; no query selects an explicit column list.
Selecting or filtering a missing column would 400 the whole list.

**If those three columns ever land:** delete `DealPipelineFields`, type the
adapters against `Deal`, and optionally move the `priority` / `type` facets from
`dealFilters.ts` to a server-side `filter` — see the caveat in that file's
header. No component changes.

## Rules the tests enforce

- **Priority is never a probability.** `dealWeighting.ts` does not read
  `priority`; `dealWeighting.test.ts` asserts two deals differing only by
  priority weigh the same and land in the same at-risk state.
- **One next action datum.** `getDealNextAction` is the only source of the
  action, its date and its owner; the card and the row render the same
  component over it.
- **Periods are `expected_closing_date`, only.** `dealPeriods.ts` produces the
  PostgREST bounds; nothing buckets on `won_at` or `updated_at`.
- **Missing data is stated, not zeroed.** Current recurring revenue has no
  source in this schema and is reported as unavailable; an unweighted deal
  contributes `null`, never `0`; deals with no closing date are counted out of
  the forecast rather than dropped.
- **Local dates.** `dealDates.ts` parses `date` columns in local time, so a deal
  closing on the 1st is never bucketed in the previous month.

## Settings

`Paramètres › Opportunités › Pilotage` holds the inactivity threshold (14 days
by default, issue #94), the stage that makes a next action mandatory
(`qualified`, issue #92) and the per-stage win probabilities. Probabilities are
empty by default: until they are set, the weighted figures say so instead of
showing a made-up forecast.
