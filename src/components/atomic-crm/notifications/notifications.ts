/**
 * ---------------------------------------------------------------------------
 * Les notifications du CRM (NOS-1178)
 * ---------------------------------------------------------------------------
 * Demandé par Simon : « À faire maintenant », je le veux plutôt en
 * notification qu'on peut fermer.
 *
 * ## Ce ne sont pas des événements, ce sont des états
 *
 * C'est la décision qui structure tout le reste. Une notification classique
 * naît d'un fait daté — « X vous a assigné une tâche » — et se ferme pour de
 * bon. Celles-ci sont **dérivées de la donnée** : « cette affaire est celle à
 * traiter », « quatre opportunités n'ont pas de prochaine action ». Elles
 * restent vraies après qu'on les a fermées.
 *
 * D'où la règle : **fermer, c'est fermer pour aujourd'hui**. Demain,
 * l'information est de nouveau pertinente et revient. Une fermeture définitive
 * transformerait le premier réflexe d'agacement en angle mort permanent — et
 * c'est justement sur les signaux gênants que ça arriverait.
 *
 * ## Chaque notification porte une signature, pas seulement un identifiant
 *
 * `dismissKey` inclut ce qui a motivé l'alerte. Fermer « à faire : CHU de
 * Nantes » ne masque pas « à faire : Kersanté » le lendemain, et ne masque pas
 * non plus la même affaire si son score change de façon significative. On tait
 * un message, pas une catégorie de messages.
 */

export type NotificationSeverity = "action" | "warning" | "info";

export interface AppNotification {
  /** Stable pour un même message, à un même moment. */
  id: string;
  severity: NotificationSeverity;
  title: string;
  body?: string;
  /** Ligne fine sous le corps — le calcul, la source, le détail chiffré. */
  detail?: string;
  /** Lien interne. Absent quand il n'y a rien à ouvrir. */
  /**
   * Un chemin, ou une cible construite par `toDealsLink` (NOS-1193).
   *
   * La forme objet porte la chaine de filtres : sans elle, "5 opportunites
   * sans prochaine action" ouvrait la liste entiere.
   */
  to?: string | { pathname: string; search: string };
  actionLabel?: string;
  /**
   * Ce qui est tu quand on ferme.
   *
   * Contient la signature du contenu : voir l'en-tête. Deux notifications de
   * même nature mais de contenu différent ne se ferment pas ensemble.
   */
  dismissKey: string;
}

const STORAGE_KEY = "nosho.notifications.dismissed";

/** `2026-08-29` — la granularité de l'oubli. */
export function dayStamp(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Europe/Paris",
  }).format(now);
}

type DismissedMap = Record<string, string>;

/**
 * Lit les fermetures du jour.
 *
 * Tout accès est protégé : `localStorage` lève en navigation privée sur
 * certains navigateurs, et une notification qui fait planter la page est pire
 * que pas de notification du tout.
 */
export function readDismissed(now: Date = new Date()): Set<string> {
  const today = dayStamp(now);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as DismissedMap;
    return new Set(
      Object.entries(parsed)
        .filter(([, stamp]) => stamp === today)
        .map(([key]) => key),
    );
  } catch {
    return new Set();
  }
}

/**
 * Enregistre une fermeture, et purge les jours passés au passage.
 *
 * La purge est ici plutôt que dans un nettoyage séparé : sans elle, la clé
 * grossirait indéfiniment d'entrées qui ne servent plus à rien — et
 * `localStorage` est plafonné.
 */
export function writeDismissed(key: string, now: Date = new Date()): void {
  const today = dayStamp(now);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as DismissedMap) : {};
    const kept: DismissedMap = { [key]: today };
    for (const [existing, stamp] of Object.entries(parsed)) {
      if (stamp === today) kept[existing] = stamp;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
  } catch {
    // Rien à faire : la notification réapparaîtra, ce qui est le bon défaut.
  }
}

/** Écarte ce qui a été fermé aujourd'hui, en gardant l'ordre. */
export function applyDismissals(
  notifications: AppNotification[],
  dismissed: Set<string>,
): AppNotification[] {
  return notifications.filter(
    (notification) => !dismissed.has(notification.dismissKey),
  );
}

/**
 * L'ordre d'affichage.
 *
 * Ce qu'il faut faire, puis ce qui menace, puis ce qui informe. Un ordre par
 * date n'aurait aucun sens ici : rien n'a de date, tout est vrai maintenant.
 */
const SEVERITY_ORDER: NotificationSeverity[] = ["action", "warning", "info"];

export function sortNotifications(
  notifications: AppNotification[],
): AppNotification[] {
  return [...notifications].sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );
}
