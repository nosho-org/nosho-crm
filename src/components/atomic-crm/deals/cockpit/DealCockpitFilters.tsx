import { RotateCcw } from "lucide-react";
import { useGetIdentity, useGetList } from "ra-core";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useConfigurationContext } from "../../root/ConfigurationContext";
import type { Sale } from "../../types";
import { getCompanyTypeChoices } from "../dealUtils";
import { useDealCockpit } from "./DealCockpitContext";
import { DEAL_PRIORITIES } from "./dealFields";
import { FACET_ALL, FACET_UNSET } from "./dealFilters";
import { getPeriodChoices, type PeriodId } from "./dealPeriods";

const FacetSelect = ({
  label,
  value,
  onChange,
  allLabel,
  choices,
  unsetLabel,
  className = "w-full sm:w-48",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
  choices: { value: string; label: string }[];
  unsetLabel?: string;
  className?: string;
}) => (
  <label className="flex flex-col gap-1 min-w-0">
    <span className="text-xs font-medium text-muted-foreground">{label}</span>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={FACET_ALL}>{allLabel}</SelectItem>
        {choices.map((choice) => (
          <SelectItem key={choice.value} value={choice.value}>
            {choice.label}
          </SelectItem>
        ))}
        {unsetLabel && (
          <SelectItem value={FACET_UNSET}>{unsetLabel}</SelectItem>
        )}
      </SelectContent>
    </Select>
  </label>
);

/**
 * The five facets of issue #96 in one row. Responsable, catégorie and période
 * are server-side filters on real columns; priorité and type are applied to the
 * returned rows until those columns exist. See `dealFilters.ts`.
 */
export const DealCockpitFilters = () => {
  const { dealCategories, companyTypes, customViews } =
    useConfigurationContext();
  const {
    facets,
    setFacet,
    salesId,
    setSalesId,
    category,
    setCategory,
    periodId,
    setPeriodId,
    activeFilterCount,
    resetFilters,
    today,
  } = useDealCockpit();
  const { identity } = useGetIdentity();
  const { data: sales } = useGetList<Sale>("sales", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "first_name", order: "ASC" },
    filter: { "disabled@neq": true },
  });

  const salesChoices = (sales ?? []).map((sale) => ({
    value: String(sale.id),
    label:
      identity?.id === sale.id
        ? `${sale.first_name} ${sale.last_name} (moi)`
        : `${sale.first_name} ${sale.last_name}`,
  }));

  return (
    <div className="flex flex-wrap items-end gap-3">
      <FacetSelect
        label="Responsable"
        value={salesId == null ? FACET_ALL : String(salesId)}
        onChange={(value) =>
          setSalesId(value === FACET_ALL ? undefined : Number(value))
        }
        allLabel="Tous"
        choices={salesChoices}
      />

      <FacetSelect
        label="Priorité"
        value={facets.priority}
        onChange={(value) => setFacet("priority", value)}
        allLabel="Toutes"
        choices={DEAL_PRIORITIES.map(({ value, label }) => ({ value, label }))}
        unsetLabel="Non définie"
      />

      <FacetSelect
        label="Catégorie"
        value={category ?? FACET_ALL}
        onChange={(value) =>
          setCategory(value === FACET_ALL ? undefined : value)
        }
        allLabel="Toutes"
        choices={dealCategories}
      />

      <FacetSelect
        label="Type"
        value={facets.type}
        onChange={(value) => setFacet("type", value)}
        allLabel="Tous"
        choices={getCompanyTypeChoices(companyTypes, customViews)}
        unsetLabel="Non défini"
      />

      <FacetSelect
        label="Période (date de clôture prévue)"
        value={periodId}
        onChange={(value) => setPeriodId(value as PeriodId)}
        allLabel="Toutes périodes"
        choices={getPeriodChoices(today).filter(
          (choice) => choice.value !== "all",
        )}
        className="w-full sm:w-64"
      />

      {activeFilterCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={resetFilters}
          className="mb-0.5"
        >
          <RotateCcw className="w-4 h-4" />
          Réinitialiser ({activeFilterCount})
        </Button>
      )}
    </div>
  );
};
