import { RotateCcw } from "lucide-react";
import { useGetList, useListFilterContext } from "ra-core";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Sale } from "../types";
import { startOfToday } from "./cockpit/dealDates";
import {
  PERIOD_IDS,
  getPeriodFilter,
  resolvePeriod,
  type PeriodId,
} from "./cockpit/dealPeriods";
import { toListFilter } from "./dealFilterContract";

/**
 * ---------------------------------------------------------------------------
 * The six filters of NOS-956 §2
 * ---------------------------------------------------------------------------
 *     Période | Responsable | Priorité | Catégorie | Produit | Étape
 *
 * Always visible, not hidden behind an "Add filter" menu: this bar is how the
 * screen is driven, and the spec caps it at six precisely so it can stay on
 * screen. The same bar serves the list and the kanban — "les filtres
 * fonctionnent de manière identique sur Liste et Kanban" falls out of writing
 * to the shared list filters rather than to local state.
 *
 * Period defaults to "Toutes" here, unlike the dashboard: this is the execution
 * screen, and a deal with no close date in the current quarter is still a deal
 * you have to work.
 */

const ALL = "__all__";

const PERIOD_KEYS = [
  "expected_closing_date@gte",
  "expected_closing_date@lte",
] as const;

const FilterSelect = ({
  label,
  value,
  onChange,
  allLabel,
  choices,
  className = "w-40",
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  allLabel: string;
  choices: { value: string; label: string }[];
  className?: string;
}) => (
  <label className="flex flex-col gap-1 min-w-0">
    <span className="text-xs font-medium text-muted-foreground">{label}</span>
    <Select
      value={value ?? ALL}
      onValueChange={(next) => onChange(next === ALL ? null : next)}
    >
      <SelectTrigger className={className} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {choices.map((choice) => (
          <SelectItem key={choice.value} value={choice.value}>
            {choice.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </label>
);

export const DealFilterBar = () => {
  const { dealCategories, dealPriorities, dealProducts, dealStages } =
    useConfigurationContext();
  const { filterValues, displayedFilters, setFilters } = useListFilterContext();
  const today = startOfToday();

  const { data: sales } = useGetList<Sale>("sales", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "last_name", order: "ASC" },
  });

  const merge = (changes: Record<string, unknown>) => {
    const next = { ...filterValues, ...changes };
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) delete next[key];
    }
    setFilters(next, displayedFilters);
  };

  /**
   * The period is read back out of the filters rather than held in local state,
   * so the selector stays in sync with the URL after a reload — and so a link
   * arriving from the dashboard shows the period it carried.
   */
  const periodId: PeriodId = (() => {
    const bounds = PERIOD_KEYS.map((key) => filterValues?.[key]);
    if (bounds.every((bound) => bound == null)) return "all";
    return (
      PERIOD_IDS.find((id) => {
        const filter = getPeriodFilter(resolvePeriod(id, today));
        return PERIOD_KEYS.every((key, index) => filter[key] === bounds[index]);
      }) ?? "all"
    );
  })();

  const products: string[] = (() => {
    const raw = filterValues?.["products@ov"];
    if (typeof raw !== "string") return [];
    return raw
      .replace(/^\{|\}$/g, "")
      .split(",")
      .filter(Boolean);
  })();

  const setPeriod = (id: PeriodId) => {
    const filter = getPeriodFilter(resolvePeriod(id, today));
    merge({
      "expected_closing_date@gte": filter["expected_closing_date@gte"],
      "expected_closing_date@lte": filter["expected_closing_date@lte"],
    });
  };

  const toggleProduct = (value: string) => {
    const next = products.includes(value)
      ? products.filter((product) => product !== value)
      : [...products, value];
    // Spelled by the shared contract, so the encoding matches what the
    // dashboard's links produce. An empty selection clears the filter rather
    // than sending `{}`, which would match nothing.
    merge({
      "products@ov": next.length
        ? toListFilter({ products: next })["products@ov"]
        : undefined,
    });
  };

  const hasFilters = [
    ...PERIOD_KEYS,
    "sales_id",
    "priority",
    "category",
    "products@ov",
    "stage",
  ].some((key) => filterValues?.[key] != null);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <FilterSelect
        label="Période (date de clôture prévue)"
        value={periodId === "all" ? null : periodId}
        onChange={(value) => setPeriod((value ?? "all") as PeriodId)}
        allLabel="Toutes périodes"
        choices={PERIOD_IDS.filter((id) => id !== "all").map((id) => ({
          value: id,
          label: resolvePeriod(id, today).label,
        }))}
        className="w-56"
      />

      <FilterSelect
        label="Responsable"
        value={
          filterValues?.sales_id != null ? String(filterValues.sales_id) : null
        }
        onChange={(value) => merge({ sales_id: value ?? undefined })}
        allLabel="Tous"
        choices={(sales ?? []).map((sale) => ({
          value: String(sale.id),
          label: `${sale.first_name} ${sale.last_name}`.trim(),
        }))}
      />

      {/*
        Priority is pills, not a dropdown. The mockup shows the four levels side
        by side, and the spec asks to "garder visuellement que P0 — plus visuel
        et plus rapide": one click to isolate the critical deals.
      */}
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          Priorité
        </span>
        <div
          className="flex items-center gap-1"
          role="group"
          aria-label="Priorité"
        >
          {dealPriorities.map((priority) => {
            const active = filterValues?.priority === priority.value;
            return (
              <Button
                key={priority.value}
                type="button"
                size="sm"
                variant={active ? "default" : "outline"}
                aria-pressed={active}
                title={priority.label}
                onClick={() =>
                  merge({ priority: active ? undefined : priority.value })
                }
              >
                <span
                  className={`w-2 h-2 rounded-full ${priority.dotClassName}`}
                  aria-hidden
                />
                {priority.label.split(" ")[0]}
              </Button>
            );
          })}
        </div>
      </div>

      <FilterSelect
        label="Catégorie"
        value={
          typeof filterValues?.category === "string"
            ? filterValues.category
            : null
        }
        onChange={(value) => merge({ category: value ?? undefined })}
        allLabel="Toutes"
        choices={dealCategories}
      />

      {/* Multi-select, so pills again: "Produit = No-show + Entrant" means
          either, and a dropdown cannot show two active values honestly. */}
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          Produit {products.length > 0 && `(${products.length})`}
        </span>
        <div
          className="flex items-center gap-1"
          role="group"
          aria-label="Produit"
        >
          {dealProducts.map((product) => {
            const active = products.includes(product.value);
            return (
              <Button
                key={product.value}
                type="button"
                size="sm"
                variant={active ? "default" : "outline"}
                aria-pressed={active}
                onClick={() => toggleProduct(product.value)}
              >
                {product.label}
              </Button>
            );
          })}
        </div>
      </div>

      <FilterSelect
        label="Étape"
        value={
          typeof filterValues?.stage === "string" ? filterValues.stage : null
        }
        onChange={(value) => merge({ stage: value ?? undefined })}
        allLabel="Toutes"
        choices={dealStages}
      />

      {hasFilters && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mb-0.5"
          onClick={() =>
            merge({
              "expected_closing_date@gte": undefined,
              "expected_closing_date@lte": undefined,
              sales_id: undefined,
              priority: undefined,
              category: undefined,
              "products@ov": undefined,
              stage: undefined,
            })
          }
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden />
          Réinitialiser
        </Button>
      )}
    </div>
  );
};
