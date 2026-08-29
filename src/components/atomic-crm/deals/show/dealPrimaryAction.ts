/**
 * ---------------------------------------------------------------------------
 * Quelle action fait avancer CE deal (NOS-1165)
 * ---------------------------------------------------------------------------
 * L'audit du 29 août 2026 : « Cinq boutons de même poids, aucun principal.
 * L'action qui fait avancer le deal et celle qui l'enterre ont la même
 * apparence. » Cinq contours identiques ne hiérarchisent rien — l'œil doit
 * lire les cinq libellés à chaque ouverture de fiche.
 *
 * Un seul bouton plein, donc, et lequel dépend de l'étape : ce qu'on a à faire
 * sur un lead n'est pas ce qu'on a à faire sur une proposition.
 *
 * ## Pourquoi une table et non une règle
 *
 * Le choix n'est pas déductible d'un principe : il vient du processus
 * commercial de Nosho, qui est une convention. Une table se lit, se discute et
 * se change sans démonter de logique.
 *
 * ## Les étapes sans action principale
 *
 * `lost` et `churn` n'en ont pas, et c'est délibéré : rien ne fait plus avancer
 * un dossier perdu. Mettre un bouton plein sur une affaire close inviterait à
 * agir là où il n'y a plus rien à faire. `closed-won` non plus — le contrat
 * cadre y est possible mais ce n'est plus une étape de vente, c'est de
 * l'administratif, et il reste accessible en contour.
 */

export type DealPrimaryAction = "task" | "proposal" | "contract" | null;

/**
 * L'action principale par étape.
 *
 * - `lead`, `qualified` : le deal avance par un contact. Une tâche datée est
 *   ce qui le fait bouger — c'est aussi ce que mesure l'alerte de santé du
 *   pipeline, qui compte les opportunités sans prochaine action.
 * - `demo-poc` : la démo est passée, la suite est la proposition. C'est
 *   précisément le goulot relevé par l'audit — aucun deal n'a franchi
 *   Démo → Proposition ce trimestre.
 * - `proposal`, `negociation` : la proposition est partie, ce qui reste à
 *   produire est le contrat.
 */
const PRIMARY_BY_STAGE: Record<string, DealPrimaryAction> = {
  lead: "task",
  qualified: "task",
  "demo-poc": "proposal",
  proposal: "contract",
  negociation: "contract",
  "closed-won": null,
  lost: null,
  churn: null,
};

/**
 * L'action principale de la fiche, ou `null` s'il n'y en a pas.
 *
 * Une étape inconnue — un slug hérité, une étape ajoutée en configuration sans
 * passer ici — retombe sur `task` plutôt que sur rien : proposer de planifier
 * quelque chose est toujours défendable, et ne rien proposer sur une étape
 * active le serait moins.
 */
export function getDealPrimaryAction(
  stage: string | null | undefined,
  options: { hasCompany?: boolean } = {},
): DealPrimaryAction {
  if (!stage) return "task";

  const primary = Object.prototype.hasOwnProperty.call(PRIMARY_BY_STAGE, stage)
    ? PRIMARY_BY_STAGE[stage]
    : "task";

  // Un contrat identifie une personne morale : sans société, `ContractAction`
  // ne rend rien du tout, et désigner comme principale une action absente
  // laisserait la fiche sans bouton plein.
  if (primary === "contract" && options.hasCompany === false) return "proposal";

  return primary;
}
