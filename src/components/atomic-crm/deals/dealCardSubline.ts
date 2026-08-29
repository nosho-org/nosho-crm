/**
 * ---------------------------------------------------------------------------
 * La sous-ligne d'une carte Kanban (NOS-1172)
 * ---------------------------------------------------------------------------
 * Répond à un constat d'audit : les cartes écrivaient « société - intitulé »,
 * ce qui donnait « KERSANTE - Kersanté » et, sur un cas réel, « C.M.C.O. CENTRE
 * MEDITERRANEEN DE CHIRURGIE ORTHOPEDIQUE » écrit deux fois d'affilée. Une
 * carte montait à 200 px de haut pour une seule information, et la colonne
 * n'en laissait voir que deux.
 *
 * La règle : **la société ne s'affiche que lorsqu'elle ajoute quelque chose**.
 * Si l'intitulé la contient déjà, la répéter en dessous ne fait que déplacer
 * la redondance d'une ligne.
 *
 * La comparaison est volontairement tolérante sur la forme — accents, casse et
 * ponctuation ignorés — parce que la duplication vient de la saisie humaine et
 * qu'elle n'est jamais au caractère près : « KERSANTE » et « Kersanté » doivent
 * se reconnaître, comme « C.M.C.O. CENTRE MEDITERRANEEN » et « C.M.C.O. Centre
 * Méditerranéen ».
 *
 * Elle est en revanche stricte sur les **frontières de mots**, et c'est ce qui
 * la rend sûre. Une première version écrasait aussi les espaces : « Autre » —
 * une vraie société en production — disparaissait alors d'un deal intitulé
 * « Renouveler autrement », parce que la chaîne y était contenue. Comparer des
 * mots entiers supprime ce genre de coïncidence sans avoir à inventer un seuil
 * de longueur arbitraire.
 */

/** Plage des diacritiques combinants, laissés par `normalize("NFD")`. */
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Réduit à des mots minuscules sans accent, séparés par une espace unique, et
 * entourés d'espaces — ce qui fait de `includes` un test de mots entiers.
 */
function normalize(value: string): string {
  const words = value
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return words ? ` ${words} ` : "";
}

/**
 * Le nom de société à écrire sous l'intitulé, ou `null` s'il n'apporte rien.
 */
export function companySubline(
  dealName: string | null | undefined,
  companyName: string | null | undefined,
): string | null {
  const company = (companyName ?? "").trim();
  if (!company) return null;

  const normalizedCompany = normalize(company);
  if (!normalizedCompany) return null;

  return normalize(dealName ?? "").includes(normalizedCompany) ? null : company;
}
