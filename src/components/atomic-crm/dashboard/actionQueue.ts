import type { Deal, Task } from "../types";

/**
 * ---------------------------------------------------------------------------
 * La file d'actions, regroupée par échéance (NOS-1174)
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
 * Le jour civil, ramené à une clé comparable.
 *
 * Les échéances arrivent sous deux formes — `YYYY-MM-DD` nu, ou horodatage
 * complet — et le regroupement doit traiter les deux de la même façon : ce qui
 * compte est le jour, pas l'heure. C'est ce mélange qui produisait l'en-tête
 * « PLUS TARD » au-dessus de tâches du jour même.
 *
 * ## Le jour LOCAL, jamais le jour UTC (NOS-1229)
 *
 * Simon : « dans la partie tâche le CRM confond aujourd'hui et hier ».
 *
 * L'ancienne version découpait les dix premiers caractères de l'ISO. Sur une
 * chaîne c'était acceptable ; sur `today`, qui vaut minuit LOCAL, c'était
 * faux : à Paris en été, minuit du 1er septembre s'écrit
 * `2026-08-31T22:00:00Z`, et le découpage rendait « 2026-08-31 ». Le CRM se
 * croyait la veille — les tâches d'hier passaient pour celles du jour, et
 * celles du jour tombaient dans « cette semaine ».
 *
 * Un fuseau à l'ouest de Greenwich aurait produit l'erreur inverse. Seul un
 * poste réglé sur UTC ne voyait rien, ce qui explique que le défaut ait tenu.
 */
function jourLocal(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayOf(value: string | null | undefined): number | null {
  if (!value) return null;

  /*
   * Une date nue n'a pas de fuseau : la lire comme un instant lui en
   * inventerait un. `2026-09-20` vaut le 20 septembre, où qu'on soit.
   */
  const nue = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (nue) {
    return Date.UTC(Number(nue[1]), Number(nue[2]) - 1, Number(nue[3]));
  }

  // Un horodatage, lui, désigne un instant : c'est le jour où le lecteur le
  // vit qui compte, donc son jour local.
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : jourLocal(date);
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
  const now = jourLocal(today);
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
 * Le strict nécessaire pour savoir qu'une tâche appartient à une affaire.
 *
 * Volontairement plus étroit que `Deal` : la règle ne lit que trois champs, et
 * les tests n'ont pas à fabriquer une opportunité complète pour l'exercer.
 */
export interface AffaireAtteignable {
  id: string | number;
  stage: string;
  contact_ids?: (string | number)[] | null;
}

/**
 * Les affaires qu'une tâche atteint.
 *
 * Deux chemins, et c'est la règle que `deals_summary` applique déjà pour la
 * « prochaine action » — la copier ici plutôt que d'en inventer une autre :
 *
 *   * `deal_id` — le lien direct, celui que le formulaire de tâche pose ;
 *   * `contact_id` parmi les `contact_ids` de l'affaire — le lien indirect,
 *     de loin le plus fréquent.
 *
 * Mesuré en production avant d'écrire : sur les cinq tâches rattachées à une
 * affaire perdue, **une seule** porte le lien direct. S'en tenir à `deal_id`
 * aurait masqué une tâche sur cinq et laissé le défaut à l'écran.
 */
export function affairesAtteintes<T extends AffaireAtteignable>(
  task: Task,
  affaires: readonly T[],
): T[] {
  const dealId = task.deal_id != null ? String(task.deal_id) : null;
  const contactId = task.contact_id != null ? String(task.contact_id) : null;

  return affaires.filter((affaire) => {
    if (dealId !== null && String(affaire.id) === dealId) return true;
    if (contactId === null) return false;
    return (affaire.contact_ids ?? []).some(
      (id) => String(id) === contactId,
    );
  });
}

/**
 * Une tâche dont il n'y a plus rien à faire, parce que tout ce qu'elle touche
 * est perdu (NOS-1578).
 *
 * Simon, le 14/09/2026 : « si une opportunité est en lost alors ne plus faire
 * apparaître les tâches ». Une affaire perdue n'a plus d'action commerciale ;
 * son retard, lui, ne se rattrapera jamais et s'accumule en tête de file à la
 * place du travail vivant.
 *
 * ## « Toutes », et pas « au moins une »
 *
 * Un contact peut porter une affaire perdue et une affaire en cours. Masquer
 * dès qu'une perdue apparaît ferait disparaître du travail encore dû.
 *
 * Aucune tâche n'est dans ce cas aujourd'hui en production — c'est exactement
 * pourquoi la règle se fixe maintenant, à froid, plutôt que le jour où un
 * commercial constatera qu'une relance s'est évaporée.
 *
 * ## Une tâche sans affaire n'est jamais masquée
 *
 * 57 tâches ouvertes sur 105 ne touchent aucune opportunité : ce sont des
 * rappels sur un contact. Elles ne sont perdues avec rien, et `every` sur une
 * liste vide rendrait `true` — d'où le test de non-vacuité, qui n'est pas une
 * précaution mais la moitié de la règle.
 */
export function estSurAffairePerdue(
  task: Task,
  affaires: readonly AffaireAtteignable[],
  etapePerdue: string,
): boolean {
  const atteintes = affairesAtteintes(task, affaires);
  if (atteintes.length === 0) return false;
  return atteintes.every((affaire) => affaire.stage === etapePerdue);
}

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
  options: {
    /**
     * Les affaires sur lesquelles se juge « tout est perdu » (NOS-1578).
     *
     * Séparé de `deals`, qui sert à afficher le montant : ce dernier est filtré
     * par la période du tableau de bord, et une règle de masquage qui dépendrait
     * de la période choisie ferait apparaître et disparaître les mêmes tâches
     * selon le filtre. Le jugement doit porter sur l'ensemble des affaires, pas
     * sur la fenêtre regardée.
     *
     * Omis, aucune tâche n'est masquée : le comportement d'avant.
     */
    affaires?: readonly AffaireAtteignable[];
    /** L'étape qui vaut « perdue ». Voir `LOST_DEAL_STAGE`. */
    etapePerdue?: string;
  } = {},
): QueueEntry[] {
  const dealsById = new Map(deals.map((deal) => [String(deal.id), deal]));
  const { affaires, etapePerdue } = options;

  return tasks
    .filter((task) => !task.done_date)
    .filter(
      (task) =>
        !affaires ||
        !etapePerdue ||
        !estSurAffairePerdue(task, affaires, etapePerdue),
    )
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
