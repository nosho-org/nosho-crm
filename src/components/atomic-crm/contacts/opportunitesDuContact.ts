/**
 * ---------------------------------------------------------------------------
 * Quelles opportunités d'un contact le raccourci propose, et dans quel ordre
 * ---------------------------------------------------------------------------
 * Simon, le 09/09/2026 (NOS-1483) : « au niveau de la fiche contact, mets un
 * bouton qui permet de remonter directement sur l'opportunité sur laquelle il
 * est associé », puis, après un premier jet : « mets que les opportunités
 * ouvertes en fait ».
 *
 * ## Ce que « ouverte » veut dire ici
 *
 * Deux façons de ne plus l'être, et elles ne se recouvrent pas :
 *
 *   * l'affaire est arrivée à son terme — gagnée, perdue, churnée ;
 *   * l'affaire a été rangée (`archived_at`), ce qui peut arriver à n'importe
 *     quelle étape. Une archivée reste souvent au stade « Lead » : c'est
 *     justement pour cela qu'on l'a rangée.
 *
 * Les deux sont écartées. Le raccourci sert à reprendre un travail en cours ;
 * une affaire gagnée il y a huit mois n'en est pas un, même si elle a été
 * modifiée hier.
 *
 * ## Ce que ce filtre coûte, mesuré avant de l'écrire
 *
 * Sur 516 contacts en production :
 *
 *   225 ont au moins une opportunité ouverte (223 en ont exactement une)
 *    96 ont des opportunités, mais **aucune ouverte** — pas de bouton
 *   195 n'en ont aucune
 *
 * Ces 96 contacts n'ont donc pas de raccourci. C'est le prix assumé du choix :
 * un bouton qui mènerait à une affaire close ou rangée sans le dire tromperait
 * plus qu'il n'aiderait, et la fiche de la société reste le chemin complet.
 *
 * ## L'ordre
 *
 * La plus récemment modifiée d'abord — c'est celle dont on vient de parler.
 * Deux contacts seulement en ont plus d'une (l'un en a cinq), mais pour
 * ceux-là l'ordre est la seule chose qui distingue un raccourci d'une liste.
 *
 * ## Une étape inconnue compte comme ouverte
 *
 * Les slugs d'étape ont déjà changé deux fois (`demo-poc` découpé, puis
 * `negociation` retiré) et l'historique en garde la trace. Une étape absente de
 * la liste des étapes terminales est traitée comme **ouverte** : faire
 * disparaître une affaire vivante est un dommage réel, alors qu'en montrer une
 * close de trop ne coûte qu'un coup d'œil.
 */

/** Le strict nécessaire pour trancher. */
export interface OpportuniteOrdonnable {
  stage: string;
  updated_at?: string | null;
  archived_at?: string | null;
}

/** Une opportunité sur laquelle il reste quelque chose à faire. */
export function estOuverte<T extends OpportuniteOrdonnable>(
  opportunite: T,
  etapesTerminales: readonly string[] | ReadonlySet<string>,
): boolean {
  const terminales =
    etapesTerminales instanceof Set
      ? etapesTerminales
      : new Set(etapesTerminales as readonly string[]);
  return !opportunite.archived_at && !terminales.has(opportunite.stage);
}

/**
 * Les opportunités ouvertes d'un contact, la plus récemment modifiée d'abord.
 *
 * Ne modifie pas le tableau reçu : il vient de React Query, dont le cache est
 * partagé avec les autres écrans qui lisent la même requête.
 */
export function opportunitesOuvertes<T extends OpportuniteOrdonnable>(
  opportunites: readonly T[],
  etapesTerminales: readonly string[],
): T[] {
  const terminales = new Set(etapesTerminales);

  // Une date absente ou illisible ne doit pas remonter en tête : `NaN` gagnerait
  // toutes les comparaisons dans un sens et les perdrait dans l'autre, ce qui
  // rendrait l'ordre dépendant de la position initiale.
  const modifiee = (o: T) => {
    const t = o.updated_at ? Date.parse(o.updated_at) : Number.NaN;
    return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
  };

  return opportunites
    .filter((o) => estOuverte(o, terminales))
    .sort((a, b) => modifiee(b) - modifiee(a));
}
