import { describe, expect, it } from "vitest";

import type { Deal } from "../types";
import { CHAMPS_DUPLIQUES, brouillonDuplique } from "./dupliquerOpportunite";

/**
 * Une affaire close, telle qu'elle revient de `deals_summary` : tous les champs
 * renseignés, y compris ceux que la vue calcule et que le formulaire n'écrit
 * jamais. C'est le cas qui compte — Simon duplique une Close Won.
 */
const affaireClose: Deal = {
  id: 42,
  name: "Clinique Bonneveine",
  company_id: 7,
  company_name: "Clinique Bonneveine",
  company_type: "clinique",
  opportunity_type: "nouveau-client",
  contact_ids: [11, 12],
  contact_roles: { "11": "decideur", "12": "utilisateur" },
  category: "hopital",
  motion: "core",
  products: ["no-show"],
  priority: "important",
  lead_source: "reseau",
  referrer_id: 3,
  sales_id: 5,
  description: "Deux sites, facturation groupee.",
  amount: 12000,
  arr_is_manual: true,
  mrr: 1000,
  priority_rank: 1,
  stage: "won",
  legacy_stage: "closed-won",
  legacy_category: "hopital-public",
  index: 4,
  probability: 100,
  created_at: "2026-03-01T09:00:00.000Z",
  updated_at: "2026-09-12T09:00:00.000Z",
  last_activity_at: "2026-09-12T09:00:00.000Z",
  entered_at: "2026-03-01",
  won_at: "2026-09-12",
  trial_start_date: "2026-05-02",
  archived_at: "2026-09-20T09:00:00.000Z",
  expected_closing_date: "2026-09-30",
  proposal_edit_url: "https://exemple.test/edit",
  proposal_public_url: "https://exemple.test/public",
  proposal_generated_at: "2026-08-01T09:00:00.000Z",
  next_action: "Relancer le DSI",
  next_action_date: "2026-09-25",
  next_action_owner_id: 5,
  next_task_date: "2026-09-25",
  next_task_text: "Relancer le DSI",
} as Deal;

describe("brouillonDuplique", () => {
  it("recopie ce qui décrit le client", () => {
    expect(brouillonDuplique(affaireClose)).toEqual({
      name: "Clinique Bonneveine",
      company_id: 7,
      company_type: "clinique",
      opportunity_type: "nouveau-client",
      contact_ids: [11, 12],
      contact_roles: { "11": "decideur", "12": "utilisateur" },
      category: "hopital",
      motion: "core",
      products: ["no-show"],
      priority: "important",
      lead_source: "reseau",
      referrer_id: 3,
      sales_id: 5,
      description: "Deux sites, facturation groupee.",
      amount: 12000,
      arr_is_manual: true,
    });
  });

  /*
   * Le vrai risque de cette fonction n'est pas d'oublier un champ utile — ça
   * se voit à l'écran — mais d'en emporter un qui enterre la nouvelle affaire
   * dans l'état de l'ancienne : archivée, gagnée, ou datée d'il y a six mois.
   */
  it("n'emporte aucun champ du cycle de vie de l'affaire d'origine", () => {
    const brouillon = brouillonDuplique(affaireClose);
    for (const champ of [
      "id",
      "stage",
      "index",
      "expected_closing_date",
      "entered_at",
      "won_at",
      "trial_start_date",
      "archived_at",
      "created_at",
      "updated_at",
      "last_activity_at",
      "probability",
      "proposal_edit_url",
      "proposal_public_url",
      "proposal_generated_at",
      "next_action",
      "next_action_date",
      "next_action_owner_id",
      "next_task_date",
      "next_task_text",
      "legacy_stage",
      "legacy_category",
      "mrr",
      "priority_rank",
      "company_name",
    ]) {
      expect(brouillon).not.toHaveProperty(champ);
    }
  });

  /*
   * `DealCreate` pose ses propres défauts pour une création neuve — le
   * responsable courant, l'étape d'entrée, la date à six semaines — et le
   * brouillon est fusionné par-dessus. Un `null` recopié gagnerait contre le
   * défaut et laisserait le champ vide.
   */
  it("omet les champs vides plutôt que de les poser à null", () => {
    const brouillon = brouillonDuplique({
      ...affaireClose,
      motion: null,
      referrer_id: null,
      products: undefined,
    } as Deal);

    expect(brouillon).not.toHaveProperty("motion");
    expect(brouillon).not.toHaveProperty("referrer_id");
    expect(brouillon).not.toHaveProperty("products");
    expect(brouillon.company_id).toBe(7);
  });

  /*
   * La fiche d'origine reste affichée derrière la boîte de dialogue : éditer
   * les contacts du doublon ne doit pas la modifier sous les yeux de qui la
   * regarde.
   */
  it("ne partage ni tableau ni objet avec la source", () => {
    const brouillon = brouillonDuplique(affaireClose);

    expect(brouillon.contact_ids).not.toBe(affaireClose.contact_ids);
    expect(brouillon.products).not.toBe(affaireClose.products);
    expect(brouillon.contact_roles).not.toBe(affaireClose.contact_roles);
  });

  /*
   * `deals.name` est `not null`, et le champ n'existe plus à l'écran : il se
   * remplit depuis la société, laquelle ne *change* pas sur un formulaire
   * prérempli. Sans cette copie, la création échoue côté Postgres.
   */
  it("emporte le nom, seul chemin vers une colonne not null", () => {
    expect(CHAMPS_DUPLIQUES).toContain("name");
    expect(brouillonDuplique(affaireClose).name).toBe("Clinique Bonneveine");
  });
});
