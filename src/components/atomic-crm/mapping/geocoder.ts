import communes from "./communes.json";

/**
 * ---------------------------------------------------------------------------
 * Placer une société sur la carte, sans appeler personne
 * ---------------------------------------------------------------------------
 * Simon, le 18/10/2026 : « une vision très schématique des villes dans
 * lesquelles on a des leads […] une carte de France où on peut zoomer,
 * dézoomer ».
 *
 * La base ne porte AUCUNE coordonnée : `companies` a `address`, `zipcode`,
 * `city`, `country`, et rien d'autre. Il faut donc traduire une adresse en
 * point, et trois chemins étaient possibles.
 *
 * ## Pourquoi une table embarquée plutôt qu'un géocodeur
 *
 * **Appeler une API à l'affichage** — la Base Adresse Nationale est gratuite et
 * sans clé — ferait dépendre un écran de lecture d'un service tiers, à qui on
 * enverrait les adresses de nos prospects. Le dépôt masque déjà les numéros de
 * téléphone de ses propres transcriptions ; envoyer la liste de nos clients à
 * un tiers pour dessiner des points serait incohérent.
 *
 * **Géocoder une fois en base** — deux colonnes sur `companies`, un script de
 * reprise — serait plus propre à la lecture et moins lourd au chargement. Mais
 * une société créée demain n'aurait pas de point tant que personne n'aurait
 * relancé le script, et la carte mentirait en silence : exactement le mode de
 * panne que ce CRM paie le plus cher.
 *
 * **La table embarquée** se soigne toute seule : une société saisie dans dix
 * minutes se place sans qu'aucun travail d'arrière-plan n'ait tourné. Elle
 * coûte 465 Ko de données, sur une route chargée à la demande — le même écran
 * charge déjà mille opportunités.
 *
 * ## Deux index, et l'ordre compte
 *
 * Le CODE POSTAL d'abord : il désigne une commune sans ambiguïté, là où un nom
 * de ville est saisi à la main, avec ou sans accents, « Aix En Provence » ou
 * « Aix-en-Provence ». Le NOM ensuite, replié sans accents ni ponctuation.
 *
 * Mesuré sur la production le 18/10/2026, sur les 150 couples
 * (code postal, ville) distincts que portent les opportunités :
 *
 * | | |
 * |---|---|
 * | résolus par le code postal | 125 |
 * | résolus par le nom | 23 |
 * | non résolus | **2** — « Hauts-De-France » et « Île-De-France » |
 *
 * Les deux échecs sont des RÉGIONS saisies dans le champ ville. Les refuser est
 * le bon comportement : placer un point au centre de l'Île-de-France
 * dessinerait une précision que la donnée n'a pas.
 *
 * ## Ce que la table ne contient pas
 *
 * Les communes de moins de mille habitants n'ont pas d'entrée au NOM — elles en
 * ont une par code postal, qui est le chemin normal. C'est ce qui fait tenir
 * l'index en 465 Ko au lieu de 1,2 Mo ; vérifié sur la production, le seuil ne
 * perd aucun lieu.
 *
 * Et la France seulement. `companies.country` existe mais 100 % des sociétés
 * renseignées sont françaises au 18/10/2026 : une carte d'Europe pour une
 * société belge hypothétique coûterait la lisibilité de celle qu'on a.
 */

export interface Point {
  lat: number;
  lng: number;
}

interface IndexCommunes {
  /** Code postal à cinq chiffres → point. La commune la plus peuplée gagne. */
  cp: Record<string, [number, number]>;
  /** Nom replié → point, communes de mille habitants et plus. */
  nom: Record<string, [number, number]>;
}

const INDEX = communes as unknown as IndexCommunes;

/**
 * Minuscules, sans accents, ponctuation réduite à une espace.
 *
 * Le même repli que `dealCardSubline` et `noms_proches` : la saisie humaine
 * n'est jamais au caractère près, et « Aix-en-Provence », « AIX EN PROVENCE »
 * et « Aix En Provence » sont la même ville. Les trois existent en production.
 */
export function replier(valeur: string | null | undefined): string {
  return (valeur ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Ce qu'une société donne à placer, et rien de plus. */
export interface AdresseFrancaise {
  zipcode?: string | null;
  city?: string | null;
}

/**
 * Le point d'une adresse, ou `null` quand on ne sait pas.
 *
 * `null` n'est pas un échec à corriger : c'est une société dont on ignore où
 * elle est. La carte le DIT plutôt que de l'inventer — un point faux se lit
 * comme un fait, et personne ne revient vérifier.
 */
export function placer(adresse: AdresseFrancaise): Point | null {
  // Le code postal porte parfois une espace en fin de saisie — deux cas en
  // production — et c'est le genre de détail qui fait perdre une ville entière.
  const cp = (adresse.zipcode ?? "").trim();
  const parCp = INDEX.cp[cp];
  if (parCp) return { lat: parCp[0], lng: parCp[1] };

  const nom = replier(adresse.city);
  const parNom = nom ? INDEX.nom[nom] : undefined;
  if (parNom) return { lat: parNom[0], lng: parNom[1] };

  return null;
}

/** Le nombre d'entrées, pour que les tests mesurent au lieu d'affirmer. */
export const TAILLE_INDEX = {
  codesPostaux: Object.keys(INDEX.cp).length,
  noms: Object.keys(INDEX.nom).length,
};
