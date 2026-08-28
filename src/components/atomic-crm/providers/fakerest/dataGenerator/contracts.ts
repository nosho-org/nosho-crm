import type { Contract } from "../../../types";
import type { Db } from "./types";

/**
 * Un contrat d'exemple, rattaché à la première opportunité (NOS-1156).
 *
 * La collection ne peut pas rester vide : `ra-data-fakerest` calcule
 * l'identifiant d'un nouvel enregistrement à partir de ceux déjà présents, et
 * sur un tableau vide la création échoue sur « missing id ». En production
 * c'est PostgreSQL qui attribue l'identifiant, le problème n'existe pas — mais
 * sans cette graine, le parcours d'édition d'un contrat serait invérifiable en
 * local, donc livré à l'aveugle.
 *
 * Un POC plutôt qu'un cadre : c'est le cas le plus simple, gratuit et sans
 * mandat, donc celui qui n'a besoin d'aucune donnée bancaire fictive.
 */
export const generateContracts = (db: Db): Contract[] => {
  const deal = db.deals[0];
  if (!deal) return [];

  return [
    {
      id: 0,
      created_at: new Date().toISOString(),
      deal_id: deal.id,
      company_id: deal.company_id,
      sales_id: deal.sales_id ?? null,
      kind: "poc",
      signatory_first_name: "Camille",
      signatory_last_name: "Berger",
      signatory_job_title: "Directrice de cabinet",
      signatory_email: "c.berger@example.fr",
      nosho_signatory_id: 0,
      nosho_signatory_job_title: "Présidente",
      offer_label: "Forfait confirmation",
      offer_detail:
        "Appel sortant de confirmation, par rendez-vous traité, reprise des créneaux annulés incluse.",
      unit_price_cents: 25,
      price_unit: "confirmation",
      commitment_months: 12,
      renewal_months: 12,
      notice_days: 30,
      status: "draft",
    },
  ];
};
