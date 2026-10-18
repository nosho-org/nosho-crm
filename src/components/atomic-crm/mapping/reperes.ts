import type { Point } from "./geocoder";
import { projeter, type Cadrage } from "./projection";
import villes from "./villes.json";

/**
 * ---------------------------------------------------------------------------
 * Les villes repères : savoir où l'on est quand on n'a pas de lead
 * ---------------------------------------------------------------------------
 * Simon, le 18/10/2026 : « ajoute-moi toutes les villes de plus de 10 000
 * habitants aussi ».
 *
 * La carte ne portait que NOS villes. Entre deux prospects, le dessin était un
 * contour de département vide : on voyait une pastille dans le Var sans savoir
 * si elle était à Toulon ou à Draguignan. Les repères donnent le pays sous les
 * leads.
 *
 * ## 988 villes, et non 1 067
 *
 * Le seuil de 10 000 habitants retient 1 067 communes. Soixante-dix-neuf sont
 * outre-mer — Fort-de-France, Cayenne, Saint-Denis de La Réunion, Papeete — et
 * l'emprise du dessin s'arrête à la métropole : les projeter les empilerait
 * dans un coin de l'Atlantique. Elles sont écartées à la construction du
 * fichier, pas masquées au rendu, pour que le compte affiché soit vrai.
 *
 * ## Ce sont des REPÈRES, pas des données
 *
 * Trois règles les tiennent à leur place, et chacune se voit dans le dessin :
 *
 * 1. **Ils passent en dernier.** Départements, puis nos villes, puis les
 *    repères — chaque couche évite les boîtes déjà prises. Un repère ne vole
 *    jamais la place d'un prospect ; c'est tout l'inverse qui doit arriver.
 * 2. **Ils s'effacent quand ils doublent.** Une ville où l'on a une
 *    opportunité est déjà dessinée, en couleur. La redessiner en gris à côté
 *    d'elle-même ferait croire à deux lieux.
 * 3. **Le plus peuplé gagne.** À l'échelle de la France, Lyon situe mieux que
 *    Villefranche-sur-Saône. En zoomant, la place se libère et les petites
 *    apparaissent — une mise au point progressive, sans palier à régler.
 *
 * ## Le plafond est une mesure, pas une précaution
 *
 * Le placement est quadratique : chaque candidat se compare aux boîtes déjà
 * prises. À 988 candidats et ~80 boîtes, c'est 80 000 comparaisons par image,
 * et le zoom à la molette en produit une trentaine par seconde. Le plafond de
 * `PLAFOND_REPERES` ne coupe rien de visible — à la France entière, moins de
 * cent noms tiennent — mais il borne le travail sur un écran qui doit rester
 * fluide sous le doigt.
 */

export interface Repere {
  /** `lat,lng` arrondi comme l'index des communes : la clé d'une pastille. */
  cle: string;
  nom: string;
  population: number;
  /** Le lieu lui-meme, dont la deduction par intitule a besoin. */
  point: Point;
  x: number;
  y: number;
}

/** [nom, lat, lng, population], trié par population décroissante. */
type LigneVille = [string, number, number, number];

/**
 * Projetées une fois pour toutes au chargement du module.
 *
 * Mille projections de Mercator à chaque image seraient gratuites à mesurer et
 * coûteuses à oublier : le cadrage change trente fois par seconde pendant un
 * zoom, les villes jamais.
 */
export const REPERES: Repere[] = (
  villes as unknown as { villes: LigneVille[] }
).villes.map(([nom, lat, lng, population]) => ({
  cle: `${lat},${lng}`,
  nom,
  population,
  point: { lat, lng },
  ...projeter({ lat, lng }),
}));

export const PLAFOND_REPERES = 400;

/**
 * Les repères qu'il vaut la peine de proposer au placement.
 *
 * Le cadrage est élargi d'une marge : un nom dont le point sort à peine de la
 * fenêtre reste utile, et le couper net ferait clignoter les bords pendant un
 * glissement.
 */
export function reperesVisibles(
  cadrage: Cadrage,
  dejaDessinees: Set<string>,
  plafond: number = PLAFOND_REPERES,
): Repere[] {
  const margeX = cadrage.largeur * 0.08;
  const margeY = cadrage.hauteur * 0.08;
  const retenus: Repere[] = [];

  // REPERES est déjà trié par population décroissante : on s'arrête dès que le
  // plafond est atteint, et ce sont les plus grandes qui ont été vues.
  for (const repere of REPERES) {
    if (retenus.length >= plafond) break;
    if (dejaDessinees.has(repere.cle)) continue;
    if (
      repere.x < cadrage.x - margeX ||
      repere.x > cadrage.x + cadrage.largeur + margeX ||
      repere.y < cadrage.y - margeY ||
      repere.y > cadrage.y + cadrage.hauteur + margeY
    ) {
      continue;
    }
    retenus.push(repere);
  }

  return retenus;
}
