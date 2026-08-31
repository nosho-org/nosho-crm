/**
 * ---------------------------------------------------------------------------
 * Situer le client sur une carte (NOS-1211)
 * ---------------------------------------------------------------------------
 * Simon : « l'adresse du site qui remonte doit intégrer un lien vers la
 * localisation Google Maps ».
 *
 * Le bloc « Le client » affichait la ville en texte mort, à côté d'une épingle
 * qui promettait une carte sans jamais y mener. Un établissement de santé se
 * situe avant un rendez-vous — savoir qu'on va à Boujan-sur-Libron ne dit ni
 * la distance ni le temps de trajet.
 */

/**
 * Ce qu'on cherche sur la carte.
 *
 * L'ordre compte : rue, code postal, ville. Une recherche sur la seule ville
 * tomberait au centre de la commune, ce qui pour une polyclinique en zone
 * périurbaine peut être à plusieurs kilomètres. Le nom de l'établissement
 * ouvre la requête, parce que Google reconnaît les établissements de santé et
 * pointe alors le bâtiment plutôt qu'un numéro de voie approximatif.
 */
export function adresseCartographiable({
  name,
  address,
  zipcode,
  city,
}: {
  name?: string | null;
  address?: string | null;
  zipcode?: string | null;
  city?: string | null;
}): string | null {
  const morceaux = [name, address, zipcode, city]
    .map((part) => part?.trim())
    .filter((part): part is string => !!part);

  // La ville seule ne vaut pas un lien : elle ouvrirait une carte du centre
  // d'une commune, ce qui n'aide personne à trouver un établissement. Il faut
  // au moins deux éléments — un nom et une ville, ou une rue et une ville.
  if (morceaux.length < 2) return null;

  return morceaux.join(", ");
}

/**
 * L'URL de recherche Google Maps.
 *
 * `/maps/search/?api=1&query=` est l'URL documentée et stable, contrairement
 * aux formes `/maps?q=` héritées. Elle fonctionne sur mobile comme sur poste,
 * et ouvre l'application native quand elle est installée.
 */
export function lienGoogleMaps(requete: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    requete,
  )}`;
}
