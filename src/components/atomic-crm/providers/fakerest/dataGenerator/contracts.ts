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
      // Deux lignes, parce qu'une seule ne montrerait pas ce que la fenêtre
      // sait faire : c'est la seule façon de vérifier l'ajout et la
      // suppression de prestations en local.
      services: [
        {
          service: "confirmation-rdv",
          label: "Agent de confirmation de rendez-vous",
          unitPriceCents: 25,
          unit: "rendez-vous traité",
          comment: "Reprise des créneaux annulés incluse.",
        },
        {
          service: "secretariat",
          label: "Agent de secrétariat",
          unitPriceCents: 90,
          unit: "appel entrant",
          comment: null,
        },
      ],
      is_free: true,
      trial_start_date: "2026-08-31",
      trial_end_date: "2026-09-13",
      trial_weeks: 2,
      commitment_months: 12,
      renewal_months: 12,
      notice_days: 30,
      status: "draft",
    },
  ];
};
