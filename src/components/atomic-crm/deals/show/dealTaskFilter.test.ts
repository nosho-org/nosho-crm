import { buildDealTaskFilter } from "./dealTaskFilter";

/**
 * The regression of #114 in its smallest form.
 *
 * The deal page read tasks with `{ deal_id }` alone. In production `deal_id`
 * was NULL on all 129 tasks — they hang off `contact_id` — so every one of the
 * 215 open opportunities rendered an empty task list. These assertions pin the
 * `or` that `deals_summary` has always used in SQL.
 */

describe("buildDealTaskFilter", () => {
  it("reaches tasks by deal_id OR by the deal's contacts (#114)", () => {
    const filter = buildDealTaskFilter(36, [7, 9]);

    expect(filter).toEqual({
      "done_date@is": null,
      "@or": {
        "deal_id@eq": 36,
        "contact_id@in": "(7,9)",
      },
    });
  });

  it("never emits deal_id as a bare top-level key", () => {
    // That single key *was* the bug: it silently excluded every task attached
    // through a contact.
    const filter = buildDealTaskFilter(36, [7, 9]);

    expect(filter).not.toHaveProperty("deal_id");
  });

  it("falls back to deal_id alone when the opportunity has no contact", () => {
    // `contact_id=in.()` is invalid SQL and PostgREST answers 400, which would
    // empty the block instead of merely shortening it.
    const filter = buildDealTaskFilter(36, []);

    expect(filter).toEqual({ "done_date@is": null, "deal_id@eq": 36 });
    expect(JSON.stringify(filter)).not.toContain("contact_id@in");
  });

  it("treats a missing contact list like an empty one", () => {
    expect(buildDealTaskFilter(36, undefined)).toEqual({
      "done_date@is": null,
      "deal_id@eq": 36,
    });
  });

  it("drops null contact ids rather than serializing them", () => {
    // `(7,,9)` would be a 400 too.
    const filter = buildDealTaskFilter(36, [7, null, 9, undefined]);

    expect((filter["@or"] as Record<string, unknown>)["contact_id@in"]).toBe(
      "(7,9)",
    );
  });

  it("selects completed tasks in the done scope", () => {
    const filter = buildDealTaskFilter(36, [7], "done");

    expect(filter["done_date@not.is"]).toBeNull();
    expect(filter).not.toHaveProperty("done_date@is");
  });
});
