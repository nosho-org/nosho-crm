import { matchesDisjunction } from "./disjunctionFilter";

/**
 * The demo's stand-in for PostgREST's `or=(...)`. Without it, every opportunity
 * in the demo listed every open task in the database — the exact symptom of
 * #114, reproduced in the shop window.
 */

const viaContact = { id: 1, deal_id: null, contact_id: 7, done_date: null };
const viaDeal = { id: 2, deal_id: 36, contact_id: null, done_date: null };
const unrelated = { id: 3, deal_id: 99, contact_id: 404, done_date: null };

const dealTasks = { "deal_id@eq": 36, "contact_id@in": "(7,9)" };

describe("matchesDisjunction", () => {
  it("matches a row reached through the contact branch", () => {
    expect(matchesDisjunction(viaContact, dealTasks)).toBe(true);
  });

  it("matches a row reached through the deal branch", () => {
    expect(matchesDisjunction(viaDeal, dealTasks)).toBe(true);
  });

  it("rejects a row that satisfies neither branch", () => {
    expect(matchesDisjunction(unrelated, dealTasks)).toBe(false);
  });

  it("compares ids loosely: FakeRest stores numbers, filters carry strings", () => {
    expect(matchesDisjunction({ deal_id: "36" }, { "deal_id@eq": 36 })).toBe(
      true,
    );
    expect(matchesDisjunction({ contact_id: 9 }, dealTasks)).toBe(true);
  });

  it("never lets NULL satisfy an equality branch", () => {
    // `NULL = 36` is NULL in SQL, not true. Treating it as a match is how a
    // disjunction quietly turns into "everything".
    expect(matchesDisjunction({ deal_id: null }, { "deal_id@eq": 36 })).toBe(
      false,
    );
  });

  it("supports is / not.is on null", () => {
    expect(
      matchesDisjunction({ done_date: null }, { "done_date@is": null }),
    ).toBe(true);
    expect(
      matchesDisjunction(
        { done_date: "2026-01-01" },
        { "done_date@not.is": null },
      ),
    ).toBe(true);
  });

  it("throws on an operator it does not implement", () => {
    // Silently matching everything would be indistinguishable from a filter
    // that works, which is precisely the failure mode #114 was.
    expect(() => matchesDisjunction(viaDeal, { "name@ilike": "x" })).toThrow(
      /not supported/,
    );
  });
});
