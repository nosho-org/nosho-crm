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

/**
 * The `queryKey` literal of every `invalidateQueries(` call in a file.
 *
 * Scoped to `invalidateQueries` on purpose. The first version of this guard
 * banned the string `"deals", "getList"` anywhere in the file, which conflates
 * *invalidating* with *writing to* the cache — two operations with opposite
 * requirements. Invalidation wants the widest key; `setQueriesData` carries an
 * updater and must only ever reach the shapes that updater understands. Banning
 * the literal outright pushed the fix for issue #115 towards the wrong side.
 */
const invalidatedKeys = (source: string): string[] =>
  [
    ...source.matchAll(
      /invalidateQueries\(\s*\{[^}]*queryKey:\s*(\[[^\]]*\])/g,
    ),
  ].map(([, key]) => key.replace(/\s+/g, " ").trim());

describe("deal cache invalidation", () => {
  it.each(WRITERS)(
    "%s never invalidates getList alone",
    (_file: string, source: string) => {
      // Scoping to the list leaves the deal page and its form on stale data.
      const keys = invalidatedKeys(source);
      expect(keys.length).toBeGreaterThan(0);
      // Only the deals cache is this guard's business. A writer may legitimately
      // invalidate another resource — `DealEdit` invalidates `["tasks"]` because
      // reassigning a deal reassigns its open tasks in the database (issue #125,
      // trigger `deal_tasks_follow_owner`). Asserting on every key indiscriminately
      // would turn any such addition into a false failure.
      for (const key of keys.filter((k) => k.includes('"deals"'))) {
        expect(key).toBe('["deals"]');
      }
    },
  );

  it("DealEdit.tsx invalidates the tasks cache", () => {
    // The database moves a deal's open tasks to its new owner behind the
    // application's back (issue #125). Nothing in the deals cache covers that
    // write, so "Mes tâches" would keep showing the previous assignee until an
    // unrelated refetch — the feature would read as broken.
    expect(invalidatedKeys(dealEditSource)).toContain('["tasks"]');
  });

  it("still watches every file that invalidates the deals cache", () => {
    // If one of these stops invalidating, the assertions above would pass
    // vacuously and the guard would quietly stop covering it.
    for (const [, source] of WRITERS) {
      expect(source).toContain("invalidateQueries");
    }
  });
});
