import type { DataProvider } from "ra-core";

import type { Company } from "../types";

/** Identifiant de societe tel qu'il arrive des differentes sources. */
type DealCompanyId = string | number | null | undefined;

/**
 * ---------------------------------------------------------------------------
 * Le SIRET, exigé au-delà de Qualifié (NOS-1150, NOS-1227)
 * ---------------------------------------------------------------------------
 * Le seuil a bougé deux fois, chaque fois sur mesure.
 *
 * **À la création** (abandonné) : 46 des 53 opportunités créées en 60 jours
 * auraient été refusées — 87 %. Un commercial en salon qui note un prénom et
 * un numéro n'a pas de raison sociale à donner.
 *
 * **À Qualifié** (abandonné) : la mesure du 1er septembre 2026 montre que
 * **28 des 37 opportunités qualifiées n'ont pas de SIRET**, soit 76 %. Le
 * seuil reproduisait donc le défaut qu'il corrigeait, un cran plus loin :
 * qualifier, c'est encore explorer, et on qualifie souvent avant d'avoir la
 * fiche registre de l'établissement.
 *
 * **Au-delà de Qualifié** (en vigueur). Simon : « bloque le changement de
 * statut d'un lead sans SIRET seulement si l'opportunité passe à un statut
 * supérieur à qualifié ». On entre librement, on qualifie librement, on ne
 * démarre pas un POC sur un établissement qu'on n'a pas identifié.
 *
 * Une barrière que la majorité des cas heurte n'est pas un garde-fou de
 * qualité : elle pousse à saisir de faux SIRET pour passer, ce qui est pire
 * qu'un champ vide — une donnée fausse ne se signale pas.
 *
 * ## Ce qui n'est jamais bloqué, et pourquoi
 *
 * `lost` et `churn` en sont exclus, délibérément. Empêcher de classer une
 * affaire en perdue faute de SIRET la laisserait pourrir dans le pipeline en
 * gonflant les prévisions — le contrôle produirait exactement le mensonge
 * qu'il prétend empêcher. On doit toujours pouvoir fermer une affaire.
 *
 * `a-reclasser`, `lead` et désormais `qualified` restent libres : ce sont les
 * étapes où l'on ne sait pas encore à qui l'on parle.
 */
/** Étapes qui exigent une société identifiée. */
export const STAGES_REQUIRING_SIRET = [
  // `demo-poc` a été redécoupée en `demo` + `poc` le 06/09/2026. Les deux
  // héritent de l'exigence : le seuil voulu par Simon est « au-dessus de
  // qualifié », et la démo reste au-dessus de qualifié.
  "demo",
  "poc",
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
