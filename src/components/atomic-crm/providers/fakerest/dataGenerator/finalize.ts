import type { Db } from "./types";

export const finalize = (db: Db) => {
  // set contact status according to the latest note
  db.contact_notes
    .sort((a, b) => new Date(a.date).valueOf() - new Date(b.date).valueOf())
    .forEach((note) => {
      db.contacts[note.contact_id as number].status = note.status;
    });

  emulerProchaineAction(db);
};

/**
 * `deals_summary.next_task_date` et `next_task_text`, que FakeRest n'a pas.
 *
 * Même raison que `last_activity_at` dans le générateur d'opportunités : sans
 * cette émulation, les colonnes « Action » et « Date de l'action » de la liste
 * affichent un tiret sur toutes les lignes en démo, et la prochaine personne
 * qui y touche ne peut pas voir ce qu'elle modifie.
 *
 * Même règle que la vue, volontairement : la tâche ouverte à l'échéance la
 * plus proche, rattachée à l'affaire directement ou à l'un de ses contacts,
 * départagée par l'identifiant. Une seconde définition ferait valider en démo
 * un affichage que la production ne produit pas.
 *
 * Ici, après `generateTasks` : les tâches n'existent pas encore quand les
 * opportunités sont créées.
 */
const emulerProchaineAction = (db: Db) => {
  const ouvertes = db.tasks
    .filter((task) => !task.done_date)
    .sort(
      (a, b) =>
        new Date(a.due_date).valueOf() - new Date(b.due_date).valueOf() ||
        Number(a.id) - Number(b.id),
    );

  for (const deal of db.deals) {
    const contacts = new Set((deal.contact_ids ?? []).map(Number));
    const prochaine = ouvertes.find(
      (task) =>
        Number((task as { deal_id?: unknown }).deal_id) === Number(deal.id) ||
        contacts.has(Number(task.contact_id)),
    );
    deal.next_task_date = prochaine?.due_date ?? null;
    deal.next_task_text = prochaine?.text ?? null;
  }
};
