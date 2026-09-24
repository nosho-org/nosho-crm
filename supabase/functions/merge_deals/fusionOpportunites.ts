/**
 * ---------------------------------------------------------------------------
 * Fusionner deux opportunites -- la decision, sans la base
 * ---------------------------------------------------------------------------
 * Simon, le 24/09/2026, avec deux fiches en exemple : l'AP-HM (#2) et
 * l'Hopital Nord (AP-HM) (#360). Deux societes distinctes en base, un seul
 * etablissement dans la vraie vie, un contact en commun, et la substance
 * commerciale eparpillee entre les deux : les notes d'un cote, la tache et la
 * description du lead de l'autre.
 *
 * ## Ce qui distingue cette fusion de celle des contacts
 *
 * `merge_contacts` supprime le perdant. Ici, non : l'opportunite absorbee est
 * **archivee**. Trois raisons, et la premiere suffirait.
 *
 * 1. Une opportunite porte des chiffres qui ont deja ete lus. Son historique
 *    d'etapes alimente le taux de conversion, et son ARR a compte dans un
 *    pipeline affiche a quelqu'un. Supprimer la ligne reecrit un passe sur
 *    lequel des decisions ont ete prises.
 * 2. L'archivage existe deja, et sa regle est ecrite : « l'archivage ne doit
 *    supprimer aucune donnee, car l'opportunite peut revenir plus tard ».
 *    Une fusion ratee se defait en desarchivant.
 * 3. Rien n'oblige a supprimer. Les six tables qui referencent `deals` gardent
 *    une cle valide tant que la ligne existe : le deplacement des
 *    enregistrements devient un choix d'usage, pas une contrainte d'integrite.
 *
 * ## Ce qui suit l'opportunite gagnante, et ce qui reste
 *
 * Suit ce qu'on lit et ce qu'on fait : les notes, les taches, les contrats,
 * les appels. C'est la matiere de travail, et c'est pour elle qu'on fusionne.
 *
 * Reste ce qui trace : `deal_change_log` et `crm_notifications`. Deplacer le
 * journal ferait dire a la gagnante qu'elle est passee par des etapes qu'elle
 * n'a jamais connues -- un audit qui ment est pire qu'un audit incomplet. Et
 * les notifications Slack disent « on a deja prevenu pour CETTE fiche » :
 * transferees, elles feraient taire une alerte qui n'a jamais ete emise.
 *
 * La trace de la fusion elle-meme est ecrite en note sur la gagnante, avec le
 * numero de l'absorbee : c'est la, dans le fil d'activite, que quelqu'un la
 * cherchera six mois plus tard.
 *
 * ## Pourquoi ce fichier ne touche pas la base
 *
 * Les regles ci-dessous -- l'union des contacts, la somme qu'on ne fait pas,
 * les trous qu'on comble -- sont ce qui peut etre faux. Les mettre en fonction
 * pure les rend verifiables sans Postgres ni Deno ; `index.ts` ne garde que
 * l'ordre des ecritures.
 */

/** Les colonnes de `deals` que la fusion lit. Rien de plus. */
export interface OpportuniteFusionnable {
  id: number;
  name: string;
  company_id: number | null;
  contact_ids: number[] | null;
  contact_roles: Record<string, string> | null;
  products: string[] | null;
  description: string | null;
  category: string | null;
  motion: string | null;
  opportunity_type: string | null;
  company_type: string | null;
  lead_source: string | null;
  referrer_id: number | null;
}

/**
 * Les champs scalaires que la perdante peut combler.
 *
 * Uniquement la ou la gagnante n'a rien : ecrire dans un trou n'ecrase aucune
 * decision, alors qu'ecraser une valeur choisie en annule une. `amount`,
 * `stage`, `priority` et les dates en sont volontairement absents -- ce sont
 * des affirmations, pas des trous, meme quand elles paraissent par defaut.
 */
export const CHAMPS_COMBLES = [
  "category",
  "motion",
  "opportunity_type",
  "company_type",
  "lead_source",
  "referrer_id",
] as const satisfies readonly (keyof OpportuniteFusionnable)[];

/** Union en conservant l'ordre : la gagnante d'abord, puis ce qu'elle n'avait pas. */
function union<T>(gagnante: T[] | null, perdante: T[] | null): T[] {
  return [...new Set([...(gagnante ?? []), ...(perdante ?? [])])];
}

/**
 * Le texte des deux descriptions, dans cet ordre, separes d'un intertitre.
 *
 * Concatener plutot que choisir : dans l'exemple de Simon, toute la
 * qualification du lead tient dans la description de l'absorbee. La garder
 * sous un intertitre plutot que l'inserer telle quelle, pour qu'on voie d'ou
 * elle vient sans avoir a deviner.
 */
export function fusionnerDescriptions(
  gagnante: string | null,
  perdante: string | null,
  nomPerdante: string,
): string | null {
  const g = gagnante?.trim() || "";
  const p = perdante?.trim() || "";

  if (!p) return gagnante;
  if (!g) return p;
  // Deja presente -- une fusion rejouee ne doit pas empiler la meme copie.
  if (g.includes(p)) return gagnante;

  return `${g}\n\n--- Repris de « ${nomPerdante} » ---\n${p}`;
}

/**
 * Les roles dans la decision, gagnante prioritaire.
 *
 * Un meme contact peut etre « decideur » d'un cote et « utilisateur » de
 * l'autre. La fiche qu'on garde a raison : c'est elle qu'on a choisi de
 * garder. Les contacts que seule l'absorbee qualifiait arrivent avec leur
 * role, sinon l'union des contacts les ferait entrer sans etiquette.
 */
export function fusionnerRoles(
  gagnante: Record<string, string> | null,
  perdante: Record<string, string> | null,
): Record<string, string> {
  return { ...(perdante ?? {}), ...(gagnante ?? {}) };
}

/** Ce qu'il faut ecrire sur l'opportunite gagnante. */
export interface MiseAJourGagnante {
  contact_ids: number[];
  contact_roles: Record<string, string>;
  products: string[];
  description: string | null;
  category?: string | null;
  motion?: string | null;
  opportunity_type?: string | null;
  company_type?: string | null;
  lead_source?: string | null;
  referrer_id?: number | null;
}

export function calculerFusion(
  gagnante: OpportuniteFusionnable,
  perdante: OpportuniteFusionnable,
): MiseAJourGagnante {
  const maj: MiseAJourGagnante = {
    contact_ids: union(gagnante.contact_ids, perdante.contact_ids),
    contact_roles: fusionnerRoles(
      gagnante.contact_roles,
      perdante.contact_roles,
    ),
    products: union(gagnante.products, perdante.products),
    description: fusionnerDescriptions(
      gagnante.description,
      perdante.description,
      perdante.name,
    ),
  };

  for (const champ of CHAMPS_COMBLES) {
    if (gagnante[champ] == null && perdante[champ] != null) {
      (maj as unknown as Record<string, unknown>)[champ] = perdante[champ];
    }
  }

  return maj;
}

/**
 * La note deposee sur la gagnante.
 *
 * Elle nomme l'absorbee ET son numero : le nom se relit, le numero se
 * retrouve. Et elle dit ce qui n'a pas bouge, parce que c'est precisement ce
 * que personne ne pensera a verifier -- l'ARR n'est pas additionne, et le
 * journal de l'absorbee est reste chez elle.
 */
export function noteDeFusion(
  perdante: Pick<OpportuniteFusionnable, "id" | "name">,
  memeSociete: boolean,
): string {
  const lignes = [
    `Fusion : l'opportunité « ${perdante.name} » (#${perdante.id}) a été absorbée dans celle-ci, puis archivée.`,
    "Notes, tâches, contrats et appels ont été rattachés ici. L'ARR n'a pas été additionné, et l'historique des changements est resté sur la fiche archivée.",
  ];
  if (!memeSociete) {
    lignes.push(
      "Attention : les deux opportunités ne portaient pas la même société — celle de cette fiche a été conservée.",
    );
  }
  return lignes.join("\n");
}

/**
 * Le refus, avant toute ecriture.
 *
 * Fusionner une fiche avec elle-meme la viderait de ses rattachements pour
 * les lui rendre, puis l'archiverait : une operation qui se presente comme
 * sans effet et qui retire la fiche du board.
 */
export function refusDeFusion(
  gagnanteId: unknown,
  perdanteId: unknown,
): string | null {
  if (gagnanteId == null || perdanteId == null) {
    return "Il faut une opportunité à garder et une à absorber.";
  }
  if (String(gagnanteId) === String(perdanteId)) {
    return "Une opportunité ne peut pas être fusionnée avec elle-même.";
  }
  return null;
}
