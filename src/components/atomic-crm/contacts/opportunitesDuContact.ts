/**
 * ---------------------------------------------------------------------------
 * Dans quel ordre présenter les opportunités d'un contact
 * ---------------------------------------------------------------------------
 * Simon, le 09/09/2026 (NOS-1483) : « au niveau de la fiche contact, mets un
 * bouton qui permet de remonter directement sur l'opportunité sur laquelle il
 * est associé ».
 *
 * Le mot est au singulier, et il a presque toujours raison. Mesuré en
 * production avant d'écrire : sur 516 contacts, 307 portent **exactement une**
 * opportunité, 195 n'en portent aucune, et 14 en portent plusieurs — dont un
 * qui en porte cinq.
 *
 * Le bouton doit donc mener droit au but dans 96 % des cas rattachés, sans
 * mentir dans les 4 % restants. D'où ce module : il ne décide pas de l'écran,
 * il décide seulement **laquelle vient en premier**, ce qui est la seule
 * question qu'un raccourci ait à trancher.
 *
 * ## La règle
 *
 * Une opportunité ouverte passe devant une opportunité close. Le raccourci
 * sert à reprendre un travail en cours ; envoyer sur une affaire gagnée il y a
 * huit mois parce qu'elle a été modifiée hier serait exactement le contraire.
 *
 * À statut égal, la plus récemment modifiée d'abord — c'est celle dont on
 * vient de parler.
 *
 * ## Une étape inconnue compte comme ouverte
 *
 * Les slugs d'étape ont déjà changé deux fois (`demo-poc` découpé, puis
 * `negociation` retiré) et l'historique en garde la trace. Une étape absente de
 * la liste des étapes terminales est traitée comme **ouverte** : mal classer
 * une affaire vivante en la reléguant au fond est un dommage réel, alors que
 * remonter une affaire close d'un rang ne coûte qu'un clic.
 */

/** Le strict nécessaire pour trancher l'ordre. */
export interface OpportuniteOrdonnable {
  stage: string;
  updated_at?: string | null;
}

/**
 * Range les opportunités d'un contact, les ouvertes d'abord.
 *
 * Ne modifie pas le tableau reçu : il vient de React Query, dont le cache est
 * partagé avec les autres écrans qui lisent la même requête.
 */
export function ordonnerOpportunites<T extends OpportuniteOrdonnable>(
  opportunites: readonly T[],
  etapesTerminales: readonly string[],
): T[] {
  const terminales = new Set(etapesTerminales);
  const estClose = (o: T) => terminales.has(o.stage);

  // Une date absente ou illisible ne doit pas remonter en tête : `NaN` gagnerait
  // toutes les comparaisons dans un sens et les perdrait dans l'autre, ce qui
  // rendrait l'ordre dépendant de la position initiale.
  const modifiee = (o: T) => {
    const t = o.updated_at ? Date.parse(o.updated_at) : Number.NaN;
    return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
  };

  return [...opportunites].sort((a, b) => {
    if (estClose(a) !== estClose(b)) return estClose(a) ? 1 : -1;
    return modifiee(b) - modifiee(a);
  });
}
