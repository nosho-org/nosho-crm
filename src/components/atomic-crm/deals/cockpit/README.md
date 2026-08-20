# Cockpit Opportunités

Presentation layer and queries for the Opportunités screen: revenue banner,
monthly/quarterly forecast, filters, dense list, and the priority / next action
/ inactivity signals on the board cards.

Covers issues #92, #93, #94, #96 and #101 (NOS-802, NOS-814, NOS-818, NOS-823).

## Contract with the Socle pipeline/données workspace

This branch **ships no migration and adds no business field**. The `deals`
schema belongs to the Socle workspace. Everything the cockpit reads goes through
`dealFields.ts`, which declares the columns it is waiting for as an optional
interface:

| Field                  | Used by                                   | Today, without the column          |
| ---------------------- | ----------------------------------------- | ---------------------------------- |
| `priority`             | badge, sort, filter (issue #93)           | "Non définie", filterable as unset |
| `next_action`          | card + list cell (issues #92, #101)       | "À définir" from the Qualifié step |
| `next_action_date`     | due/overdue status                        | "Sans date"                        |
| `next_action_owner_id` | owner shown on card and row               | falls back to `sales_id` (real)    |
| `probability`          | weighted revenue                          | falls back to the stage setting    |
| `deal_type`            | type column and filter                    | falls back to `company_type`       |
| `last_activity_at`     | inactivity alert (issue #94)              | falls back to `updated_at`         |

**To rebase once the columns land:** delete `DealPipelineFields`, type the
adapters against `Deal`, and move the `priority` / `deal_type` facets from
`dealFilters.ts` to the server-side `filter` in `DealList.tsx`. No component
changes.

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
