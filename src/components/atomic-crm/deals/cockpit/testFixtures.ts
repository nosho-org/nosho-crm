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

export const makeDeal = (overrides: Partial<DealRecord> = {}): DealRecord =>
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
