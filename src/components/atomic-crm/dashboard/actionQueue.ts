import type { Deal, Task } from "../types";

/**
 * ---------------------------------------------------------------------------
 * La file d'actions, regroupée par échéance (NOS-1167)
 * ---------------------------------------------------------------------------
 * L'audit du 29 août 2026 : « Tâches à venir, Prochains rendez-vous, et les
 * deals à risque vivent dans trois colonnes séparées. Aucune n'est ordonnée
 * par enjeu. Le tri se fait donc dans la tête du commercial, tous les matins,
 * sans support. » Et, pire : l'en-tête « PLUS TARD » coiffait cinq tâches déjà
 * échues.
 *
 * Trois groupes, dans l'ordre où on les traite : ce qui est en retard, ce qui
 * est pour aujourd'hui, ce qui vient. Une tâche en retard est en tête, sans
 * exception.
 *
 * Chaque ligne porte le **montant en jeu**. C'est ce qui permet de sauter une
 * tâche à 3 k€ sans culpabilité — le tri n'a de valeur que si l'on peut aussi
 * décider de ne pas suivre.
 */

export type QueueBucket = "overdue" | "today" | "week" | "later";

export interface QueueEntry {
  task: Task;
  bucket: QueueBucket;
  /** L'opportunité rattachée, quand la tâche en a une. */
  deal: Deal | null;
  /** ARR de l'opportunité, `null` quand la tâche n'en a pas. */
  amount: number | null;
  /** Jours de retard, positif seulement dans `overdue`. */
  daysOverdue: number;
}

export const BUCKET_LABELS: Record<QueueBucket, string> = {
  overdue: "En retard",
  today: "Aujourd'hui",
  week: "Cette semaine",
  later: "Plus tard",
};

const DAY = 86_400_000;

/**
 * Le jour calendaire d'une échéance, en millisecondes UTC.
 *
 * Les échéances arrivent sous deux formes — `YYYY-MM-DD` nu, ou horodatage
 * complet — et le regroupement doit traiter les deux de la même façon : ce qui
 * compte est le jour, pas l'heure. C'est ce mélange qui produisait l'en-tête
 * « PLUS TARD » au-dessus de tâches du jour même.
 */
function dayOf(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

/**
 * Range une échéance.
 *
 * Une tâche **sans date** tombe dans `later` et non dans `overdue` : elle n'est
 * en retard sur rien, personne n'a pris d'engagement. La faire remonter en
 * rouge apprendrait à ignorer le rouge.
 */
export function bucketFor(
  dueDate: string | null | undefined,
  today: Date,
): { bucket: QueueBucket; daysOverdue: number } {
  const due = dayOf(dueDate);
  const now = dayOf(today.toISOString());
  if (due === null || now === null) {
    return { bucket: "later", daysOverdue: 0 };
  }

  const days = Math.round((due - now) / DAY);
  if (days < 0) return { bucket: "overdue", daysOverdue: -days };
  if (days === 0) return { bucket: "today", daysOverdue: 0 };
  // Sept jours glissants plutôt que « jusqu'à dimanche » : un vendredi,
  // « cette semaine » ne contiendrait plus qu'un jour et le groupe se viderait
  // au moment où l'on en a le plus besoin.
  if (days <= 7) return { bucket: "week", daysOverdue: 0 };
  return { bucket: "later", daysOverdue: 0 };
}

const ORDER: QueueBucket[] = ["overdue", "today", "week", "later"];

/**
 * Assemble la file : tâches non terminées, rangées par échéance, et à
 * échéance égale la plus grosse affaire d'abord.
 *
 * Le montant vient de l'opportunité rattachée. Une tâche qui n'en a pas — un
 * rappel sur un contact — n'en porte aucun : afficher 0 € laisserait croire à
 * une affaire sans valeur plutôt qu'à une tâche sans affaire.
 */
export function buildQueue(
  tasks: Task[],
  deals: Deal[],
  today: Date,
): QueueEntry[] {
  const dealsById = new Map(deals.map((deal) => [String(deal.id), deal]));

  return tasks
    .filter((task) => !task.done_date)
    .map((task): QueueEntry => {
      const { bucket, daysOverdue } = bucketFor(task.due_date, today);
      const deal =
        task.deal_id != null
          ? (dealsById.get(String(task.deal_id)) ?? null)
          : null;
      return {
        task,
        bucket,
        deal,
        amount: deal?.amount ?? null,
        daysOverdue,
      };
    })
    .sort((a, b) => {
      const byBucket = ORDER.indexOf(a.bucket) - ORDER.indexOf(b.bucket);
      if (byBucket !== 0) return byBucket;

      // Dans « en retard », le plus ancien d'abord : c'est celui qui a le plus
      // de chances d'être déjà perdu.
      if (a.bucket === "overdue" && a.daysOverdue !== b.daysOverdue) {
        return b.daysOverdue - a.daysOverdue;
      }

      // Puis l'enjeu. Une tâche sans montant passe après une tâche qui en a
      // un, sans être reléguée en fin de groupe.
      return (b.amount ?? 0) - (a.amount ?? 0);
    });
}

/** Ce que chaque groupe pèse, pour l'écrire dans son en-tête. */
export function summarizeBucket(entries: QueueEntry[]): {
  count: number;
  amount: number;
} {
  return {
    count: entries.length,
    amount: entries.reduce((sum, entry) => sum + (entry.amount ?? 0), 0),
  };
}
