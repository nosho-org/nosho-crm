import type { Identifier } from "ra-core";

/**
 * ---------------------------------------------------------------------------
 * Reaching an opportunity's tasks (issue #114)
 * ---------------------------------------------------------------------------
 * A task reaches a deal two ways: directly through `tasks.deal_id`, or through
 * one of the deal's contacts. `deals_summary` has always queried both:
 *
 *     where t.done_date is null
 *       and (t.deal_id = d.id or t.contact_id = any(d.contact_ids))
 *
 * The deal page queried only the first one, and `deal_id` was NULL on all 129
 * production tasks — so every opportunity showed an empty task list while 96 of
 * them had a pending task attached through a contact. This module is the single
 * place the `or` is written on the front end, so the two halves cannot drift
 * apart again.
 *
 * `@or` is a ra-data-postgrest filter key; the keys inside it carry their own
 * `@operator`. See `applyFullTextSearch` in the Supabase data provider for the
 * other user of the same construct.
 */

export type DealTaskScope = "open" | "done";

export const buildDealTaskFilter = (
  dealId: Identifier,
  contactIds: readonly (Identifier | null | undefined)[] | null | undefined,
  scope: DealTaskScope = "open",
): Record<string, unknown> => {
  const done =
    scope === "open" ? { "done_date@is": null } : { "done_date@not.is": null };

  const ids = (contactIds ?? []).filter((id) => id != null);

  // An opportunity with no contact can only be reached the direct way. Emitting
  // the `or` anyway would serialize `contact_id=in.()`, which PostgREST rejects
  // with a 400 — the block would go empty instead of merely going shorter.
  if (ids.length === 0) {
    return { ...done, "deal_id@eq": dealId };
  }

  return {
    ...done,
    "@or": {
      "deal_id@eq": dealId,
      "contact_id@in": `(${ids.join(",")})`,
    },
  };
};
