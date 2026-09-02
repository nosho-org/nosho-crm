/**
 * ---------------------------------------------------------------------------
 * Ce qui retient un utilisateur (NOS-1233)
 * ---------------------------------------------------------------------------
 * Simon : « impossible de supprimer des utilisateurs, je les supprime et ils
 * reviennent ».
 *
 * Deux chemins étaient cassés, chacun à sa façon : la suppression groupée de
 * la liste tentait un `DELETE` direct que les politiques de `sales`
 * n'autorisent pas — Postgres refusait en silence, en supprimant zéro ligne,
 * si bien que l'écran annonçait un succès puis remettait la ligne. Le bouton
 * de la fiche, lui, appelait cette fonction en DELETE, qui répondait 405.
 *
 * ## Pourquoi un décompte applicatif, et pas seulement les clés étrangères
 *
 * Huit contraintes en `NO ACTION` refuseraient déjà la suppression d'un
 * utilisateur qui porte des sociétés, contacts, contrats, notes
 * d'opportunité, opportunités, leads d'événement ou objectifs qu'il a rédigés.
 * Mais deux liens échappent à ce filet :
 *
 * - **`tasks.sales_id` n'a aucune contrainte.** Supprimer laisserait les
 *   tâches rattachées à un identifiant qui ne désigne plus personne : elles
 *   n'apparaîtraient dans la file d'aucun collègue, sans que rien le signale.
 * - **`contact_notes.sales_id` était en CASCADE.** Les notes écrites par la
 *   personne auraient disparu avec elle, silencieusement.
 *
 * S'en remettre aux seules contraintes rendrait donc une erreur Postgres
 * illisible dans le premier cas, et une perte de données muette dans le
 * second. Le décompte les nomme, et le message dit ce qui bloque.
 *
 * ## Les notes ne retiennent plus personne (NOS-1234)
 *
 * Elles bloquaient trois comptes désactivés — Etienne 8, Leo 10, Benjamin
 * 539. Simon a tranché : on détache l'auteur et on garde la note. Une note
 * dit ce qu'un client a répondu ; elle vaut pour l'affaire, pas pour la
 * personne qui l'a saisie.
 *
 * Les deux contraintes passent donc en `SET NULL` — ce qui, pour
 * `contact_notes`, corrige au passage une suppression en cascade que
 * personne n'aurait vue passer.
 */

/** Une table qui retient l'utilisateur, et le libellé qu'on en donne. */
export interface Attache {
  table: string;
  colonne: string;
  libelle: string;
  /** Pluriel du libellé, quand il ne s'obtient pas par un « s ». */
  pluriel?: string;
}

/**
 * Tout ce qui doit être vide avant de supprimer.
 *
 * L'ordre est celui du message : on cite d'abord ce qui pèse le plus lourd
 * dans une reprise — les opportunités avant les leads d'événement.
 */
export const ATTACHES: Attache[] = [
  { table: "deals", colonne: "sales_id", libelle: "opportunité" },
  { table: "contacts", colonne: "sales_id", libelle: "contact" },
  { table: "companies", colonne: "sales_id", libelle: "société", pluriel: "sociétés" },
  { table: "tasks", colonne: "sales_id", libelle: "tâche" },
  { table: "contracts", colonne: "sales_id", libelle: "contrat" },
  {
    table: "contracts",
    colonne: "nosho_signatory_id",
    libelle: "contrat signé",
    pluriel: "contrats signés",
  },

  {
    table: "event_leads",
    colonne: "captured_by",
    libelle: "lead d'événement",
    pluriel: "leads d'événement",
  },
  {
    table: "targets",
    colonne: "author_id",
    libelle: "objectif rédigé",
    pluriel: "objectifs rédigés",
  },
];

export interface Blocage {
  /** Le nom accordé, SANS le nombre : « opportunités », pas « 78 opportunités ». */
  libelle: string;
  nombre: number;
}

/**
 * Le message de refus.
 *
 * Il énumère ce qui retient, avec les nombres. Un « suppression impossible »
 * sec obligerait à chercher soi-même, et c'est ainsi qu'on finit par
 * supprimer à la main en base.
 */
export function messageDeBlocage(nom: string, blocages: Blocage[]): string {
  const parts = blocages.map(({ libelle, nombre }) => `${nombre} ${libelle}`);
  const liste =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")} et ${parts.at(-1)}`;

  return (
    `${nom} ne peut pas être supprimé : ce compte porte encore ${liste}. ` +
    `Réattribuez ces éléments à un collègue, ou désactivez le compte pour ` +
    `en bloquer l'accès sans toucher aux données.`
  );
}

/** Accorde le libellé au nombre. */
export function accorder(attache: Attache, nombre: number): string {
  if (nombre <= 1) return attache.libelle;
  return attache.pluriel ?? `${attache.libelle}s`;
}
