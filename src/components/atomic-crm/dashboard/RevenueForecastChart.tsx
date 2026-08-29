import { ResponsiveBar } from "@nivo/bar";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { formatCurrencyCompact } from "../misc/formatCurrency";
import { pluralize } from "../deals/cockpit/dealFormat";
import { computeForecast } from "../deals/cockpit/dealRevenue";
import { getPeriodBuckets } from "../deals/cockpit/dealPeriods";
import { isLostStage, isWonStage } from "../deals/cockpit/dealFields";
import { parseISODateLocal, toISODateString } from "../deals/cockpit/dealDates";
import { toDealsLink } from "../deals/dealFilterContract";
import { useDashboard } from "./DashboardContext";

/**
 * ---------------------------------------------------------------------------
 * Prévision des revenus (NOS-955 §3)
 * ---------------------------------------------------------------------------
 * Bucketed strictly by `expected_closing_date`, with a Mensuel/Trimestriel
 * switch. Four series, in the permanent colours: signed green, gross pipeline
 * blue, weighted violet, lost red — and lost is drawn negative, as in the
 * mockup, because it is revenue that left.
 *
 * The open-pipeline columns come from `computeForecast`, which already handles
 * the bucketing and reports what falls outside the range. Won and lost are
 * bucketed here: `computeForecast` deliberately excludes them (they are
 * outcomes, not forecasts) but the spec wants them on the same timeline.
 *
 * Clicking a bar opens Opportunités filtered on exactly that bucket.
 */

interface ChartDatum {
  bucket: string;
  start: string;
  end: string;
  signed: number;
  potential: number;
  weighted: number;
  lost: number;
  // nivo's BarDatum only admits string | number, so the per-series counts the
  // tooltip needs live in a lookup beside the data rather than inside it.
  [key: string]: string | number;
}

type SeriesKey = "signed" | "potential" | "weighted" | "lost";

type BucketCounts = Record<SeriesKey, number>;

export const RevenueForecastChart = () => {
  const {
    deals,
    period,
    granularity,
    setGranularity,
    weighting,
    today,
    selectionFilter,
  } = useDashboard();
  const navigate = useNavigate();

  const buckets = getPeriodBuckets(period, granularity, today);
  const forecast = computeForecast(deals, buckets, { weighting });

  const countsByBucket = new Map<string, BucketCounts>();

  // Libellé complet → libellé d'axe. Voir `axisBottom` plus bas.
  const shortLabels = new Map(
    buckets.map((bucket) => [bucket.label, bucket.shortLabel]),
  );

  const data: ChartDatum[] = buckets.map((bucket, index) => {
    const column = forecast.columns[index];

    const inBucket = deals.filter((deal) => {
      const closing = parseISODateLocal(deal.expected_closing_date);
      return (
        closing !== null && closing >= bucket.start && closing <= bucket.end
      );
    });
    const won = inBucket.filter((deal) => isWonStage(deal.stage));
    const lost = inBucket.filter((deal) =>
      isLostStage(deal.stage, weighting.pipelineStatuses),
    );
    const sum = (list: typeof deals) =>
      list.reduce((total, deal) => total + (deal.amount ?? 0), 0);

    countsByBucket.set(bucket.label, {
      signed: won.length,
      potential: column?.count ?? 0,
      weighted: (column?.count ?? 0) - (column?.unweightedCount ?? 0),
      lost: lost.length,
    });

    return {
      bucket: bucket.label,
      // Local calendar fields, not UTC: `toISOString()` would shift the bucket
      // bounds a day for anyone east of Greenwich, and these become the filter
      // the click-through applies.
      start: toISODateString(bucket.start),
      end: toISODateString(bucket.end),
      signed: sum(won),
      potential: column?.potential ?? 0,
      weighted: column?.weighted ?? 0,
      // Negative so the series reads below the axis.
      lost: -sum(lost),
    };
  });

  const values = data.flatMap((d) => [
    Number(d.signed),
    Number(d.potential),
    Number(d.weighted),
    Number(d.lost),
  ]);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);

  const goToBucket = (datum: ChartDatum) =>
    navigate(
      toDealsLink({
        ...selectionFilter,
        // The bar's own bucket replaces the dashboard period: clicking "Oct 26"
        // must open October, not the whole quarter it belongs to.
        periodStart: String(datum.start),
        periodEnd: String(datum.end),
      }),
    );

  return (
    <Card className="p-4 flex flex-col gap-3 min-w-0">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-semibold">Prévision des revenus</h2>
        <div
          className="flex items-center gap-1"
          role="group"
          aria-label="Granularité"
        >
          {(["month", "quarter"] as const).map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={granularity === value ? "default" : "outline"}
              aria-pressed={granularity === value}
              onClick={() => setGranularity(value)}
            >
              {value === "month" ? "Mensuel" : "Trimestriel"}
            </Button>
          ))}
        </div>
      </div>

      <ul className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
        {[
          ["Signé", "var(--deal-status-won)"],
          ["Pipeline brut", "var(--deal-series-potential)"],
          ["Pondéré", "var(--deal-series-weighted)"],
          ["Perdu", "var(--deal-status-lost)"],
        ].map(([label, color]) => (
          <li key={label} className="inline-flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: color }}
              aria-hidden
            />
            {label}
          </li>
        ))}
      </ul>

      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">
          Aucune échéance sur cette période.
        </p>
      ) : (
        <div className="h-[320px]">
          <ResponsiveBar
            data={data}
            indexBy="bucket"
            keys={["signed", "potential", "weighted", "lost"]}
            groupMode="grouped"
            colors={[
              "var(--deal-status-won)",
              "var(--deal-series-potential)",
              "var(--deal-series-weighted)",
              "var(--deal-status-lost)",
            ]}
            margin={{ top: 10, right: 10, bottom: 40, left: 60 }}
            padding={0.25}
            innerPadding={2}
            borderRadius={3}
            valueScale={{
              type: "linear",
              min: min < 0 ? min * 1.15 : 0,
              max: max > 0 ? max * 1.15 : 1000,
            }}
            enableGridX={false}
            enableGridY
            enableLabel={false}
            // Off on purpose. The four global filters rescale the axis on every
            // change, and nivo's transition leaves the outgoing tick labels
            // painted under the incoming ones — two overlapping scales, which
            // on a reporting chart reads as two different numbers.
            animate={false}
            onClick={(bar) => goToBucket(bar.data as unknown as ChartDatum)}
            axisLeft={{
              tickSize: 0,
              tickPadding: 8,
              format: (value: number) => formatCurrencyCompact(Math.abs(value)),
            }}
            /*
             * L'axe écrit « Août », le survol écrit « Août 2026 » (NOS-1176).
             *
             * L'index des barres reste le libellé complet : c'est lui qui sert
             * de clé au relevé des effectifs et à l'infobulle. Seul l'affichage
             * de l'axe est raccourci, par correspondance — de sorte que
             * raccourcir l'axe ne puisse pas désaligner les données.
             */
            axisBottom={{
              tickSize: 0,
              tickPadding: 8,
              format: (value: string) => shortLabels.get(value) ?? value,
            }}
            theme={{
              text: { fill: "var(--color-muted-foreground)" },
              axis: {
                ticks: { text: { fill: "var(--color-muted-foreground)" } },
              },
              grid: { line: { stroke: "var(--color-border)" } },
            }}
            tooltip={({ id, value, indexValue }) => {
              const count =
                countsByBucket.get(String(indexValue))?.[id as SeriesKey] ?? 0;
              return (
                <div className="px-2 py-1.5 bg-popover text-popover-foreground rounded shadow text-xs">
                  <strong>{indexValue}</strong>
                  <div className="mt-0.5">
                    {formatCurrencyCompact(Math.abs(value))} ·{" "}
                    {pluralize(count, "opportunité", "opportunités")}
                  </div>
                </div>
              );
            }}
          />
        </div>
      )}

      {(forecast.undated.count > 0 || forecast.outOfRange.count > 0) && (
        <p className="text-xs text-muted-foreground">
          {/* The columns must never look like the whole story. */}
          {forecast.undated.count > 0 && (
            <>
              {pluralize(
                forecast.undated.count,
                "opportunité ouverte sans date de clôture",
                "opportunités ouvertes sans date de clôture",
              )}{" "}
              ({formatCurrencyCompact(forecast.undated.amount)}) hors graphique.
            </>
          )}
          {forecast.outOfRange.count > 0 && (
            <>
              {" "}
              {forecast.outOfRange.count} hors de la période affichée (
              {formatCurrencyCompact(forecast.outOfRange.amount)}).
            </>
          )}
        </p>
      )}
    </Card>
  );
};
