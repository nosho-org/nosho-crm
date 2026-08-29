import {
  compareDealPriority,
  getCommercialDealsFilter,
  getCompanyTypeChoices,
  getDealPriority,
  getNonCommercialCompanyTypes,
  getSuggestedArr,
  isNonCommercialCompanyType,
  resolvePrefilledArr,
  withDealCreateDates,
  withDealUpdateDates,
} from "./dealUtils";
import { arrToMrr, formatCurrency } from "../misc/formatCurrency";
import {
  archivedDealStages,
  defaultCompanyTypes,
  defaultDealPipelineStatuses,
  defaultDealStageProbabilities,
  defaultDealStages,
  defaultEstablishmentTypes,
  legacyDealStages,
} from "../root/defaultConfiguration";
import type { CustomView } from "../root/ConfigurationContext";

const view = (id: string, label: string, companyType: string): CustomView => ({
  id,
  label,
  companyType,
});

// NOS-796, revised by NOS-956 (seven-stage pipeline)
describe("canonical pipeline", () => {
  it("has the 6 commercial stages, in order, closed by churn", () => {
    expect(defaultDealStages.map((s) => s.value)).toEqual([
      "lead",
      "qualified",
      "demo-poc",
      "proposal",
      "negociation",
      "closed-won",
      "lost",
      // Terminal, still counted in lost ARR, only hidden from the board.
      "churn",
    ]);
  });

  it("a retiré « À reclasser » sans la perdre", () => {
    // Retirée du pipeline le 29/08/2026 : c'était la file d'attente de la
    // refonte v2, et la production n'y comptait plus aucune opportunité.
    //
    // Archivée plutôt que supprimée, pour que son libellé reste résoluble si
    // un enregistrement égaré la porte encore — une étape effacée tout court
    // afficherait son slug brut.
    expect(defaultDealStages.map((s) => s.value)).not.toContain("a-reclasser");
    expect(archivedDealStages.map((s) => s.value)).toContain("a-reclasser");
  });

  it("maps every retired stage onto a live one", () => {
    const live = new Set(defaultDealStages.map((s) => s.value));
    expect(Object.keys(legacyDealStages).sort()).toEqual([
      "d-mo-rdv",
      "declined",
      "follow-up",
      "perdu",
      "poc-lanc",
      "proposal-to-send",
      "proposition-a-envoyer",
      "proposition-envoy-e",
      "rdv-prix",
      "trial",
      "trial-failed",
    ]);
    for (const target of Object.values(legacyDealStages)) {
      expect(live.has(target)).toBe(true);
    }
  });

  it("never maps a retired stage onto another retired stage", () => {
    for (const target of Object.values(legacyDealStages)) {
      expect(legacyDealStages[target]).toBeUndefined();
    }
  });

  it("leaves genuinely ambiguous slugs unmapped, to be reclassified by hand", () => {
    // The spec forbids guessing. These two have no certain equivalent, so they
    // must NOT appear in the map — the migration parks them in `a-reclasser`.
    expect(legacyDealStages["logiciels-brique"]).toBeUndefined();
    expect(legacyDealStages["opportunity"]).toBeUndefined();
  });

  it("keeps every retired stage label resolvable", () => {
    // `legacy_stage` on migrated deals, and the `visibleStages` of the
    // investisseur / partenaire custom views, both still point at these slugs.
    const archived = new Set(archivedDealStages.map((s) => s.value));
    for (const retired of Object.keys(legacyDealStages)) {
      // `rdv-prix` was already gone before the configuration was snapshotted.
      if (retired === "rdv-prix") continue;
      expect(archived.has(retired)).toBe(true);
    }
    for (const nonCommercial of [
      "partenariats",
      "ressources",
      "invest",
      "invests-actifs",
      "communication-presse",
    ]) {
      expect(archived.has(nonCommercial)).toBe(true);
    }
  });

  it("treats only the terminal stages as pipeline statuses", () => {
    // Production stored ["closed-won"] until 20260823093000, which counted 59
    // lost deals (415 770 €) and 3 churned ones as open pipeline.
    expect(defaultDealPipelineStatuses).toEqual([
      "closed-won",
      "lost",
      "churn",
    ]);
    for (const status of defaultDealPipelineStatuses) {
      expect(defaultDealStages.some((s) => s.value === status)).toBe(true);
    }
  });

  it("assigns a probability to every open stage and to no terminal one", () => {
    const terminal = new Set(defaultDealPipelineStatuses);
    for (const stage of defaultDealStages) {
      if (stage.value === "a-reclasser") continue;
      const hasProbability = stage.value in defaultDealStageProbabilities;
      // Won and lost are facts, not forecasts.
      expect(hasProbability).toBe(!terminal.has(stage.value));
    }
  });
});

// NOS-797
describe("non-commercial classification", () => {
  it("flags the six non-commercial types", () => {
    for (const type of [
      "investisseur",
      "partenaire",
      "ressource",
      "presse",
      "leads-santexpo",
      "logiciels-brique",
    ]) {
      expect(isNonCommercialCompanyType(type, defaultCompanyTypes)).toBe(true);
    }
  });

  it("keeps clients, prospects and untyped deals in the pipeline", () => {
    expect(isNonCommercialCompanyType("client", defaultCompanyTypes)).toBe(
      false,
    );
    expect(isNonCommercialCompanyType("prospect", defaultCompanyTypes)).toBe(
      false,
    );
    expect(isNonCommercialCompanyType(null, defaultCompanyTypes)).toBe(false);
    expect(isNonCommercialCompanyType(undefined, defaultCompanyTypes)).toBe(
      false,
    );
  });

  it("recognises slug variants coming from older custom views", () => {
    expect(isNonCommercialCompanyType("partenariats", [])).toBe(true);
    expect(isNonCommercialCompanyType("investisseurs", [])).toBe(true);
    expect(isNonCommercialCompanyType("ressources", [])).toBe(true);
  });

  it("lets an explicit commercial flag override the built-in list", () => {
    const types = [
      { value: "partenaire", label: "Partenariat", commercial: true },
    ];
    expect(isNonCommercialCompanyType("partenaire", types)).toBe(false);
  });

  it("collects non-commercial slugs from both the config and the views", () => {
    const views = [
      view("v1", "Presse", "presse"),
      view("v2", "Clients", "client"),
    ];
    const excluded = getNonCommercialCompanyTypes(defaultCompanyTypes, views);
    expect(excluded).toContain("presse");
    expect(excluded).not.toContain("client");
  });

  it("filters on the coalesced key so untyped deals are never dropped", () => {
    // PostgREST evaluates `not.in` as NULL for a NULL column, which would hide
    // every plain opportunity. The view exposes coalesce(company_type, '').
    const filter = getCommercialDealsFilter(defaultCompanyTypes, []);
    const key = Object.keys(filter)[0];
    expect(key).toBe("company_type_key@not.in");
    expect(filter[key]).toContain("investisseur");
    expect(filter[key]).toMatch(/^\(.*\)$/);
  });

  it("produces no filter when nothing is flagged non-commercial", () => {
    expect(
      getCommercialDealsFilter([{ value: "client", label: "Client" }], []),
    ).toEqual({});
  });
});

// NOS-801
describe("Vue menu deduplication", () => {
  it("keeps a single entry when two views resolve to the same type", () => {
    const views = [
      view("v1", "Investisseurs", "investisseur"),
      view("v2", "Investisseurs", "investisseur"),
    ];
    const labels = getCompanyTypeChoices(defaultCompanyTypes, views).map(
      (c) => c.label,
    );
    expect(labels.filter((l) => l === "Investisseurs")).toHaveLength(1);
  });

  it("does not repeat a company type already covered by a view label", () => {
    const views = [view("v1", "Client", "client")];
    const choices = getCompanyTypeChoices(defaultCompanyTypes, views);
    expect(choices.filter((c) => c.value === "client")).toHaveLength(1);
  });

  it("never returns duplicate values or labels", () => {
    const views = [
      view("v1", "Presse", "presse"),
      view("v2", "presse", "presse"),
      view("v3", "Partenariats", "partenaire"),
    ];
    const choices = getCompanyTypeChoices(defaultCompanyTypes, views);
    expect(new Set(choices.map((c) => c.value)).size).toBe(choices.length);
    expect(new Set(choices.map((c) => c.label.toLowerCase())).size).toBe(
      choices.length,
    );
  });
});

// NOS-805
describe("pipeline dates", () => {
  it("stamps the entry date on creation", () => {
    expect(
      withDealCreateDates({ stage: "lead" }, "2026-08-20").entered_at,
    ).toBe("2026-08-20");
  });

  it("respects an entry date supplied by the form", () => {
    const data = withDealCreateDates(
      { stage: "lead", entered_at: "2026-01-05" },
      "2026-08-20",
    );
    expect(data.entered_at).toBe("2026-01-05");
  });

  it("stamps the signature date when a deal is created already signed", () => {
    expect(
      withDealCreateDates({ stage: "closed-won" }, "2026-08-20").won_at,
    ).toBe("2026-08-20");
  });

  it("stamps the signature date when the deal reaches the signed stage", () => {
    const data = withDealUpdateDates(
      { stage: "closed-won" },
      { stage: "proposal-sent" },
      "2026-08-20",
    );
    expect(data.won_at).toBe("2026-08-20");
  });

  it("does not overwrite an existing signature date", () => {
    const data = withDealUpdateDates(
      { stage: "closed-won" },
      { stage: "proposal-sent", won_at: "2026-02-02" },
      "2026-08-20",
    );
    expect(data.won_at).toBeUndefined();
  });

  it("leaves the signature date alone when a signed deal is edited", () => {
    const data = withDealUpdateDates(
      { amount: 900 },
      { stage: "closed-won", won_at: "2026-02-02" },
      "2026-08-20",
    );
    expect(data.won_at).toBeUndefined();
  });

  it("never clears the signature date when the deal leaves the signed stage", () => {
    const data = withDealUpdateDates(
      { stage: "perdu" },
      { stage: "closed-won", won_at: "2026-02-02" },
      "2026-08-20",
    );
    expect(data).not.toHaveProperty("won_at");
  });
});

// NOS-806, revised by NOS-956 (P0/P1/P2)
describe("priority", () => {
  it("returns null for an unknown or missing value", () => {
    // Not a fallback to the first choice: the list is now ordered most-urgent
    // first, so falling back would label every unset deal "P0 Critique".
    expect(getDealPriority(undefined)).toBeNull();
    expect(getDealPriority(null)).toBeNull();
    expect(getDealPriority("")).toBeNull();
    expect(getDealPriority("critique")).toBeNull();
  });

  it("resolves the configured P0/P1/P2 labels", () => {
    expect(getDealPriority("urgent")?.label).toBe("P0 Critique");
    expect(getDealPriority("important")?.label).toBe("P1 Élevée");
    expect(getDealPriority("normal")?.label).toBe("P2 Normale");
  });

  it("orders urgent before important before normal", () => {
    const sorted = ["normal", "urgent", "important"].sort((a, b) =>
      compareDealPriority(a, b),
    );
    expect(sorted).toEqual(["urgent", "important", "normal"]);
  });

  it("sinks an unset priority below every configured one", () => {
    const sorted = ["normal", undefined, "urgent"].sort((a, b) =>
      compareDealPriority(a, b),
    );
    expect(sorted).toEqual(["urgent", "normal", undefined]);
  });
});

// NOS-807/808
describe("ARR and MRR", () => {
  it("derives the MRR from the ARR", () => {
    expect(arrToMrr(12000)).toBe(1000);
    expect(arrToMrr(800)).toBe(66.67);
    expect(arrToMrr(null)).toBeNull();
  });

  it("formats amounts in euros without converting them", () => {
    const formatted = formatCurrency(12000, "EUR");
    expect(formatted).toContain("€");
    expect(formatted).not.toContain("$");
    expect(formatted.replace(/\D/g, "")).toBe("12000");
  });

  it("renders a missing amount as a dash rather than 0 €", () => {
    expect(formatCurrency(null)).toBe("–");
    expect(formatCurrency(undefined)).toBe("–");
  });
});

// NOS-810/811/812
describe("ARR tiers and prefill", () => {
  it("suggests the configured tier for an establishment type", () => {
    expect(getSuggestedArr("cabinet", defaultEstablishmentTypes)).toBe(800);
    expect(getSuggestedArr("clinique", defaultEstablishmentTypes)).toBe(5000);
    expect(getSuggestedArr("hopital", defaultEstablishmentTypes)).toBe(15000);
    expect(getSuggestedArr("inconnu", defaultEstablishmentTypes)).toBeNull();
    expect(getSuggestedArr(null, defaultEstablishmentTypes)).toBeNull();
  });

  it("fills an empty ARR from the tier", () => {
    expect(
      resolvePrefilledArr({
        currentArr: 0,
        isManual: false,
        suggestedArr: 5000,
      }),
    ).toEqual({
      arr: 5000,
      changed: true,
    });
    expect(
      resolvePrefilledArr({
        currentArr: null,
        isManual: false,
        suggestedArr: 800,
      }),
    ).toEqual({
      arr: 800,
      changed: true,
    });
  });

  it("never overwrites a manually entered ARR", () => {
    expect(
      resolvePrefilledArr({
        currentArr: 2500,
        isManual: true,
        suggestedArr: 15000,
      }),
    ).toEqual({
      arr: 2500,
      changed: false,
    });
  });

  it("never overwrites a manual ARR even when it is zero", () => {
    // A deliberate 0 € is a decision, not an empty field.
    expect(
      resolvePrefilledArr({
        currentArr: 0,
        isManual: true,
        suggestedArr: 15000,
      }),
    ).toEqual({
      arr: 0,
      changed: false,
    });
  });

  it("leaves an existing non-zero ARR alone even without the manual flag", () => {
    // Deals created before the flag existed must not be rewritten either.
    expect(
      resolvePrefilledArr({
        currentArr: 3000,
        isManual: false,
        suggestedArr: 800,
      }),
    ).toEqual({
      arr: 3000,
      changed: false,
    });
  });

  it("does nothing when the establishment type has no tier", () => {
    expect(
      resolvePrefilledArr({
        currentArr: 0,
        isManual: false,
        suggestedArr: null,
      }),
    ).toEqual({
      arr: 0,
      changed: false,
    });
  });
});
