import { useListContext, useListFilterContext } from "ra-core";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useConfigurationContext } from "../../root/ConfigurationContext";
import { startOfToday } from "./dealDates";
import type { DealRecord, NextActionOptions } from "./dealFields";
import type { ActivityOptions } from "./dealFields";
import type { DealFacets } from "./dealFilters";
import {
  EMPTY_FACETS,
  applyDealFacets,
  countActiveFacets,
} from "./dealFilters";
import type {
  BucketGranularity,
  PeriodId,
  ResolvedPeriod,
} from "./dealPeriods";
import {
  PERIOD_IDS,
  getPeriodBuckets,
  getPeriodFilter,
  resolvePeriod,
} from "./dealPeriods";
import type { Forecast, RevenueSnapshot } from "./dealRevenue";
import { computeForecast, computeRevenueSnapshot } from "./dealRevenue";
import type { WeightingConfig } from "./dealWeighting";

const PERIOD_FILTER_KEYS = [
  "expected_closing_date@gte",
  "expected_closing_date@lte",
];

export interface DealCockpitContextValue {
  /** The one filtered set every part of the screen describes. */
  deals: DealRecord[];
  /** Rows returned by the query, before the client-side facets. */
  queriedDeals: DealRecord[];
  snapshot: RevenueSnapshot;
  forecast: Forecast;
  period: ResolvedPeriod;
  periodId: PeriodId;
  setPeriodId: (id: PeriodId) => void;
  granularity: BucketGranularity;
  setGranularity: (granularity: BucketGranularity) => void;
  facets: DealFacets;
  setFacet: (key: keyof DealFacets, value: string) => void;
  salesId: string | number | undefined;
  setSalesId: (value: string | number | undefined) => void;
  category: string | undefined;
  setCategory: (value: string | undefined) => void;
  activeFilterCount: number;
  resetFilters: () => void;
  /** Local midnight, shared by every "days since"/"days until" computation. */
  today: Date;
  weighting: WeightingConfig;
  inactivityThresholdDays: number;
  nextActionOptions: NextActionOptions;
  activityOptions: ActivityOptions;
  /**
   * Set when the query returned fewer rows than exist. The banner says so:
   * a total computed on a truncated page is not the total.
   */
  truncated: { loaded: number; total: number } | null;
  isPending: boolean;
}

const DealCockpitContext = createContext<DealCockpitContextValue | null>(null);

export const DealCockpitProvider = ({ children }: { children: ReactNode }) => {
  const {
    dealStages,
    dealPipelineStatuses,
    dealStageProbabilities,
    dealInactivityAlertDays,
    dealNextActionFromStage,
  } = useConfigurationContext();
  const { data, total, isPending } = useListContext<DealRecord>();
  const { filterValues, displayedFilters, setFilters } = useListFilterContext();

  // Frozen for the lifetime of the screen so that a re-render never moves the
  // reference point mid-computation.
  const [today] = useState(() => startOfToday());
  const [facets, setFacets] = useState<DealFacets>(EMPTY_FACETS);
  const [granularityOverride, setGranularity] =
    useState<BucketGranularity | null>(null);

  const weighting = useMemo<WeightingConfig>(
    () => ({
      stageProbabilities: dealStageProbabilities ?? {},
      pipelineStatuses: dealPipelineStatuses,
    }),
    [dealStageProbabilities, dealPipelineStatuses],
  );

  /**
   * The period lives in the list filters, not in local state: it is a server
   * query on `expected_closing_date`, and reading it back from the filters
   * keeps the selector in sync with the URL after a reload or a shared link.
   */
  const periodId = useMemo<PeriodId>(() => {
    const bounds = PERIOD_FILTER_KEYS.map((key) => filterValues?.[key]);
    if (bounds.every((bound) => bound == null)) return "all";
    return (
      PERIOD_IDS.find((id) => {
        const filter = getPeriodFilter(resolvePeriod(id, today));
        return PERIOD_FILTER_KEYS.every(
          (key, index) => filter[key] === bounds[index],
        );
      }) ?? "all"
    );
  }, [filterValues, today]);

  const period = useMemo(
    () => resolvePeriod(periodId, today),
    [periodId, today],
  );

  // A year split by month is 13 columns, which pushes the total off screen.
  // Long periods therefore open on quarters; the toggle still overrides it.
  const granularity: BucketGranularity =
    granularityOverride ??
    (periodId === "all" || periodId === "current-year" ? "quarter" : "month");

  const mergeFilters = useCallback(
    (changes: Record<string, unknown>) => {
      const next = { ...filterValues, ...changes };
      for (const [key, value] of Object.entries(next)) {
        if (value === undefined) delete next[key];
      }
      setFilters(next, displayedFilters);
    },
    [filterValues, displayedFilters, setFilters],
  );

  const setPeriodId = useCallback(
    (id: PeriodId) => {
      const filter = getPeriodFilter(resolvePeriod(id, today));
      mergeFilters({
        "expected_closing_date@gte": filter["expected_closing_date@gte"],
        "expected_closing_date@lte": filter["expected_closing_date@lte"],
      });
    },
    [mergeFilters, today],
  );

  const setFacet = useCallback((key: keyof DealFacets, value: string) => {
    setFacets((previous) => ({ ...previous, [key]: value }));
  }, []);

  const setSalesId = useCallback(
    (value: string | number | undefined) => mergeFilters({ sales_id: value }),
    [mergeFilters],
  );

  const setCategory = useCallback(
    (value: string | undefined) => mergeFilters({ category: value }),
    [mergeFilters],
  );

  const resetFilters = useCallback(() => {
    setFacets(EMPTY_FACETS);
    mergeFilters({
      "expected_closing_date@gte": undefined,
      "expected_closing_date@lte": undefined,
      sales_id: undefined,
      category: undefined,
    });
  }, [mergeFilters]);

  const queriedDeals = useMemo(() => data ?? [], [data]);
  const deals = useMemo(
    () => applyDealFacets(queriedDeals, facets),
    [queriedDeals, facets],
  );

  const snapshotOptions = useMemo(
    () => ({
      weighting,
      inactivityThresholdDays: dealInactivityAlertDays,
      today,
    }),
    [weighting, dealInactivityAlertDays, today],
  );

  const snapshot = useMemo(
    () => computeRevenueSnapshot(deals, snapshotOptions),
    [deals, snapshotOptions],
  );

  const forecast = useMemo(
    () =>
      computeForecast(deals, getPeriodBuckets(period, granularity, today), {
        weighting,
      }),
    [deals, period, granularity, today, weighting],
  );

  const nextActionOptions = useMemo<NextActionOptions>(
    () => ({
      dealStages,
      pipelineStatuses: dealPipelineStatuses,
      fromStage: dealNextActionFromStage,
      today,
    }),
    [dealStages, dealPipelineStatuses, dealNextActionFromStage, today],
  );

  const activityOptions = useMemo<ActivityOptions>(
    () => ({
      pipelineStatuses: dealPipelineStatuses,
      thresholdDays: dealInactivityAlertDays,
      today,
    }),
    [dealPipelineStatuses, dealInactivityAlertDays, today],
  );

  const activeFilterCount =
    countActiveFacets(facets) +
    (periodId !== "all" ? 1 : 0) +
    (filterValues?.sales_id != null ? 1 : 0) +
    (filterValues?.category != null ? 1 : 0);

  const value = useMemo<DealCockpitContextValue>(
    () => ({
      deals,
      queriedDeals,
      snapshot,
      forecast,
      period,
      periodId,
      setPeriodId,
      granularity,
      setGranularity,
      facets,
      setFacet,
      salesId: filterValues?.sales_id,
      setSalesId,
      category: filterValues?.category,
      setCategory,
      activeFilterCount,
      resetFilters,
      today,
      weighting,
      inactivityThresholdDays: dealInactivityAlertDays,
      nextActionOptions,
      activityOptions,
      truncated:
        total != null && total > queriedDeals.length
          ? { loaded: queriedDeals.length, total }
          : null,
      isPending,
    }),
    [
      deals,
      queriedDeals,
      snapshot,
      forecast,
      period,
      periodId,
      setPeriodId,
      granularity,
      facets,
      setFacet,
      filterValues,
      setSalesId,
      setCategory,
      activeFilterCount,
      resetFilters,
      today,
      weighting,
      dealInactivityAlertDays,
      nextActionOptions,
      activityOptions,
      total,
      isPending,
    ],
  );

  return (
    <DealCockpitContext.Provider value={value}>
      {children}
    </DealCockpitContext.Provider>
  );
};

export const useDealCockpit = (): DealCockpitContextValue => {
  const context = useContext(DealCockpitContext);
  if (!context) {
    throw new Error("useDealCockpit must be used inside a DealCockpitProvider");
  }
  return context;
};

/** Null outside the cockpit, for components shared with other screens. */
export const useOptionalDealCockpit = (): DealCockpitContextValue | null =>
  useContext(DealCockpitContext);

export interface DealFieldOptions {
  nextActionOptions: NextActionOptions;
  activityOptions: ActivityOptions;
  inactivityThresholdDays: number;
}

/**
 * Options for the shared deal cells. Inside the cockpit they come from the
 * provider, so a card and its row share one reference date; outside it (the
 * archived deals dialog, for instance) they are derived from the same
 * configuration, so the rendering rules never diverge.
 */
export const useDealFieldOptions = (): DealFieldOptions => {
  const cockpit = useOptionalDealCockpit();
  const {
    dealStages,
    dealPipelineStatuses,
    dealInactivityAlertDays,
    dealNextActionFromStage,
  } = useConfigurationContext();
  const [fallbackToday] = useState(() => startOfToday());

  return useMemo(() => {
    if (cockpit) {
      return {
        nextActionOptions: cockpit.nextActionOptions,
        activityOptions: cockpit.activityOptions,
        inactivityThresholdDays: cockpit.inactivityThresholdDays,
      };
    }
    return {
      nextActionOptions: {
        dealStages,
        pipelineStatuses: dealPipelineStatuses,
        fromStage: dealNextActionFromStage,
        today: fallbackToday,
      },
      activityOptions: {
        pipelineStatuses: dealPipelineStatuses,
        thresholdDays: dealInactivityAlertDays,
        today: fallbackToday,
      },
      inactivityThresholdDays: dealInactivityAlertDays,
    };
  }, [
    cockpit,
    dealStages,
    dealPipelineStatuses,
    dealInactivityAlertDays,
    dealNextActionFromStage,
    fallbackToday,
  ]);
};
