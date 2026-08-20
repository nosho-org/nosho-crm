import type { LabeledValue } from "../../types";
import type { DealRecord } from "./dealFields";

/** Mirrors `defaultDealStages`, in pipeline order. */
export const TEST_STAGES: LabeledValue[] = [
  { value: "lead", label: "Lead" },
  { value: "qualified", label: "Qualifié" },
  { value: "follow-up", label: "Suivi" },
  { value: "rdv-prix", label: "Rendez-vous prix" },
  { value: "trial", label: "Essai" },
  { value: "closed-won", label: "Gagné" },
  { value: "perdu", label: "Perdu" },
  { value: "trial-failed", label: "Essai échoué" },
  { value: "declined", label: "Décliné" },
];

export const TEST_PIPELINE_STATUSES = [
  "closed-won",
  "perdu",
  "trial-failed",
  "declined",
];

let nextId = 1;

/**
 * Overrides are deliberately looser than `DealRecord`.
 *
 * The socle narrowed `Deal["priority"]` to the three canonical slugs, but the
 * cockpit reads deals straight from `deals_summary` and must survive rows the
 * type system cannot vouch for — legacy values, an empty string, NULL. Several
 * tests below feed exactly those to prove the normalisers degrade to "non
 * définie" instead of crashing, so the fixture accepts them rather than the
 * domain type being widened to accommodate the tests.
 */
export const makeDeal = (
  overrides: Partial<Record<keyof DealRecord, unknown>> = {},
): DealRecord =>
  ({
    id: nextId++,
    name: "Opportunité",
    company_id: 1,
    contact_ids: [],
    category: "medecin",
    stage: "qualified",
    description: "",
    amount: 1000,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    expected_closing_date: "2026-08-20",
    sales_id: 1,
    index: 0,
    ...overrides,
  }) as DealRecord;
