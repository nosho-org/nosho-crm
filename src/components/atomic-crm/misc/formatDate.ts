/**
 * ---------------------------------------------------------------------------
 * Le formatage des dates, en un seul endroit (NOS-1172)
 * ---------------------------------------------------------------------------
 * L'audit du 29 août 2026 relevait trois formats sur un même écran :
 * « Sep 30, 2026 », « 05/09/2026 » et « 26/08/2026 09:52 », plus un
 * « Sep 5, 2026 · 2:00 AM ». Trois causes distinctes, toutes réparées ici :
 *
 * 1. **`date-fns` sans locale.** `format(date, "PP")` retombe sur `en-US` —
 *    d'où l'anglais. Ce module n'utilise pas `date-fns` : `Intl` porte déjà
 *    locale ET fuseau, et ne peut pas oublier l'un des deux.
 *
 * 2. **`Intl.DateTimeFormat(undefined, …)`.** La locale du navigateur, donc
 *    un format qui change d'un poste à l'autre. Un CRM lu à plusieurs doit
 *    écrire ses dates de la même façon pour tout le monde.
 *
 * 3. **Le fameux « 02:00 ».** Ce n'était pas un fuseau non converti, c'était
 *    l'inverse : une date sans heure, stockée à minuit UTC, rendue en
 *    Europe/Paris — donc 02:00 en été. Voir `isDateOnly` plus bas.
 *
 * Le fuseau est fixé à Europe/Paris et non laissé au navigateur. Nosho vend en
 * France, ses rendez-vous sont des heures françaises, et une échéance qui
 * change d'heure parce qu'un commercial est en déplacement n'aide personne.
 */

const LOCALE = "fr-FR";
const TIME_ZONE = "Europe/Paris";

const DATE = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: TIME_ZONE,
});

const DATE_LONG = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: TIME_ZONE,
});

/**
 * Sans les secondes, volontairement.
 *
 * L'audit relevait `02:00:00` dans la liste des tâches. Personne ne prend une
 * décision à la seconde près sur une relance commerciale, et trois caractères
 * de bruit par ligne sur une liste de vingt lignes se voient.
 */
const DATE_TIME = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});

const TIME = new Intl.DateTimeFormat(LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});

/** Ce qu'on affiche quand il n'y a rien. Un tiret cadratin, pas « null ». */
export const NO_DATE = "—";

const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/;

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  // Une colonne `date` PostgreSQL arrive en `YYYY-MM-DD`. Lue telle quelle,
  // elle est interprétée en UTC par le moteur JS, ce qui la fait basculer au
  // jour précédent pour tout fuseau à l'ouest de Greenwich. On l'ancre donc à
  // midi UTC : aucun fuseau réel ne franchit une frontière de jour depuis là.
  const date =
    typeof value === "string" && BARE_DATE.test(value)
      ? new Date(`${value}T12:00:00Z`)
      : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * La valeur porte-t-elle une heure qui veut dire quelque chose ?
 *
 * Deux formes n'en portent pas, et elles doivent s'afficher sans heure :
 *
 * - `YYYY-MM-DD`, une colonne `date` — le cas évident ;
 * - un horodatage à **exactement minuit UTC**, qui est ce qu'écrit un
 *   sélecteur de date quand l'utilisateur n'a choisi qu'un jour.
 *
 * Le second cas est le « Sep 5, 2026 · 2:00 AM » de l'audit : minuit UTC rendu
 * à Paris donne 02:00 l'été. Afficher cette heure, c'est inventer un détail que
 * personne n'a saisi — et un commercial qui lit « rendez-vous à 2h du matin »
 * cesse de faire confiance à l'écran.
 *
 * Le risque assumé : un vrai rendez-vous à 2h00 du matin, heure de Paris,
 * s'afficherait sans heure. Il n'en existe pas dans un CRM de santé.
 */
export function isDateOnly(value: string | Date | null | undefined): boolean {
  if (!value) return false;
  if (typeof value === "string" && BARE_DATE.test(value)) return true;
  const date = toDate(value);
  if (!date) return false;
  return (
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0
  );
}

/** « 30 sept. 2026 ». */
export function formatDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? DATE.format(date) : NO_DATE;
}

/** « 30 septembre 2026 », pour les endroits qui ont la place. */
export function formatDateLong(
  value: string | Date | null | undefined,
): string {
  const date = toDate(value);
  return date ? DATE_LONG.format(date) : NO_DATE;
}

/** « 09:52 ». */
export function formatTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? TIME.format(date) : NO_DATE;
}

/**
 * « 30 sept. 2026, 09:52 » — ou « 30 sept. 2026 » quand l'heure ne veut rien
 * dire. C'est le formateur à utiliser par défaut sur une échéance.
 */
export function formatDateTime(
  value: string | Date | null | undefined,
): string {
  const date = toDate(value);
  if (!date) return NO_DATE;
  return isDateOnly(value) ? DATE.format(date) : DATE_TIME.format(date);
}

/**
 * Format relatif court pour le passé récent : « il y a 3 j ».
 *
 * Court parce qu'il vit dans des listes denses, où « il y a environ 3 jours »
 * pousse le reste de la ligne hors de la cellule.
 *
 * Au-delà de sept jours, la date absolue. Un relatif lointain — « il y a 4
 * mois » — demande un calcul mental pour être rapproché d'autre chose, alors
 * qu'une date se compare directement.
 */
export function formatRelativeShort(
  value: string | Date | null | undefined,
  now: Date = new Date(),
): string {
  const date = toDate(value);
  if (!date) return NO_DATE;

  const days = Math.round(
    (startOfDayUTC(now) - startOfDayUTC(date)) / 86_400_000,
  );

  if (days === 0) return "aujourd'hui";
  if (days === 1) return "hier";
  if (days === -1) return "demain";
  if (days > 1 && days <= 7) return `il y a ${days} j`;
  if (days < -1 && days >= -7) return `dans ${-days} j`;
  return DATE.format(date);
}

/**
 * Minuit dans le fuseau d'affichage, en millisecondes.
 *
 * « Hier » est une frontière de calendrier, pas un écart de 24 heures : une
 * tâche de 23h et une de 1h du matin sont à deux heures l'une de l'autre et
 * pourtant sur deux jours différents. Le calcul se fait donc sur les dates
 * telles qu'elles s'affichent, à Paris.
 */
function startOfDayUTC(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: TIME_ZONE,
  }).format(date);
  return new Date(`${parts}T00:00:00Z`).getTime();
}
