import type { Point } from "./geocoder";

/**
 * ---------------------------------------------------------------------------
 * De la latitude à un pixel, et retour
 * ---------------------------------------------------------------------------
 * Une projection conique conforme serait la bonne réponse cartographique pour
 * la France. On prend une **Mercator**, et il faut savoir pourquoi avant de
 * juger que c'est un raccourci :
 *
 * - elle tient en six lignes qu'on peut relire, là où une conique demande deux
 *   parallèles de référence et une trigonométrie qu'aucun test d'ici ne saurait
 *   vérifier autrement qu'en recopiant la formule ;
 * - sur l'emprise de la France métropolitaine — 41° à 51,5° de latitude — la
 *   déformation de Mercator est de l'ordre du pour cent. Sur une carte dont le
 *   but est de dire « nos leads sont dans le Sud-Est », c'est invisible ;
 * - elle est **inversible**, et le zoom en a besoin : zoomer à la molette doit
 *   garder sous le curseur le point qui s'y trouvait.
 *
 * ## L'emprise est FIXE, et c'est ce qui fait tenir le dessin
 *
 * Les bornes ci-dessous encadrent la métropole, Corse comprise. Les calculer
 * depuis les points affichés — le réflexe — ferait bouger la carte à chaque
 * changement de filtre : la France rétrécirait sur un filtre « Nice », et
 * l'écran cesserait d'être une carte pour devenir un nuage de points.
 */

/** Métropole et Corse. `lngMin` mord sur l'Atlantique pour laisser une marge. */
export const EMPRISE = {
  lngMin: -5.2,
  lngMax: 9.8,
  latMin: 41.3,
  latMax: 51.2,
} as const;

/** Mercator : la latitude passe par un logarithme, la longitude non. */
function mercatorY(lat: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2));
}

function mercatorLat(y: number): number {
  return ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;
}

const Y_MIN = mercatorY(EMPRISE.latMin);
const Y_MAX = mercatorY(EMPRISE.latMax);

/**
 * Le repère du dessin, en unités arbitraires.
 *
 * La largeur vaut 1000 et la hauteur suit le rapport réel de l'emprise : c'est
 * ce qui empêche la France d'être écrasée ou étirée quand le conteneur change
 * de forme. Le SVG porte ensuite `preserveAspectRatio`, et le conteneur fait ce
 * qu'il veut.
 */
export const LARGEUR = 1000;
export const HAUTEUR = Math.round(
  (LARGEUR * (Y_MAX - Y_MIN)) /
    ((EMPRISE.lngMax - EMPRISE.lngMin) * (Math.PI / 180)),
);

/** Latitude/longitude → coordonnées du dessin. */
export function projeter(point: Point): { x: number; y: number } {
  const x =
    ((point.lng - EMPRISE.lngMin) / (EMPRISE.lngMax - EMPRISE.lngMin)) *
    LARGEUR;
  const y = ((Y_MAX - mercatorY(point.lat)) / (Y_MAX - Y_MIN)) * HAUTEUR;
  return { x, y };
}

/**
 * L'inverse, dont le zoom a besoin.
 *
 * Sans elle, « zoomer là où est le curseur » devient « zoomer au centre », et
 * chercher une ville demande de rattraper le cadrage après chaque cran de
 * molette.
 */
export function deprojeter(x: number, y: number): Point {
  const lng =
    EMPRISE.lngMin + (x / LARGEUR) * (EMPRISE.lngMax - EMPRISE.lngMin);
  const lat = mercatorLat(Y_MAX - (y / HAUTEUR) * (Y_MAX - Y_MIN));
  return { lat, lng };
}

/**
 * Le cadrage courant : une fenêtre sur le dessin, en unités du dessin.
 *
 * Un `viewBox` SVG et rien d'autre. Le zoom n'est donc ni une transformation
 * CSS — qui épaissirait les traits en grossissant — ni un recalcul des points :
 * c'est le navigateur qui redessine le vectoriel à la bonne échelle, et les
 * contours restent fins à tous les niveaux.
 */
export interface Cadrage {
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
}

export const CADRAGE_ENTIER: Cadrage = {
  x: 0,
  y: 0,
  largeur: LARGEUR,
  hauteur: HAUTEUR,
};

/** On ne descend pas sous le quartier, on ne remonte pas au-delà du pays. */
export const ZOOM_MAX = 40;
export const ZOOM_MIN = 1;

/**
 * Le cadrage après un zoom centré sur un point du dessin.
 *
 * `facteur` au-dessus de 1 rapproche. Le point `(ancreX, ancreY)` garde sa
 * position à l'écran : c'est la propriété qui rend la molette utilisable, et
 * elle se vérifie par un test plutôt que par l'œil.
 */
export function zoomer(
  cadrage: Cadrage,
  facteur: number,
  ancreX: number,
  ancreY: number,
): Cadrage {
  const echelleActuelle = LARGEUR / cadrage.largeur;
  const voulue = echelleActuelle * facteur;
  const echelle = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, voulue));

  const largeur = LARGEUR / echelle;
  const hauteur = HAUTEUR / echelle;
  // La part du cadrage qui sépare l'ancre de son bord gauche doit être la même
  // avant et après : c'est littéralement « le point ne bouge pas ».
  const partX = (ancreX - cadrage.x) / cadrage.largeur;
  const partY = (ancreY - cadrage.y) / cadrage.hauteur;

  return borner({
    x: ancreX - partX * largeur,
    y: ancreY - partY * hauteur,
    largeur,
    hauteur,
  });
}

/**
 * Ramène le cadrage dans le dessin.
 *
 * Sans cette borne, un glissement un peu vif sort de la carte et laisse un
 * écran blanc dont on ne sait pas revenir — il faut alors recharger la page.
 */
export function borner(cadrage: Cadrage): Cadrage {
  const largeur = Math.min(cadrage.largeur, LARGEUR);
  const hauteur = Math.min(cadrage.hauteur, HAUTEUR);
  return {
    largeur,
    hauteur,
    x: Math.min(Math.max(cadrage.x, 0), LARGEUR - largeur),
    y: Math.min(Math.max(cadrage.y, 0), HAUTEUR - hauteur),
  };
}

/** Le glissement : on déplace la fenêtre, jamais le contenu. */
export function glisser(cadrage: Cadrage, dx: number, dy: number): Cadrage {
  return borner({ ...cadrage, x: cadrage.x + dx, y: cadrage.y + dy });
}
