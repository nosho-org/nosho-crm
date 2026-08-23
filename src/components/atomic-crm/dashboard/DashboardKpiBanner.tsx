import {
  Flag,
  PieChart,
  Target,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";

import { formatCurrency, formatCurrencyCompact } from "../misc/formatCurrency";
import { computeRevenueSnapshot } from "../deals/cockpit/dealRevenue";
import { formatPercent } from "../deals/cockpit/dealFormat";
import { pluralize } from "../deals/cockpit/dealFormat";
import { useDashboard } from "./DashboardContext";
import { computeMrrProgress } from "./dashboardKpi";

/**
 * ---------------------------------------------------------------------------
 * The KPI banner (NOS-955 §1)
 * ---------------------------------------------------------------------------
 * Four ARR figures plus the MRR target. All four come from
 * `computeRevenueSnapshot` — `signed`, `potential`, `weighted` and `lost` map
 * one-to-one onto the spec, so there is no second aggregation here.
 *
 * Colour carries a fixed meaning across the whole interface: green = won,
 * blue = potential, violet = weighted, red = lost, orange = attention. The
 * tokens live in `src/index.css`; nothing here hardcodes a hue.
 *
 * A figure that cannot be derived renders its reason, never `0 €`.
 */

const KpiCard = ({
  label,
  icon: Icon,
  color,
  value,
  context,
  children,
}: {
  label: string;
  icon: LucideIcon;
  color: string;
  value: string;
  context?: string;
  children?: React.ReactNode;
}) => (
  <Card className="p-4 flex flex-col gap-1 min-w-0">
    <div className="flex items-start justify-between gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <Icon className="w-4 h-4 shrink-0" style={{ color }} aria-hidden />
    </div>
    <span
      className="text-3xl font-semibold leading-tight truncate"
      style={{ color }}
      title={value}
    >
      {value}
    </span>
    {context && (
      <span className="text-xs text-muted-foreground">{context}</span>
    )}
    {children}
  </Card>
);

export const DashboardKpiBanner = () => {
  const {
    deals,
    weighting,
    inactivityThresholdDays,
    today,
    mrrTarget,
    truncated,
  } = useDashboard();

  const snapshot = computeRevenueSnapshot(deals, {
    weighting,
    inactivityThresholdDays,
    today,
  });
  const mrr = computeMrrProgress(deals, mrrTarget);

  const won = "var(--deal-status-won)";
  const potential = "var(--deal-series-potential)";
  const weighted = "var(--deal-series-weighted)";
  const lost = "var(--deal-status-lost)";

  return (
    <section aria-label="Indicateurs clés" className="flex flex-col gap-2">
      {truncated && (
        <p className="text-xs text-[var(--deal-status-warning)]">
          {/* A total computed on a truncated page is not the total. */}
          {truncated.loaded} opportunités chargées sur {truncated.total} — les
          montants ci-dessous ne couvrent pas la totalité de la sélection.
        </p>
      )}

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label="ARR signé (won)"
          icon={Trophy}
          color={won}
          value={formatCurrencyCompact(snapshot.signed.amount)}
          context={`${pluralize(snapshot.signed.count, "opportunité gagnée", "opportunités gagnées")}`}
        >
          <span className="text-xs text-muted-foreground mt-1">
            {mrr.label}{" "}
            <span className="font-medium text-foreground">
              {formatCurrencyCompact(mrr.signedMrr)} / mois
            </span>
          </span>
        </KpiCard>

        <KpiCard
          label="Pipeline brut (potentiel)"
          icon={TrendingUp}
          color={potential}
          value={formatCurrencyCompact(snapshot.potential.amount)}
          context={`${pluralize(snapshot.potential.count, "opportunité ouverte", "opportunités ouvertes")}`}
        />

        <KpiCard
          label="Pipeline pondéré"
          icon={PieChart}
          color={weighted}
          value={
            snapshot.weighted.available
              ? formatCurrencyCompact(snapshot.weighted.amount)
              : "—"
          }
          context={
            snapshot.weighted.available
              ? `${formatPercent(snapshot.weighted.averageProbability)} de probabilité moyenne`
              : snapshot.weighted.reason
          }
        />

        <KpiCard
          label="ARR perdu (lost)"
          icon={Flag}
          color={lost}
          value={formatCurrencyCompact(snapshot.lost.amount)}
          context={`${pluralize(snapshot.lost.count, "opportunité perdue", "opportunités perdues")}`}
        />

        <Card className="p-4 flex flex-col gap-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Objectif MRR
            </span>
            <Target
              className="w-4 h-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
          </div>

          {mrr.progress === null ? (
            <>
              <span className="text-3xl font-semibold leading-tight">—</span>
              <span className="text-xs text-muted-foreground">
                Aucun objectif défini — à renseigner dans Paramètres.
              </span>
            </>
          ) : (
            <>
              <span className="text-3xl font-semibold leading-tight truncate">
                {formatCurrencyCompact(mrr.target)}
                <span className="text-base font-normal text-muted-foreground">
                  {" "}
                  / mois
                </span>
              </span>
              <div className="flex items-center gap-2 mt-1">
                <div
                  className="flex-1 bg-muted overflow-hidden"
                  style={{
                    height: "var(--skin-bar-height)",
                    borderRadius: "var(--skin-bar-radius)",
                  }}
                  role="progressbar"
                  aria-valuenow={Math.round(mrr.progress * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Progression vers l'objectif MRR"
                >
                  <div
                    className="h-full"
                    style={{
                      // The bar is capped at 100 %; the figure next to it is not.
                      width: `${Math.min(mrr.progress, 1) * 100}%`,
                      background: won,
                      borderRadius: "var(--skin-bar-radius)",
                    }}
                  />
                </div>
                <span className="text-xs font-medium tabular-nums">
                  {Math.round(mrr.progress * 100)} %
                </span>
              </div>
              <span
                className="text-xs text-muted-foreground"
                title={mrr.caveat}
              >
                Écart : {mrr.gap !== null && mrr.gap > 0 ? "+" : ""}
                {formatCurrency(Math.abs(mrr.gap ?? 0))} / mois
              </span>
            </>
          )}
        </Card>
      </div>
    </section>
  );
};
