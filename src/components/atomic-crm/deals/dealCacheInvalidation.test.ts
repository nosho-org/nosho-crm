import dealCreateSource from "./DealCreate.tsx?raw";
import dealEditSource from "./DealEdit.tsx?raw";
import dealListContentSource from "./DealListContent.tsx?raw";

/**
 * Guard against the invalidation bug of 2026-08-24.
 *
 * After a drag & drop the board invalidated only `["deals", "getList"]`. The
 * deal page and its edit form are fed by `getOne`, which stayed stale:
 * reopening a moved deal showed its previous stage, and saving wrote that stale
 * value back — silently undoing the move, and logging a bogus stage change now
 * that `deal_stage_history` records every transition.
 *
 * Asserting on the source rather than on a rendered board is deliberate. The
 * failure is a *missing* cache key: a component test would have to reproduce
 * react-query's whole invalidation machinery to notice it, whereas reading the
 * call sites is exactly what would have caught this.
 */

const WRITERS: [string, string][] = [
  // Drag & drop: stage change, and move to a custom view.
  ["DealListContent.tsx", dealListContentSource],
  // Creation, plus the reindexing of the target column.
  ["DealCreate.tsx", dealCreateSource],
  // The form behind "Modifier".
  ["DealEdit.tsx", dealEditSource],
];

describe("deal cache invalidation", () => {
  it.each(WRITERS)(
    "%s never invalidates getList alone",
    (_file: string, source: string) => {
      // Scoping to the list leaves the deal page and its form on stale data.
      expect(source).not.toContain('"deals", "getList"');
    },
  );

  it.each(WRITERS)(
    "%s invalidates the whole deals resource",
    (_file: string, source: string) => {
      expect(source).toContain('queryKey: ["deals"]');
    },
  );

  it("still watches every file that invalidates the deals cache", () => {
    // If one of these stops invalidating, the assertions above would pass
    // vacuously and the guard would quietly stop covering it.
    for (const [, source] of WRITERS) {
      expect(source).toContain("invalidateQueries");
    }
  });
});
