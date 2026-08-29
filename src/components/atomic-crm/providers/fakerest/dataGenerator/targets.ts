import type { Db } from "./types";
import type { Target } from "../../../types";

/**
 * Deux objectifs d'exemple, pour que la carte du cockpit ait quelque chose à
 * montrer en démo (NOS-1173).
 *
 * Un objectif d'équipe et un objectif personnel, parce que c'est justement la
 * cohabitation des deux que la carte met en scène — avec une seule ligne, on
 * ne verrait pas que l'objectif commun passe en premier et en plus gros.
 *
 * La collection ne peut de toute façon pas rester vide : `ra-data-fakerest`
 * calcule l'identifiant d'un nouvel enregistrement à partir de ceux déjà
 * présents, et sur un tableau vide la création échoue sur « missing id ».
 */
export const generateTargets = (db: Db): Target[] => {
  const year = new Date().getFullYear();
  const sale = db.sales[0];

  const targets: Target[] = [
    {
      id: 0,
      sales_id: null,
      metric: "mrr",
      period_start: `${year}-01-01`,
      period_end: `${year}-12-31`,
      // L'objectif que Simon a nommé : 25 k€ de MRR d'ici la fin de l'année.
      amount: 25000,
    },
  ];

  if (sale) {
    targets.push({
      id: 1,
      sales_id: sale.id,
      metric: "mrr",
      period_start: `${year}-01-01`,
      period_end: `${year}-12-31`,
      amount: 12000,
    });
  }

  return targets;
};
