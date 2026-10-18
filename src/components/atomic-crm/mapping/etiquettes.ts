/**
 * ---------------------------------------------------------------------------
 * Ce qui porte un nom, et à partir de quel zoom
 * ---------------------------------------------------------------------------
 * Simon, le 18/10/2026 : « tu ajoutes sur la carte le nom des villes ainsi que
 * le nom des départements. Et dès lors qu'on zoome sur une des opportunités, je
 * veux que le nom de l'opportunité s'affiche et aussi qu'elle soit cliquable. »
 *
 * ## Trois couches, trois seuils, et c'est la contrainte qui les impose
 *
 * Tout afficher d'un coup n'est pas une option : à la France entière, 96 noms
 * de départements et 105 noms de villes se chevauchent au point qu'aucun ne se
 * lit — on aurait ajouté du bruit en croyant ajouter de l'information.
 *
 * Les seuils ci-dessous sont des MESURES, pas des préférences. Le repère est la
 * hauteur d'un texte une fois projetée : l'étiquette fait 11 px d'écran, le
 * dessin 1000 unités de large, et un nom de département en occupe 60 à 140
 * selon sa longueur. À la France entière, « Bouches-du-Rhône » couvrirait un
 * tiers de la Provence.
 *
 * | zoom | ce qui s'écrit |
 * |---|---|
 * | 1 → 2 | rien : on lit des formes, pas des mots |
 * | 2 → 3,5 | les **départements** |
 * | 3,5 → 9 | les départements et les **villes** |
 * | ≥ 9 | les **opportunités**, éclatées autour de leur ville |
 *
 * ## Les opportunités s'ÉCLATENT, elles ne s'empilent pas
 *
 * Toutes les affaires d'une ville partagent le même point — le centre de la
 * commune. Écrire leurs noms là-dessus les superposerait au caractère près.
 * Au-delà du dernier seuil, la pastille s'ouvre donc en couronne : une marque
 * par affaire, son nom à côté, et un lien vers sa fiche.
 *
 * C'est le seul endroit de cet écran où l'on invente une position. Elle est
 * assumée et dite : un point de la couronne ne prétend pas être une adresse,
 * il désigne une affaire DANS cette ville. La base ne porte de toute façon que
 * le code postal — aucune coordonnée de rue n'existe nulle part.
 */

export const SEUIL_DEPARTEMENTS = 2;
export const SEUIL_VILLES = 3.5;
export const SEUIL_OPPORTUNITES = 5;

export interface Boite {
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
}

/**
 * Une étiquette en attente de place.
 *
 * `poids` décide qui gagne un conflit : la plus grosse ville garde son nom, la
 * plus petite le perd. L'inverse ferait disparaître Marseille au profit d'un
 * village voisin, ce qui est le contraire de ce qu'on vient lire.
 */
export interface EtiquetteCandidate<T> {
  cle: string;
  x: number;
  y: number;
  texte: string;
  poids: number;
  valeur: T;
}

export interface EtiquettePlacee<T> extends EtiquetteCandidate<T> {
  boite: Boite;
}

function seChevauchent(a: Boite, b: Boite): boolean {
  return (
    a.x < b.x + b.largeur &&
    a.x + a.largeur > b.x &&
    a.y < b.y + b.hauteur &&
    a.y + a.hauteur > b.y
  );
}

/**
 * Place ce qui tient, écarte le reste.
 *
 * Un algorithme glouton par poids décroissant : simple, stable d'un rendu à
 * l'autre — ce qui compte autant que le résultat, une étiquette qui clignote
 * au moindre déplacement est pire qu'une étiquette absente — et suffisant à
 * cette densité. Les alternatives sérieuses (recuit simulé, force-directed)
 * coûteraient un paquet et une boucle d'animation pour quelques dizaines de
 * mots.
 *
 * ⚠️ `largeurParCaractere` et `hauteur` sont des APPROXIMATIONS de la boîte du
 * texte, en unités du dessin. On ne mesure pas le texte réel : `getBBox` force
 * un recalcul de mise en page à chaque image, et le zoom en produit trente par
 * seconde. Une approximation généreuse se trompe en espaçant trop, ce qui se
 * voit à peine ; une approximation serrée laisse deux noms se toucher.
 */
export function placerLesEtiquettes<T>(
  candidates: EtiquetteCandidate<T>[],
  options: { largeurParCaractere: number; hauteur: number; deja?: Boite[] },
): EtiquettePlacee<T>[] {
  const prises: Boite[] = [...(options.deja ?? [])];
  const placees: EtiquettePlacee<T>[] = [];

  const ordonnees = [...candidates].sort(
    (a, b) => b.poids - a.poids || a.cle.localeCompare(b.cle),
  );

  for (const candidate of ordonnees) {
    const largeur = candidate.texte.length * options.largeurParCaractere;
    const boite: Boite = {
      // Le texte est centré sur le point, et posé SOUS lui.
      x: candidate.x - largeur / 2,
      y: candidate.y,
      largeur,
      hauteur: options.hauteur,
    };
    if (prises.some((prise) => seChevauchent(prise, boite))) continue;
    prises.push(boite);
    placees.push({ ...candidate, boite });
  }

  return placees;
}

/**
 * Les positions d'une couronne autour d'un point.
 *
 * Une seule affaire reste au centre : lui faire faire le tour d'un cercle
 * invisible la déplacerait sans rien apprendre à personne.
 *
 * Le premier point part du HAUT et l'on tourne dans le sens des aiguilles —
 * l'ordre dans lequel on lit une liste.
 */
export function couronne(
  nombre: number,
  rayon: number,
): { dx: number; dy: number }[] {
  if (nombre <= 1) return [{ dx: 0, dy: 0 }];

  const positions: { dx: number; dy: number }[] = [];
  let place = 0;
  let anneau = 0;
  while (place < nombre) {
    // Un anneau plus large tient plus de monde : sa circonference grandit
    // avec son rang, et sa capacite avec elle. Tout entasser sur un seul
    // cercle collerait les marques des le douzieme prospect.
    const capacite = PAR_ANNEAU * (anneau + 1);
    const combien = Math.min(capacite, nombre - place);
    const rayonAnneau = rayon * (anneau + 1);
    for (let index = 0; index < combien; index++) {
      const angle = -Math.PI / 2 + (index * 2 * Math.PI) / combien;
      positions.push({
        dx: Math.cos(angle) * rayonAnneau,
        dy: Math.sin(angle) * rayonAnneau,
      });
    }
    place += combien;
    anneau++;
  }
  return positions;
}

/** Combien de marques tient le premier anneau ; les suivants, un multiple. */
const PAR_ANNEAU = 8;

/**
 * Le centre d'un département, pour y poser son nom.
 *
 * Le centroïde de l'anneau le plus LONG, et pas la moyenne de tous les points :
 * un département à îles — le Morbihan, la Charente-Maritime — verrait son nom
 * tiré vers la mer par une poignée de cailloux. Le plus long anneau est le
 * continent.
 *
 * Ce n'est pas un « point sur la surface » au sens strict : sur un département
 * en croissant, le centroïde peut tomber hors du polygone. Aucun département
 * français n'est à ce point concave, et le vérifier coûterait un algorithme de
 * placement de point intérieur pour un gain nul.
 */
export function centreDuPlusGrandAnneau(
  polygones: number[][][][],
): { lat: number; lng: number } | null {
  let meilleur: number[][] | null = null;
  for (const polygone of polygones) {
    for (const anneau of polygone) {
      if (!meilleur || anneau.length > meilleur.length) meilleur = anneau;
    }
  }
  if (!meilleur || meilleur.length === 0) return null;

  let sommeLng = 0;
  let sommeLat = 0;
  for (const [lng, lat] of meilleur) {
    sommeLng += lng;
    sommeLat += lat;
  }
  return {
    lng: sommeLng / meilleur.length,
    lat: sommeLat / meilleur.length,
  };
}

/** Coupe un nom trop long plutôt que de le laisser traverser la carte. */
export function tronquer(texte: string, maximum: number): string {
  if (texte.length <= maximum) return texte;
  return `${texte.slice(0, Math.max(1, maximum - 1)).trimEnd()}…`;
}
