import type { RevenueActual } from "../types";

/**
 * ---------------------------------------------------------------------------
 * Le MRR réellement encaissé (NOS-1179)
 * ---------------------------------------------------------------------------
 * Tout le reste du tableau de bord parle d'ARR **saisi** : un montant qu'un
 * commercial a tapé dans une opportunité. Ce module porte l'autre chiffre,
 * celui qui a atterri sur le compte.
 *
 * ## La règle du mois en cours
 *
 * « Tant que le mois n'est pas fini, tu conserves le MRR du mois précédent. »
 * C'est la règle demandée, et elle est juste : un mois entamé au tiers affiche
 * mécaniquement un tiers du chiffre. Le présenter comme un MRR ferait lire une
 * chute de 66 % tous les 10 du mois.
 *
 * Donc : on affiche **le dernier mois complet**, et on le nomme. Un chiffre
 * sans son mois se lit comme « maintenant », ce qu'il n'est pas.
 *
 * ## Deux sources, additionnées
 *
 * `mollie` et `virement`. La consigne de départ disait que les virements
 * Mollie équivalaient à tous les paiements clients — c'est faux : Hôpital
 * Européen paie par virement bancaire direct. Simon l'a repéré sur l'écart
 * entre 3 166 € et les 3 874 € qu'il attendait pour juillet.
 */

export interface MonthlyRevenue {
  /** `2026-07-01`. */
  month: string;
  /** Toutes sources confondues. */
  amount: number;
  /** Nombre d'encaissements, pour repérer une collecte partielle. */
  transactionCount: number;
  /** Le détail, pour pouvoir vérifier le total. */
  bySource: { source: string; amount: number }[];
}

/** Le premier jour du mois en cours, en `YYYY-MM-DD`. */
export function currentMonthStart(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

/** Additionne les sources d'un même mois. */
export function groupByMonth(rows: RevenueActual[]): MonthlyRevenue[] {
  const byMonth = new Map<string, MonthlyRevenue>();

  for (const row of rows) {
    const month = row.month.slice(0, 10);
    const existing = byMonth.get(month) ?? {
      month,
      amount: 0,
      transactionCount: 0,
      bySource: [],
    };
    existing.amount += Number(row.amount) || 0;
    existing.transactionCount += row.transaction_count ?? 0;
    existing.bySource.push({
      source: row.source,
      amount: Number(row.amount) || 0,
    });
    byMonth.set(month, existing);
  }

  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Le dernier mois **complet**, et lui seul.
 *
 * Le mois en cours est écarté quoi qu'il arrive, même s'il porte déjà un
 * total : il n'est pas comparable aux précédents. C'est exactement la règle
 * demandée — « tant que le mois n'est pas fini, tu conserves le MRR du mois
 * précédent ».
 */
export function lastCompleteMonth(
  rows: RevenueActual[],
  now: Date = new Date(),
): MonthlyRevenue | null {
  const current = currentMonthStart(now);
  const complete = groupByMonth(rows).filter((entry) => entry.month < current);
  return complete[complete.length - 1] ?? null;
}

/**
 * La variation par rapport au mois d'avant.
 *
 * `null` quand il n'y a pas de mois précédent, ou qu'il valait zéro : passer
 * de 0 à 3 000 € n'est pas « +∞ % », c'est un démarrage.
 */
export function monthOverMonth(
  rows: RevenueActual[],
  now: Date = new Date(),
): {
  current: MonthlyRevenue;
  previous: MonthlyRevenue | null;
  deltaPercent: number | null;
} | null {
  const current = currentMonthStart(now);
  const complete = groupByMonth(rows).filter((entry) => entry.month < current);
  const last = complete[complete.length - 1];
  if (!last) return null;

  const previous = complete[complete.length - 2] ?? null;
  return {
    current: last,
    previous,
    deltaPercent:
      previous && previous.amount > 0
        ? Math.round(((last.amount - previous.amount) / previous.amount) * 100)
        : null,
  };
}

/** « juillet 2026 ». */
export function formatMonth(month: string): string {
  const date = new Date(`${month.slice(0, 7)}-01T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return month;
  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
