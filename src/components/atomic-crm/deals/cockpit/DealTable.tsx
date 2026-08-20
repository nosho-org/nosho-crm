import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { RecordContextProvider, useRedirect } from "ra-core";
import { useMemo, useState } from "react";
import { ReferenceField } from "@/components/admin/reference-field";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { CompanyAvatar } from "../../companies/CompanyAvatar";
import { useConfigurationContext } from "../../root/ConfigurationContext";
import { findDealLabel } from "../deal";
import { useDealCockpit } from "./DealCockpitContext";
import {
  DealActivityCell,
  DealNextActionCell,
  DealPriorityBadge,
} from "./DealFieldBadges";
import type { DealRecord } from "./dealFields";
import { getDealTypeLabel } from "./dealFields";
import { UNKNOWN, formatAmount, formatDate, formatPercent } from "./dealFormat";
import { getCompanyTypeChoices } from "../dealUtils";
import type { DealSortField, SortDirection } from "./dealSort";
import { DEFAULT_SORT_DIRECTION, sortDeals } from "./dealSort";
import { getDealProbability, getWeightedAmount } from "./dealWeighting";

const COLUMNS: {
  field: DealSortField | null;
  label: string;
  align?: string;
}[] = [
  { field: "name", label: "Opportunité" },
  { field: null, label: "Type" },
  { field: "priority", label: "Priorité" },
  { field: "stage", label: "Étape" },
  { field: "amount", label: "Montant", align: "text-right" },
  { field: "weighted", label: "Montant pondéré", align: "text-right" },
  { field: null, label: "Probabilité", align: "text-right" },
  { field: "expected_closing_date", label: "Clôture prévue" },
  { field: "next_action_date", label: "Prochaine action" },
  { field: "activity", label: "Dernière activité" },
];

const SortIcon = ({
  active,
  direction,
}: {
  active: boolean;
  direction: SortDirection;
}) => {
  if (!active) {
    return (
      <ChevronsUpDown className="w-3 h-3 opacity-40 shrink-0" aria-hidden />
    );
  }
  return direction === "asc" ? (
    <ArrowUp className="w-3 h-3 shrink-0" aria-hidden />
  ) : (
    <ArrowDown className="w-3 h-3 shrink-0" aria-hidden />
  );
};

/**
 * The dense list of issues #92/#93: priority and next action readable without
 * opening a single record. It renders the same shared cells as the board cards,
 * over the same filtered selection as the banner above it.
 */
export const DealTable = () => {
  const { currency, dealStages, companyTypes, customViews } =
    useConfigurationContext();
  const { deals, weighting, nextActionOptions, activityOptions, snapshot } =
    useDealCockpit();
  const redirect = useRedirect();
  const [sort, setSort] = useState<{
    field: DealSortField;
    direction: SortDirection;
  }>({ field: "priority", direction: "asc" });

  const typeChoices = useMemo(
    () => getCompanyTypeChoices(companyTypes, customViews),
    [companyTypes, customViews],
  );

  const sorted = useMemo(
    () =>
      sortDeals(deals, sort.field, sort.direction, {
        weighting,
        nextActionOptions,
        activityOptions,
        stageOrder: dealStages.map((stage) => stage.value),
      }),
    [deals, sort, weighting, nextActionOptions, activityOptions, dealStages],
  );

  const toggleSort = (field: DealSortField) =>
    setSort((previous) =>
      previous.field === field
        ? {
            field,
            direction: previous.direction === "asc" ? "desc" : "asc",
          }
        : { field, direction: DEFAULT_SORT_DIRECTION[field] },
    );

  const openDeal = (deal: DealRecord) =>
    redirect(`/deals/${deal.id}/show`, undefined, undefined, undefined, {
      _scrollToTop: false,
    });

  if (deals.length === 0) {
    return (
      <Card className="p-8">
        <p className="text-sm text-muted-foreground text-center">
          Aucune opportunité ne correspond aux filtres sélectionnés.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((column) => (
                <TableHead key={column.label} className={column.align}>
                  {column.field ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column.field!)}
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                      aria-label={`Trier par ${column.label}`}
                    >
                      {column.label}
                      <SortIcon
                        active={sort.field === column.field}
                        direction={sort.direction}
                      />
                    </button>
                  ) : (
                    column.label
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>

          <TableBody>
            {sorted.map((deal) => {
              const probability = getDealProbability(deal, weighting);
              const weighted = getWeightedAmount(deal, weighting);
              return (
                <RecordContextProvider key={deal.id} value={deal}>
                  <TableRow
                    onClick={() => openDeal(deal)}
                    className="cursor-pointer"
                  >
                    <TableCell className="max-w-64">
                      <div className="flex items-center gap-2 min-w-0">
                        <ReferenceField
                          source="company_id"
                          reference="companies"
                          link={false}
                        >
                          <CompanyAvatar width={20} height={20} />
                        </ReferenceField>
                        <div className="flex flex-col min-w-0">
                          <span
                            className="text-sm font-medium truncate"
                            title={deal.name}
                          >
                            {deal.name}
                          </span>
                          <span className="text-xs text-muted-foreground truncate">
                            <ReferenceField
                              source="company_id"
                              reference="companies"
                              link={false}
                            />
                          </span>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground">
                      {getDealTypeLabel(deal, typeChoices) ?? UNKNOWN}
                    </TableCell>

                    <TableCell>
                      <DealPriorityBadge deal={deal} />
                    </TableCell>

                    <TableCell className="text-xs">
                      {findDealLabel(dealStages, deal.stage) ?? deal.stage}
                    </TableCell>

                    <TableCell className="text-right text-sm tabular-nums">
                      {formatAmount(deal.amount, currency)}
                    </TableCell>

                    <TableCell className="text-right text-sm tabular-nums">
                      {weighted === null ? (
                        <span
                          className="text-muted-foreground/70"
                          title="Aucune probabilité définie pour cette étape"
                        >
                          {UNKNOWN}
                        </span>
                      ) : (
                        formatAmount(weighted, currency)
                      )}
                    </TableCell>

                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                      {formatPercent(probability.value)}
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {formatDate(deal.expected_closing_date)}
                    </TableCell>

                    <TableCell className="max-w-56">
                      <DealNextActionCell deal={deal} />
                    </TableCell>

                    <TableCell>
                      <DealActivityCell deal={deal} />
                    </TableCell>
                  </TableRow>
                </RecordContextProvider>
              );
            })}
          </TableBody>

          <TableFooter>
            <TableRow>
              <TableCell colSpan={4} className="text-xs">
                {deals.length} opportunité{deals.length > 1 ? "s" : ""} affichée
                {deals.length > 1 ? "s" : ""}
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums">
                {formatAmount(
                  snapshot.potential.amount +
                    snapshot.signed.amount +
                    snapshot.lost.amount,
                  currency,
                )}
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums">
                {snapshot.weighted.available
                  ? formatAmount(snapshot.weighted.amount, currency)
                  : UNKNOWN}
              </TableCell>
              <TableCell colSpan={4} className="text-xs text-muted-foreground">
                Pondération sur les opportunités ouvertes
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </Card>
  );
};
