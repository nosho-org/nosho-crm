import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useGetIdentity, useGetList } from "ra-core";
import { useSearchParams } from "react-router-dom";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { startOfToday } from "../deals/cockpit/dealDates";
import type { DealRecord } from "../deals/cockpit/dealFields";
import type { NextActionOptions } from "../deals/cockpit/dealFields";
import type { WeightingConfig } from "../deals/cockpit/dealWeighting";
import {
  PERIOD_IDS,
  getPeriodFilter,
  resolvePeriod,
  type BucketGranularity,
  type PeriodId,
  type ResolvedPeriod,
} from "../deals/cockpit/dealPeriods";
import { getCommercialDealsFilter } from "../deals/dealUtils";
import {
  toListFilter,
  type DealFilterState,
} from "../deals/dealFilterContract";

/**
 * ---------------------------------------------------------------------------
 * Dashboard selection (NOS-955 §2)
 * ---------------------------------------------------------------------------
 * "Tous les KPI et graphiques doivent se recalculer simultanément quand un
 * filtre est appliqué." One query, one selection, one `today` — every widget
 * reads from here, so the banner, the forecast, the funnel and the health
 * alerts are guaranteed to describe the same set of deals.
 *
 * The selection lives in the URL rather than in local state, so a dashboard
 * view survives a reload and can be shared as a link. That mirrors what the
 * cockpit does with the list filters, for the same reason.
 */

export interface DashboardSelection {
  periodId: PeriodId;
  salesId: string | null;
  category: string | null;
  products: string[];
}

export interface DashboardContextValue {
  deals: DealRecord[];
  isPending: boolean;
  selection: DashboardSelection;
  period: ResolvedPeriod;
  granularity: BucketGranularity;
  setGranularity: (value: BucketGranularity) => void;
  setPeriodId: (value: PeriodId) => void;
  setSalesId: (value: string | null) => void;
  setCategory: (value: string | null) => void;
  setProducts: (value: string[]) => void;
  reset: () => void;
  hasActiveFilters: boolean;
  /**
   * The current selection as a `DealFilterState`, ready to be spread into a
   * `toDealsLink` call.
   *
   * Every link out of the dashboard must carry it. Without the period bounds a
   * "7 opportunités en sommeil" alert opens a list of 17 — the count and the
   * list would describe different sets, which is precisely what routing through
   * the shared contract is supposed to prevent.
   */
  selectionFilter: DealFilterState;
  today: Date;
  weighting: WeightingConfig;
  inactivityThresholdDays: number;
  nextActionOptions: NextActionOptions;
  mrrTarget: number;
  /**
   * Set when the query hit its ceiling. Every total on screen is then computed
   * on a partial set, and the widgets say so rather than quietly under-reporting.
   */
  truncated: { loaded: number; total: number } | null;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

/** Matches the ceiling the Opportunités list already uses. */
const MAX_DEALS = 1000;

/**
 * The dashboard opens on every period, not on the current quarter.
 *
 * `DEFAULT_PERIOD_ID` is "current-quarter", inherited from the cockpit where a
 * short horizon made sense next to a board. On a business dashboard it hides
 * data: the period filters `expected_closing_date`, and in production none of
 * the 17 won deals has a closing date inside the current quarter — so the
 * headline read "ARR signé : 0 €" while 56 160 € were signed.
 *
 * "Toutes" is the only default that cannot mislead. The forecast still falls
 * back to the current year for its columns, and states the range it covers.
 */
const DASHBOARD_DEFAULT_PERIOD: PeriodId = "all";

const PARAM = {
  period: "periode",
  sales: "responsable",
  category: "categorie",
  products: "produit",
} as const;

/**
 * « Tous les responsables », écrit explicitement dans l'URL (NOS-1063).
 *
 * Depuis que l'absence de paramètre vaut « moi », `null` ne peut plus dire à la
 * fois « pas encore choisi » et « tous » : choisir « Tous » reviendrait à ne
 * rien choisir, et le tableau de bord se replierait sur l'utilisateur courant
 * au rechargement — en contredisant ce que le sélecteur affiche.
 */
const ALL_SALES = "tous";

export const DashboardProvider = ({ children }: { children: ReactNode }) => {
  const {
    dealStages,
    dealPipelineStatuses,
    dealStageProbabilities,
    dealInactivityAlertDays,
    dealNextActionFromStage,
    companyTypes,
    customViews,
    mrrTarget,
  } = useConfigurationContext();

  const { identity, isPending: identityPending } = useGetIdentity();
  const [searchParams, setSearchParams] = useSearchParams();

  // Frozen for the lifetime of the screen, so a re-render never moves the
  // reference point mid-computation.
  const [today] = useState(() => startOfToday());
  const [granularityOverride, setGranularityOverride] =
    useState<BucketGranularity | null>(null);

  const selection = useMemo<DashboardSelection>(() => {
    const rawPeriod = searchParams.get(PARAM.period);
    const products = searchParams.get(PARAM.products);
    const rawSales = searchParams.get(PARAM.sales);
    return {
      periodId: PERIOD_IDS.includes(rawPeriod as PeriodId)
        ? (rawPeriod as PeriodId)
        : DASHBOARD_DEFAULT_PERIOD,
      // Rien dans l'URL = moi, pas tout le monde (NOS-1063). On arrive sur son
      // propre tableau de bord, pas sur celui de l'équipe : le chiffre qui
      // s'affiche à la connexion doit être celui dont on répond.
      salesId:
        rawSales === null
          ? (identity?.id?.toString() ?? null)
          : rawSales === ALL_SALES
            ? null
            : rawSales,
      category: searchParams.get(PARAM.category),
      products: products ? products.split(",").filter(Boolean) : [],
    };
  }, [searchParams, identity?.id]);

  const period = useMemo(
    () => resolvePeriod(selection.periodId, today),
    [selection.periodId, today],
  );

  // A year split by month is 13 columns, which pushes the total off screen.
  // Long periods therefore open on quarters; the toggle still overrides it.
  const granularity: BucketGranularity =
    granularityOverride ??
    (selection.periodId === "all" || selection.periodId === "current-year"
      ? "quarter"
      : "month");

  const setParam = useCallback(
    (key: string, value: string | null) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (value === null || value === "") next.delete(key);
          else next.set(key, value);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  /**
   * The selection expressed once, in the vocabulary of the shared contract.
   * It feeds both the query below and every link out of the dashboard, so the
   * numbers on screen and the lists they open cannot drift apart.
   */
  const selectionFilter = useMemo<DealFilterState>(() => {
    const bounds = getPeriodFilter(period);
    return {
      periodStart: bounds["expected_closing_date@gte"] ?? null,
      periodEnd: bounds["expected_closing_date@lte"] ?? null,
      salesId: selection.salesId,
      category: selection.category,
      products: selection.products,
    };
  }, [period, selection]);

  /**
   * Everything is filtered server-side. The dashboard aggregates over the whole
   * selection, so client-side facets would mean summing a page and calling it a
   * total — which is how `KPICards` used to work.
   */
  const filter = useMemo(
    () => ({
      "archived_at@is": null,
      ...getCommercialDealsFilter(companyTypes, customViews),
      ...toListFilter(selectionFilter, { today }),
    }),
    [companyTypes, customViews, selectionFilter, today],
  );

  const { data, total, isPending } = useGetList<DealRecord>("deals", {
    pagination: { page: 1, perPage: MAX_DEALS },
    sort: { field: "expected_closing_date", order: "ASC" },
    filter,
  });

  const deals = useMemo(() => data ?? [], [data]);

  const value = useMemo<DashboardContextValue>(() => {
    const loaded = deals.length;
    return {
      deals,
      isPending,
      selection,
      period,
      granularity,
      setGranularity: setGranularityOverride,
      setPeriodId: (id) => setParam(PARAM.period, id),
      // `null` = « Tous », et il faut l'écrire : effacer le paramètre voudrait
      // dire « pas de choix », donc revenir à moi (NOS-1063).
      setSalesId: (id) => setParam(PARAM.sales, id ?? ALL_SALES),
      setCategory: (id) => setParam(PARAM.category, id),
      setProducts: (list) =>
        setParam(PARAM.products, list.length ? list.join(",") : null),
      reset: () => setSearchParams(new URLSearchParams(), { replace: true }),
      selectionFilter,
      hasActiveFilters:
        selection.periodId !== DASHBOARD_DEFAULT_PERIOD ||
        // Comparé au défaut, pas à `null` : « moi » est désormais l'état de
        // repos, et l'afficher comme un filtre actif ferait clignoter
        // « Réinitialiser » sur un tableau de bord que personne n'a touché.
        searchParams.has(PARAM.sales) ||
        selection.category !== null ||
        selection.products.length > 0,
      today,
      weighting: {
        stageProbabilities: dealStageProbabilities ?? {},
        pipelineStatuses: dealPipelineStatuses,
      },
      inactivityThresholdDays: dealInactivityAlertDays,
      nextActionOptions: {
        dealStages,
        pipelineStatuses: dealPipelineStatuses,
        fromStage: dealNextActionFromStage,
        today,
      },
      mrrTarget,
      truncated: total != null && total > loaded ? { loaded, total } : null,
    };
  }, [
    deals,
    isPending,
    // `hasActiveFilters` lit `searchParams` directement, pour distinguer
    // « responsable non choisi » de « responsable choisi et égal au défaut ».
    // `selection` seul ne suffirait pas : les deux donnent le même `salesId`.
    searchParams,
    selection,
    selectionFilter,
    period,
    granularity,
    setParam,
    setSearchParams,
    today,
    dealStageProbabilities,
    dealPipelineStatuses,
    dealInactivityAlertDays,
    dealStages,
    dealNextActionFromStage,
    mrrTarget,
    total,
  ]);

  // Après tous les hooks, jamais avant. Sans cette attente le tableau de bord
  // se peint une première fois « Tous » — l'identité n'étant pas résolue — puis
  // se recalcule sur l'utilisateur : deux requêtes, et un chiffre d'équipe
  // affiché une fraction de seconde comme s'il était le sien.
  if (identityPending) return null;

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
};

export const useDashboard = (): DashboardContextValue => {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error("useDashboard must be used within a DashboardProvider");
  }
  return context;
};
