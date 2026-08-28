import type { DataProvider } from "ra-core";

import type { Company } from "../types";

/** Identifiant de societe tel qu'il arrive des differentes sources. */
type DealCompanyId = string | number | null | undefined;

/**
 * ---------------------------------------------------------------------------
 * Le SIRET, exigé à partir de Qualifié (NOS-1150)
 * ---------------------------------------------------------------------------
 * Simon voulait d'abord l'exiger à la création de l'opportunité. La mesure a
 * fait changer d'avis : **46 des 53 opportunités créées en 60 jours auraient
 * été refusées** — 87 %. Un commercial en salon qui note un prénom et un
 * numéro n'a pas de raison sociale à donner, et 89 des sociétés en base
 * portent un libellé de travail introuvable chez Pappers.
 *
 * Une barrière que 87 % des cas heurtent n'est pas un garde-fou qualité : elle
 * pousse à saisir de faux SIRET pour passer, ce qui est pire qu'un champ vide
 * — une donnée fausse ne se signale pas.
 *
 * Le contrôle a donc été déplacé là où l'affaire devient réelle : on entre
 * librement en Lead, on ne passe pas en Qualifié sans avoir identifié la
 * société. Aucune des créations récentes n'aurait été empêchée, et la pression
 * s'exerce au moment où le commercial a de quoi y répondre.
 *
 * ## Ce qui n'est jamais bloqué, et pourquoi
 *
 * `lost` et `churn` en sont exclus, délibérément. Empêcher de classer une
 * affaire en perdue faute de SIRET la laisserait pourrir dans le pipeline en
 * gonflant les prévisions — le contrôle produirait exactement le mensonge
 * qu'il prétend empêcher. On doit toujours pouvoir fermer une affaire.
 *
 * `a-reclasser` et `lead` restent libres : ce sont les étapes d'entrée.
 */

/** Étapes qui exigent une société identifiée. */
export const STAGES_REQUIRING_SIRET = [
  "qualified",
  "demo-poc",
  "proposal",
  "negociation",
  "closed-won",
] as const;

export const stageRequiresSiret = (stage: string | null | undefined): boolean =>
  !!stage && (STAGES_REQUIRING_SIRET as readonly string[]).includes(stage);

/** Une société est identifiée dès qu'elle porte un SIRET non vide. */
export const companyIsIdentified = (
  company: Pick<Company, "tax_identifier"> | null | undefined,
): boolean => !!company?.tax_identifier?.trim();

/**
 * Le message d'erreur, écrit une fois.
 *
 * Il nomme le champ, l'endroit où le remplir et le moyen de l'obtenir. Un
 * « SIRET obligatoire » sec laisserait l'utilisateur chercher où, et c'est
 * ainsi qu'on obtient des SIRET inventés.
 */
export const siretRequiredMessage = (stageLabel: string, count = 1): string =>
  count > 1
    ? `${count} opportunités ne peuvent pas passer en « ${stageLabel} » : leur société n'a pas de SIRET. Renseignez-le sur la fiche société — le bouton « Enrichir » le récupère depuis Pappers.`
    : `Cette opportunité ne peut pas passer en « ${stageLabel} » tant que sa société n'a pas de SIRET. Renseignez-le sur la fiche société — le bouton « Enrichir » le récupère depuis Pappers.`;

/**
 * Vérifie qu'un lot d'opportunités peut atteindre `targetStage`.
 *
 * Asynchrone et passant par le `dataProvider` plutôt que par une colonne de
 * `deals_summary` : exposer `company_tax_identifier` sur la vue aurait imposé
 * de la reconstruire, pour une valeur lue à trois endroits seulement et jamais
 * dans une liste. Le coût est une requête au moment du contrôle, pas à chaque
 * affichage de la liste.
 *
 * Renvoie le nombre d'opportunités bloquées, et zéro quand tout peut passer.
 */
export const countDealsMissingSiret = async (
  dataProvider: DataProvider,
  /*
   * Forme minimale plutôt que `Pick<Deal, …>` : les appelants construisent
   * cette liste depuis des sources différentes — une carte kanban, une
   * sélection de liste — et `Deal["company_id"]` n'y est pas toujours du même
   * type nullable. Ne demander que ce qu'on lit évite de propager cette
   * divergence jusqu'ici.
   */
  deals: { company_id?: DealCompanyId }[],
  targetStage: string,
): Promise<number> => {
  if (!stageRequiresSiret(targetStage)) return 0;

  // Une opportunité sans société ne peut pas être identifiee : elle est
  // bloquee au meme titre, sans requete.
  const withoutCompany = deals.filter((deal) => deal.company_id == null);
  const companyIds = [
    ...new Set(
      deals
        .map((deal) => deal.company_id)
        .filter((id): id is NonNullable<typeof id> => id != null),
    ),
  ];
  if (companyIds.length === 0) return withoutCompany.length;

  const { data } = await dataProvider.getMany<Company>("companies", {
    ids: companyIds,
  });
  const identified = new Set(
    data.filter(companyIsIdentified).map((company) => String(company.id)),
  );

  const blocked = deals.filter(
    (deal) =>
      deal.company_id != null && !identified.has(String(deal.company_id)),
  );
  return blocked.length + withoutCompany.length;
};
