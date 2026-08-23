import {
  TIMELINE_FILTERS,
  buildDealTimeline,
  filterTimeline,
} from "./dealTimeline";

const label = (slug: string | null | undefined) =>
  ({ lead: "Lead", qualified: "Qualifié", "d-mo-rdv": "Démo booked" })[
    slug ?? ""
  ] ??
  slug ??
  "—";

describe("buildDealTimeline", () => {
  it("merges every source into one list, most recent first", () => {
    const items = buildDealTimeline({
      notes: [
        {
          id: 1,
          deal_id: 1,
          text: "Note",
          date: "2026-08-01T10:00:00Z",
          sales_id: 1,
        } as never,
      ],
      calls: [{ id: 2, started_at: "2026-08-03T10:00:00Z", sales_id: 1 }],
      tasks: [
        {
          id: 3,
          text: "Proposition envoyée",
          done_date: "2026-08-02T10:00:00Z",
        },
      ],
      stageChanges: [
        {
          id: 4,
          from_stage: "lead",
          to_stage: "qualified",
          changed_at: "2026-08-04T10:00:00Z",
        },
      ],
      stageLabel: label,
    });

    expect(items.map((i) => i.kind)).toEqual([
      "stage",
      "call",
      "action",
      "note",
    ]);
  });

  it("prefixes ids per source, so independent sequences cannot collide", () => {
    // All four tables can legitimately hold a row with id 1.
    const items = buildDealTimeline({
      notes: [
        { id: 1, deal_id: 1, text: "n", date: "2026-08-01T10:00:00Z" } as never,
      ],
      calls: [{ id: 1, started_at: "2026-08-02T10:00:00Z" }],
      tasks: [{ id: 1, text: "t", done_date: "2026-08-03T10:00:00Z" }],
      stageChanges: [
        { id: 1, to_stage: "lead", changed_at: "2026-08-04T10:00:00Z" },
      ],
    });
    expect(new Set(items.map((i) => i.id)).size).toBe(4);
  });

  it("reads the note type that already exists in the database", () => {
    const items = buildDealTimeline({
      notes: [
        {
          id: 1,
          deal_id: 1,
          type: "Appel",
          text: "a",
          date: "2026-08-01T10:00:00Z",
        } as never,
        {
          id: 2,
          deal_id: 1,
          type: "meeting",
          text: "b",
          date: "2026-08-02T10:00:00Z",
        } as never,
        {
          id: 3,
          deal_id: 1,
          type: "Email",
          text: "c",
          date: "2026-08-03T10:00:00Z",
        } as never,
      ],
    });
    expect(items.map((i) => i.kind).sort()).toEqual([
      "call",
      "email",
      "meeting",
    ]);
  });

  it("keeps a note whose type is unrecognised, under the neutral heading", () => {
    // The column is free text and predates any referential; dropping the note
    // for failing a match would lose history.
    const items = buildDealTimeline({
      notes: [
        {
          id: 1,
          deal_id: 1,
          type: "truc-inconnu",
          text: "x",
          date: "2026-08-01T10:00:00Z",
        } as never,
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("note");
  });

  it("shows only completed tasks", () => {
    // A pending task is a plan, not an activity — and the "Prochaine action"
    // block above the timeline already shows it.
    const items = buildDealTimeline({
      tasks: [
        { id: 1, text: "faite", done_date: "2026-08-01T10:00:00Z" },
        { id: 2, text: "à faire", done_date: null },
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("faite");
  });

  it("labels a stage move with both ends, resolved", () => {
    const items = buildDealTimeline({
      stageChanges: [
        {
          id: 1,
          from_stage: "d-mo-rdv",
          to_stage: "qualified",
          changed_at: "2026-08-01T10:00:00Z",
        },
      ],
      stageLabel: label,
    });
    expect(items[0].title).toBe("Étape : Démo booked → Qualifié");
  });

  it("labels the very first stage as initial rather than a move from nothing", () => {
    const items = buildDealTimeline({
      stageChanges: [
        {
          id: 1,
          from_stage: null,
          to_stage: "lead",
          changed_at: "2026-08-01T10:00:00Z",
        },
      ],
      stageLabel: label,
    });
    expect(items[0].title).toBe("Étape initiale : Lead");
  });

  it("sorts undated items last instead of dropping them", () => {
    const items = buildDealTimeline({
      notes: [
        { id: 1, deal_id: 1, text: "sans date", date: null } as never,
        {
          id: 2,
          deal_id: 1,
          text: "datée",
          date: "2026-08-01T10:00:00Z",
        } as never,
      ],
    });
    expect(items).toHaveLength(2);
    expect(items[1].title).toBe("sans date");
  });

  it("loses nothing: every input row appears exactly once", () => {
    const items = buildDealTimeline({
      notes: Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        deal_id: 1,
        text: `n${i}`,
        date: `2026-08-0${i + 1}T10:00:00Z`,
      })) as never,
      calls: [{ id: 1, started_at: "2026-08-06T10:00:00Z" }],
      tasks: [{ id: 1, text: "t", done_date: "2026-08-07T10:00:00Z" }],
      stageChanges: [
        { id: 1, to_stage: "lead", changed_at: "2026-08-08T10:00:00Z" },
      ],
    });
    expect(items).toHaveLength(8);
  });

  it("derives a title from the first line of a long note", () => {
    const items = buildDealTimeline({
      notes: [
        {
          id: 1,
          deal_id: 1,
          date: "2026-08-01T10:00:00Z",
          text: "Intérêt confirmé pour Nosho Entrant\nVolonté de démarrer un POC en octobre.",
        } as never,
      ],
    });
    expect(items[0].title).toBe("Intérêt confirmé pour Nosho Entrant");
    // The full text stays available for the "Lire plus" affordance.
    expect(items[0].body).toContain("POC en octobre");
  });

  it("returns an empty list rather than throwing on no sources", () => {
    expect(buildDealTimeline({})).toEqual([]);
  });
});

describe("filterTimeline", () => {
  const items = buildDealTimeline({
    notes: [
      { id: 1, deal_id: 1, text: "n", date: "2026-08-01T10:00:00Z" } as never,
    ],
    calls: [{ id: 1, started_at: "2026-08-02T10:00:00Z" }],
    tasks: [{ id: 1, text: "t", done_date: "2026-08-03T10:00:00Z" }],
    stageChanges: [
      { id: 1, to_stage: "lead", changed_at: "2026-08-04T10:00:00Z" },
    ],
  });

  it("covers the tabs the spec names", () => {
    expect(TIMELINE_FILTERS.map((f) => f.value)).toEqual([
      "all",
      "note",
      "call",
      "meeting",
      "email",
      "action",
    ]);
  });

  it("returns everything on 'all'", () => {
    expect(filterTimeline(items, "all")).toHaveLength(4);
  });

  it("groups completed tasks and stage moves under Actions", () => {
    // Both are things that happened to the deal, rather than things someone
    // wrote about it.
    expect(
      filterTimeline(items, "action")
        .map((i) => i.kind)
        .sort(),
    ).toEqual(["action", "stage"]);
  });

  it("narrows to a single kind otherwise", () => {
    expect(filterTimeline(items, "call")).toHaveLength(1);
    expect(filterTimeline(items, "email")).toHaveLength(0);
  });
});
