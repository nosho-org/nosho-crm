import { useGetIdentity, useGetList, useListFilterContext } from "ra-core";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Sale } from "../types";

const ALL = "all";
const MINE = "mine";

/**
 * Filter a deal list by one of its sales references.
 *
 * `source` selects which reference is filtered — `sales_id` for the owner,
 * `referrer_id` for whoever brought the lead in (NOS-804). It used to be
 * ignored, with `sales_id` hardcoded throughout.
 */
export const SalesFilterInput = ({
  source = "sales_id",
  label = "Propriétaire",
  emptyText = "Toutes les opportunités",
  mineText = "Mes opportunités",
}: {
  source?: string;
  label?: string;
  emptyText?: string;
  mineText?: string;
  alwaysOn?: boolean;
}) => {
  const { filterValues, displayedFilters, setFilters } = useListFilterContext();
  const { identity } = useGetIdentity();
  const { data: sales } = useGetList<Sale>("sales", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "first_name", order: "ASC" },
    filter: { "disabled@neq": true },
  });

  const value = filterValues[source];
  const currentValue =
    value == null
      ? ALL
      : identity?.id != null && value === identity.id
        ? MINE
        : String(value);

  const handleChange = (next: string) => {
    const newFilterValues = { ...filterValues };
    if (next === ALL) {
      delete newFilterValues[source];
    } else if (next === MINE) {
      newFilterValues[source] = identity?.id;
    } else {
      const numeric = Number(next);
      newFilterValues[source] = Number.isNaN(numeric) ? next : numeric;
    }
    setFilters(newFilterValues, displayedFilters);
  };

  return (
    <div className="mt-auto pb-2.25">
      <Select value={currentValue} onValueChange={handleChange}>
        <SelectTrigger className="w-48" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{emptyText}</SelectItem>
          {identity != null && <SelectItem value={MINE}>{mineText}</SelectItem>}
          {sales
            ?.filter((sale) => sale.id !== identity?.id)
            .map((sale) => (
              <SelectItem key={sale.id} value={String(sale.id)}>
                {sale.first_name} {sale.last_name}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  );
};
