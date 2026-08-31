/**
 * ---------------------------------------------------------------------------
 * La requête de mise à jour de la fiche gagnante (NOS-1205)
 * ---------------------------------------------------------------------------
 * Ce module n'existe que pour être testé. Il a été extrait de `index.ts` après
 * deux pannes successives que rien n'attrapait, parce qu'une fonction edge ne
 * se vérifie qu'en la déployant.
 *
 * ## Ce qui a réellement cassé
 *
 * La première version passait les objets JavaScript directement au pilote
 * Postgres, qui encode un tableau en littéral `{a,b}` et un objet en
 * `[object Object]` — ni l'un ni l'autre n'étant du JSON. La deuxième, censée
 * corriger cela, a perdu le `$` des marqueurs de paramètres : elle produisait
 * `logo = 9::jsonb`, c'est-à-dire l'entier 9 casté en jsonb, d'où le
 * `cannot cast type integer to jsonb` lu dans les journaux.
 *
 * Les deux fois, l'utilisateur n'a vu que « La fusion a échoué ». Le test qui
 * accompagne ce fichier vérifie la forme littérale du SQL produit : c'est la
 * seule chose qui distingue `$9::jsonb` de `9::jsonb`.
 */

/**
 * Les colonnes JSON, et le type vers lequel les caster.
 *
 * `context_links` est déclarée `json` et `logo` `jsonb`. La valeur part en
 * TEXTE — `JSON.stringify` — et le cast dit à Postgres comment la relire.
 */
export const COLONNES_JSON: Record<string, string> = {
  logo: "jsonb",
  context_links: "json",
};

/**
 * Ramène `context_links` à une liste de chaînes.
 *
 * La colonne est un `json` libre : rien en base n'impose un tableau, et la
 * production en contenait un objet (`{}` sur CHU Martinique #388). La fusion
 * s'arrêtait dessus — `[...(winner.context_links ?? [])]` sur un objet lève
 * « is not iterable » — mais le vrai dégât était antérieur : `CompanyAside`
 * appelle `.map()` sur cette valeur, donc la fiche cassait déjà toute seule.
 *
 * On garde les valeurs d'un objet plutôt que de le jeter : une fusion ne doit
 * jamais faire perdre d'information, y compris quand la donnée est malformée.
 * Un `{}` donne `[]`, ce qui est exactement la valeur qu'il aurait dû porter.
 */
export function normaliserLiens(valeur: unknown): string[] {
  if (valeur == null) return [];
  if (Array.isArray(valeur)) {
    return valeur.filter((item): item is string => typeof item === "string");
  }
  if (typeof valeur === "object") {
    return Object.values(valeur as Record<string, unknown>).filter(
      (item): item is string => typeof item === "string",
    );
  }
  return typeof valeur === "string" ? [valeur] : [];
}

/**
 * Le `update` de la fiche gagnante, et ses paramètres.
 *
 * `id` arrive en dernier plutôt que dans les colonnes : la fiche gagnante
 * garde le sien, et l'inclure dans le `set` ferait dépendre la clause `where`
 * de sa propre affectation.
 */
export function construireMiseAJour(
  merged: Record<string, unknown>,
  winnerId: number,
): { sql: string; valeurs: unknown[] } {
  const columns = Object.keys(merged);

  const assignments = columns
    .map((column, index) => {
      const cast = COLONNES_JSON[column];
      return `${column} = $${index + 1}${cast ? `::${cast}` : ""}`;
    })
    .join(", ");

  const valeurs = columns.map((column) => {
    const valeur = merged[column];
    if (!COLONNES_JSON[column]) return valeur;
    // `null` reste `null` : la chaîne "null" est le JSON valide représentant
    // la valeur nulle, ce qui n'est pas la même chose qu'une colonne vide.
    return valeur == null ? null : JSON.stringify(valeur);
  });

  return {
    sql: `update public.companies set ${assignments} where id = $${columns.length + 1}`,
    valeurs: [...valeurs, winnerId],
  };
}
