import dealEditSource from "./DealEdit.tsx?raw";
import dealShowPageSource from "./show/DealShowPage.tsx?raw";

/**
 * An opportunity is archived, never deleted.
 *
 * `DealEdit` used to carry a `<DeleteButton />` next to "Back to deal" — one
 * click from a permanent delete, with the reversible archive sitting on the
 * page behind it. Every child row cascades: `deal_notes`, `call_logs`, `tasks`
 * and `deal_change_log`. The audit journal added in #114 is worth nothing if
 * the thing it documents can be erased along with it.
 *
 * Asserted on the source, like `dealCacheInvalidation.test.ts`: the failure is
 * a component *being present*, which is exactly what reading the call site
 * catches and what a render test would have to know to look for.
 */

describe("deal deletion", () => {
  it("offers no hard delete on the edit form", () => {
    expect(dealEditSource).not.toContain("<DeleteButton");
  });

  it("does not import the delete button either", () => {
    // A dangling import is how the button comes back by accident.
    expect(dealEditSource).not.toContain("delete-button");
  });

  it("still offers archiving, which is what replaces it", () => {
    // If this ever stops being true, removing the delete button left users
    // with no way at all to retire an opportunity.
    expect(dealShowPageSource).toContain("DealArchiveButton");
  });
});
