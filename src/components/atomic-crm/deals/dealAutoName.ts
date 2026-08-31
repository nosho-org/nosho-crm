/**
 * ---------------------------------------------------------------------------
 * Le nom de l'opportunité, dérivé de la société (NOS-1208)
 * ---------------------------------------------------------------------------
 * Simon : « supprime le champ nom de l'opportunité, il sert à rien, tu
 * reprends automatiquement le nom de la société ».
 *
 * Le champ ayant disparu de l'écran, ce calcul n'est plus une commodité : il
 * est le SEUL chemin qui remplit `deals.name`, colonne `not null`. S'il ne se
 * déclenche pas, la création échoue sur une erreur Postgres brute.
 *
 * D'où l'extraction : la décision est ici, en fonction pure, et testée. La
 * version précédente vivait dans un `useEffect` et portait un défaut que rien
 * ne pouvait attraper — voir `EtatPrecedent` ci-dessous.
 */

/**
 * Ce qu'on a vu au tour d'avant.
 *
 * `undefined` ne peut pas servir de « jamais vu » : c'est exactement la valeur
 * de `company_id` sur un formulaire de création vierge. Avec cette sentinelle,
 * le premier choix de société était pris pour un montage et ignoré — le nom ne
 * se remplissait donc jamais depuis un formulaire neuf.
 */
export const JAMAIS_VU = Symbol("jamais-vu");

export type EtatPrecedent = typeof JAMAIS_VU | unknown;

export interface DecisionNom {
  /** L'identifiant de société observé, à mémoriser pour le tour suivant. */
  societeVue: unknown;
  /** Le nom à écrire, ou `null` s'il n'y a rien à faire. */
  nom: string | null;
}

/**
 * Faut-il réécrire le nom, et avec quoi.
 *
 * Trois refus, dans cet ordre :
 *
 * 1. **Le montage.** Ouvrir une opportunité existante ne doit pas la renommer.
 *    On ne réagit qu'à une transition réelle d'une société vers une autre.
 * 2. **La saisie humaine.** Un intitulé écrit à la main est conservé, y
 *    compris si la société change ensuite. Le champ n'est plus affiché, mais
 *    les opportunités créées avant le changement en portent — celles du
 *    pipeline investisseurs notamment.
 * 3. **La valeur déjà bonne.** Réécrire à l'identique ferait un rendu de plus
 *    et marquerait le formulaire modifié pour rien.
 */
export function deciderNom({
  precedent,
  societeId,
  nomSociete,
  nomActuel,
  nomTouche,
}: {
  precedent: EtatPrecedent;
  societeId: unknown;
  nomSociete: string | null | undefined;
  nomActuel: string | null | undefined;
  nomTouche: boolean;
}): DecisionNom {
  const rien: DecisionNom = { societeVue: societeId, nom: null };

  if (precedent === JAMAIS_VU) return rien;
  if (precedent === societeId) return rien;
  if (nomTouche) return rien;
  if (!nomSociete) return rien;
  if (nomActuel === nomSociete) return rien;

  return { societeVue: societeId, nom: nomSociete };
}
