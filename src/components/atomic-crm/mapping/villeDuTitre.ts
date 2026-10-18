import { replier } from "./geocoder";
import { REPERES, type Repere } from "./reperes";

/**
 * ---------------------------------------------------------------------------
 * Lire une ville dans l'intitulé d'une opportunité
 * ---------------------------------------------------------------------------
 * Simon, le 18/10/2026 : « concernant les 145 opportunités sans adresse,
 * celles qui ont un nom de ville dans leur titre, les mettre directement sur
 * la carte au niveau de la ville concernée ».
 *
 * 145 des 446 opportunités ouvertes n'ont ni code postal ni ville sur leur
 * société. Beaucoup portent pourtant le lieu dans leur nom — « CHU de
 * Bordeaux », « IMRO Imagerie Limoges », « STRASBOURG ONCOLOGIE LIBERALE ».
 * La donnée est là, mal rangée.
 *
 * ## C'est une DÉDUCTION, et la carte le dit
 *
 * Un point déduit d'un intitulé n'est pas une adresse. Mesuré sur la
 * production le 18/10/2026 : 28 des 145 trouvent une ville, et **deux se
 * trompaient** avant les garde-fous ci-dessous. Le reste de l'écran traite
 * donc ces affaires à part — pastille cerclée de pointillés, compte annoncé
 * séparément, mention dans le détail de la ville. On ne les fond pas dans les
 * autres : un point faux qui se lit comme un fait ne se corrige jamais, parce
 * que personne ne revient vérifier.
 *
 * ## Pourquoi seulement les villes de plus de 10 000 habitants
 *
 * L'index complet des communes en porte 35 000, dont des centaines dont le nom
 * est un mot courant — Le Pont, La Chapelle, Les Essarts, Bourg. Chercher
 * là-dedans dans un intitulé libre produirait une ville à chaque ligne. Les
 * 988 villes repères sont assez grandes pour qu'un rédacteur qui écrit leur
 * nom veuille dire le lieu.
 *
 * ## Le plus long gagne
 *
 * « Aix-les-Bains » contient « Aix ». Sans préférence pour la correspondance
 * la plus longue, un cabinet d'Aix-les-Bains atterrirait à Aix-en-Provence,
 * à 300 km. C'est le même raisonnement que le code postal avant le nom dans
 * le géocodeur : on prend d'abord ce qui discrimine le mieux.
 */

/**
 * Les expressions où un nom de ville n'est pas un lieu.
 *
 * Mesurées, pas supposées : ce sont les deux seules erreurs qu'ait produites
 * la recherche sur les 145 intitulés de la production.
 *
 * - « Croix-Rouge » est une organisation ; Croix est une commune du Nord, et
 *   l'antenne qui porte ce nom peut être n'importe où en France.
 * - L'hôpital « Édouard Toulouse » est à **Marseille** : il porte le nom d'un
 *   psychiatre, pas celui d'une ville.
 *
 * La liste est faite pour grandir. Tout éponyme de la santé française qui
 * entre en collision avec un nom de ville a sa place ici — c'est un piège
 * récurrent dans un secteur qui baptise ses établissements d'après des gens.
 */
export const EXPRESSIONS_TROMPEUSES = [
  "croix rouge",
  "edouard toulouse",
] as const;

/** Le plus grand nombre de mots d'un nom de ville, pour borner la recherche. */
const MOTS_MAXIMUM = REPERES.reduce(
  (max, repere) => Math.max(max, replier(repere.nom).split(" ").length),
  1,
);

/**
 * Nom replié → ville. À noms repliés identiques, la plus peuplée gagne.
 *
 * `REPERES` est trié par population décroissante : la première rencontrée est
 * donc la bonne, et le `has` suffit à garder ce rang.
 */
const PAR_NOM = (() => {
  const index = new Map<string, Repere>();
  for (const repere of REPERES) {
    const cle = replier(repere.nom);
    if (!index.has(cle)) index.set(cle, repere);
  }
  return index;
})();

/**
 * La ville nommée dans un intitulé, ou `null`.
 *
 * `null` est la réponse normale : deux intitulés sur trois ne nomment aucun
 * lieu, et il n'y a rien à en déduire.
 */
export function villeDuTitre(titre: string | null | undefined): Repere | null {
  const replie = replier(titre);
  if (!replie) return null;

  const mots = replie.split(" ").filter(Boolean);
  let meilleure: { repere: Repere; longueur: number } | null = null;

  for (let debut = 0; debut < mots.length; debut++) {
    const reste = Math.min(MOTS_MAXIMUM, mots.length - debut);
    for (let longueur = reste; longueur >= 1; longueur--) {
      const essai = mots.slice(debut, debut + longueur).join(" ");
      const repere = PAR_NOM.get(essai);
      if (!repere) continue;
      // Une correspondance prise dans une expression trompeuse ne compte pas.
      if (danslUnePiege(mots, debut, longueur)) continue;
      if (!meilleure || longueur > meilleure.longueur) {
        meilleure = { repere, longueur };
      }
      // Inutile de regarder plus court à cette position.
      break;
    }
  }

  return meilleure?.repere ?? null;
}

/** La correspondance tombe-t-elle à l'intérieur d'une expression trompeuse ? */
function danslUnePiege(
  mots: string[],
  debut: number,
  longueur: number,
): boolean {
  for (const expression of EXPRESSIONS_TROMPEUSES) {
    const motsPiege = expression.split(" ");
    for (let i = 0; i + motsPiege.length <= mots.length; i++) {
      const correspond = motsPiege.every((mot, j) => mots[i + j] === mot);
      if (!correspond) continue;
      // Chevauchement entre [debut, debut+longueur[ et [i, i+motsPiege.length[
      if (debut < i + motsPiege.length && debut + longueur > i) return true;
    }
  }
  return false;
}
