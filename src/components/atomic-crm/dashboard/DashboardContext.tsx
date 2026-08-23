import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useGetList } from "ra-core";
import { useSearchParams } from "react-router-dom";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { startOfToday } from "../deals/cockpit/dealDates";
import type { DealRecord } from "../deals/cockpit/dealFields";
import type { NextActionOptions } from "../deals/cockpit/dealFields";
import type { WeightingConfig } from "../deals/cockpit/dealWeighting";
import {
  DEFAULT_PERIOD_ID,
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

const PARAM = {
  period: "periode",
  sales: "responsable",
  category: "categorie",
  products: "produit",
} as const;

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

  const [searchParams, setSearchParams] = useSearchParams();

  // Frozen for the lifetime of the screen, so a re-render never moves the
  // reference point mid-computation.
  const [today] = useState(() => startOfToday());
  const [granularityOverride, setGranularityOverride] =
    useState<BucketGranularity | null>(null);

  const selection = useMemo<DashboardSelection>(() => {
    const rawPeriod = searchParams.get(PARAM.period);
    const products = searchParams.get(PARAM.products);
    return {
      periodId: PERIOD_IDS.includes(rawPeriod as PeriodId)
        ? (rawPeriod as PeriodId)
        : DEFAULT_PERIOD_ID,
      salesId: searchParams.get(PARAM.sales),
      category: searchParams.get(PARAM.category),
      products: products ? products.split(",").filter(Boolean) : [],
    };
  }, [searchParams]);

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
      setSalesId: (id) => setParam(PARAM.sales, id),
      setCategory: (id) => setParam(PARAM.category, id),
      setProducts: (list) =>
        setParam(PARAM.products, list.length ? list.join(",") : null),
      reset: () => setSearchParams(new URLSearchParams(), { replace: true }),
      selectionFilter,
      hasActiveFilters:
        selection.periodId !== DEFAULT_PERIOD_ID ||
        selection.salesId !== null ||
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
