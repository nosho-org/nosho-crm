/**
 * ---------------------------------------------------------------------------
 * Chercher plusieurs mots sans tout ramener (NOS-1235)
 * ---------------------------------------------------------------------------
 * Simon : « quand je cherche "bar le duc" je ne trouve rien ».
 *
 * Il trouvait, en réalité : **75 opportunités**. Son affaire y était, noyée.
 *
 * ## Ce que faisait l'ancienne construction
 *
 * `applyFullTextSearch` posait un seul `@or` contenant `name@ilike: "bar le
 * duc"`. L'adaptateur PostgREST découpe alors le terme en mots et produit une
 * alternative par mot ET par colonne :
 *
 *     or(name.ilike.*bar*, name.ilike.*le*, name.ilike.*duc*, …)
 *
 * Autrement dit : « bar » OU « le » OU « duc ». Le mot « le » suffit à ramener
 * « Emilie », « Centre », « Clinique » — la moitié de la base. Une recherche
 * qui répond tout ne répond rien, et c'est exactement ce que Simon a vécu.
 *
 * ## Ce qu'on construit à la place
 *
 * Chaque mot doit se trouver quelque part ; tous les mots doivent y être :
 *
 *     and( or(col1.ilike.*bar*, col2.ilike.*bar*, …),
 *          or(col1.ilike.*le*,  col2.ilike.*le*,  …),
 *          or(col1.ilike.*duc*, col2.ilike.*duc*, …) )
 *
 * Les mots peuvent donc être répartis sur plusieurs colonnes — « dupont
 * clinique » trouve l'affaire du contact Dupont chez la Clinique X — sans
 * qu'aucun mot isolé ne suffise à faire remonter une ligne.
 *
 * ## Pourquoi la chaîne est écrite à la main
 *
 * L'adaptateur ne sait pas imbriquer deux `@or` dans un `@and` : les clés d'un
 * objet JavaScript sont uniques, et `{ "@or": …, "@or": … }` n'existe pas. En
 * revanche, une clé dont l'opérateur est vide — `"and@"` — voit sa valeur
 * transmise telle quelle. C'est la porte que ce module emprunte.
 *
 * Elle impose de produire une syntaxe PostgREST valide, donc d'échapper
 * nous-mêmes ce qui la casserait : voir `echapper`.
 */

/** Le nombre de mots au-delà duquel on cesse de découper. */
const MAX_MOTS = 6;

/**
 * Rend une valeur sûre dans une liste PostgREST.
 *
 * La virgule sépare les alternatives et la parenthèse ferme le groupe : une
 * valeur qui en contient produirait une requête illisible pour le serveur,
 * qui répondrait par une erreur — donc par une liste vide, soit un échec
 * silencieux de plus.
 *
 * PostgREST accepte une valeur entre guillemets doubles ; les guillemets
 * internes se doublent. On n'entoure que lorsque c'est nécessaire, pour garder
 * les URL lisibles dans les journaux.
 *
 * ## Elle ne se déclenche jamais depuis `construireClause`, et c'est voulu
 *
 * `decouperEnMots` élimine déjà tout ce qui n'est ni lettre ni chiffre : les
 * mots qui en sortent ne peuvent pas casser la syntaxe. Un test l'avait
 * d'abord affirmé le contraire, à tort.
 *
 * La fonction reste parce que la sûreté de la clause ne doit pas reposer sur
 * une propriété d'un AUTRE module. Le jour où le découpage laissera passer un
 * point — pour chercher un domaine de messagerie, par exemple — la requête
 * tiendra toujours.
 */
export function echapper(valeur: string): string {
  if (!/[,.()"\s:]/.test(valeur)) return valeur;
  return `"${valeur.replace(/"/g, '""')}"`;
}

/**
 * Découpe la saisie en mots signifiants.
 *
 * Les accents sont retirés — la base range « Ardèche » sous « ardeche » — et
 * la ponctuation sert de séparateur, ce qui fait tomber « BAR-LE-DUC » sur les
 * mêmes trois mots que « bar le duc ». C'était l'autre moitié du problème :
 * les colonnes de recherche concatènent en gardant les tirets, si bien que
 * « barleduc » n'y trouvait pas « bar-le-duc ».
 *
 * Au-delà de `MAX_MOTS`, on s'arrête : chaque mot ajoute une clause à la
 * requête, et personne ne cherche une affaire en tapant une phrase.
 */
export function decouperEnMots(saisie: string): string[] {
  return saisie
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((mot) => mot.length > 0)
    .slice(0, MAX_MOTS);
}

/**
 * La clause `and(...)` complète, ou `null` quand il n'y a rien à chercher.
 *
 * `null` plutôt qu'une clause vide : `and()` est un filtre invalide, et
 * PostgREST y répondrait par une erreur au lieu de la liste entière.
 */
export function construireClause(
  saisie: string,
  colonnes: string[],
): string | null {
  const mots = decouperEnMots(saisie);
  if (mots.length === 0 || colonnes.length === 0) return null;

  const groupes = mots.map((mot) => {
    const alternatives = colonnes.map(
      (colonne) => `${colonne}.ilike.${echapper(`*${mot}*`)}`,
    );
    return `or(${alternatives.join(",")})`;
  });

  return `(${groupes.join(",")})`;
}
