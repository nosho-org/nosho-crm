import { Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { useConfigurationContext } from "../../root/ConfigurationContext";
import { useDealCockpit } from "./DealCockpitContext";
import { UNKNOWN, formatAmount, formatPercent, pluralize } from "./dealFormat";
import type { ForecastCell } from "./dealRevenue";

/**
 * One bar per cell, anchored at the row baseline and scaled against the largest
 * potential amount in the row set — so the weighted row is directly comparable
 * to the potential row. The amount is always printed next to the bar, which is
 * also what keeps the fills readable at their light-mode contrast.
 */
const MagnitudeBar = ({
  value,
  max,
  color,
}: {
  value: number | null;
  max: number;
  color: string;
}) => {
  if (value === null || max <= 0) return null;
  const width = Math.max((value / max) * 100, value > 0 ? 2 : 0);
  return (
    <span
      className="block h-1.5 rounded-full mt-1"
      style={{ width: `${width}%`, backgroundColor: color }}
      aria-hidden
    />
  );
};

const AmountCell = ({
  amount,
  max,
  color,
  currency,
  suffix,
}: {
  amount: number | null;
  max: number;
  color: string;
  currency: string;
  suffix?: React.ReactNode;
}) => (
  <TableCell className="align-top">
    <span className="text-sm tabular-nums">
      {amount === null ? UNKNOWN : formatAmount(amount, currency)}
    </span>
    {suffix}
    <MagnitudeBar value={amount} max={max} color={color} />
  </TableCell>
);

export const DealForecastTable = () => {
  const { currency } = useConfigurationContext();
  const { forecast, granularity, setGranularity, period } = useDealCockpit();
  const { columns, total } = forecast;

  const max = Math.max(...columns.map((column) => column.potential), 0);
  const cells: (ForecastCell & { key: string })[] = [
    ...columns,
    { ...total, key: "__total__" },
  ];

  return (
    <Card className="p-4 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col">
          <h3 className="text-sm font-semibold">
            Prévision des revenus{" "}
            <span className="font-normal text-muted-foreground">
              (basée sur la date de clôture prévue)
            </span>
          </h3>
          <span className="text-xs text-muted-foreground">
            Opportunités ouvertes uniquement — les affaires gagnées et perdues
            sont des résultats, pas des prévisions.
          </span>
        </div>
        <ToggleGroup
          type="single"
          size="sm"
          value={granularity}
          onValueChange={(value) =>
            value && setGranularity(value as typeof granularity)
          }
          aria-label="Granularité de la prévision"
        >
          <ToggleGroupItem value="month">Mensuel</ToggleGroupItem>
          <ToggleGroupItem value="quarter">Trimestriel</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-56">Montant</TableHead>
              {columns.map((column) => (
                <TableHead key={column.key}>{column.label}</TableHead>
              ))}
              <TableHead className="font-semibold text-foreground">
                Total{period.id === "all" ? " affiché" : ` ${period.label}`}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium align-top">
                <span className="inline-flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: "var(--deal-series-potential)" }}
                    aria-hidden
                  />
                  Montant potentiel
                </span>
              </TableCell>
              {cells.map((cell) => (
                <AmountCell
                  key={cell.key}
                  amount={cell.potential}
                  max={max}
                  color="var(--deal-series-potential)"
                  currency={currency}
                  suffix={
                    <span className="block text-xs text-muted-foreground">
                      {pluralize(cell.count, "opportunité", "opportunités")}
                    </span>
                  }
                />
              ))}
            </TableRow>

            <TableRow>
              <TableCell className="font-medium align-top">
                <span className="inline-flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: "var(--deal-series-weighted)" }}
                    aria-hidden
                  />
                  Montant pondéré
                </span>
              </TableCell>
              {cells.map((cell) => (
                <AmountCell
                  key={cell.key}
                  amount={cell.weighted}
                  max={max}
                  color="var(--deal-series-weighted)"
                  currency={currency}
                  suffix={
                    cell.unweightedCount > 0 ? (
                      <span className="block text-xs text-[var(--deal-status-serious)]">
                        {pluralize(cell.unweightedCount, "sans probabilité")}
                      </span>
                    ) : null
                  }
                />
              ))}
            </TableRow>

            <TableRow>
              <TableCell className="font-medium align-top text-muted-foreground">
                Probabilité moyenne appliquée
              </TableCell>
              {cells.map((cell) => (
                <TableCell
                  key={cell.key}
                  className="align-top text-sm tabular-nums text-muted-foreground"
                >
                  {formatPercent(cell.averageProbability)}
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {(forecast.undated.count > 0 || forecast.outOfRange.count > 0) && (
        <p className="text-xs text-muted-foreground inline-flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
          <span>
            Non projeté :{" "}
            {forecast.undated.count > 0 && (
              <>
                {pluralize(
                  forecast.undated.count,
                  "opportunité sans date de clôture prévue",
                  "opportunités sans date de clôture prévue",
                )}{" "}
                ({formatAmount(forecast.undated.amount, currency)})
              </>
            )}
            {forecast.undated.count > 0 &&
              forecast.outOfRange.count > 0 &&
              " · "}
            {forecast.outOfRange.count > 0 && (
              <>
                {pluralize(
                  forecast.outOfRange.count,
                  "opportunité hors de la plage affichée",
                  "opportunités hors de la plage affichée",
                )}{" "}
                ({formatAmount(forecast.outOfRange.amount, currency)})
              </>
            )}
            .
          </span>
        </p>
      )}
    </Card>
  );
};
