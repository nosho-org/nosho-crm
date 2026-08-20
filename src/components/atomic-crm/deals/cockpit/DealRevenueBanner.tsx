import {
  AlertTriangle,
  Handshake,
  Info,
  PieChart,
  Repeat,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

import { useConfigurationContext } from "../../root/ConfigurationContext";
import { useDealCockpit } from "./DealCockpitContext";
import { formatCompactAmount, formatPercent, pluralize } from "./dealFormat";
import type { MaybeWeightedMetric, Metric } from "./dealRevenue";

/**
 * A tile shows either a number derived from the deals in the current selection,
 * or the reason it cannot show one. There is no third state, and no placeholder
 * zero standing in for "we don't know".
 */
const DealKpiCard = ({
  label,
  hint,
  icon,
  metric,
  value,
  footer,
  accent,
}: {
  label: string;
  hint: string;
  icon: ReactNode;
  metric: Metric | MaybeWeightedMetric;
  value?: string;
  footer?: ReactNode;
  accent?: string;
}) => (
  <Card className="p-4 gap-3 shadow-sm border-border/60">
    <div className="flex items-start justify-between gap-2">
      <span
        className="text-xs font-medium text-muted-foreground leading-tight inline-flex items-center gap-1"
        title={hint}
      >
        {label}
        <Info className="w-3 h-3 shrink-0 opacity-60" aria-hidden />
      </span>
      <span
        className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted/60 shrink-0"
        aria-hidden
      >
        {icon}
      </span>
    </div>

    {metric.available ? (
      <div className="flex flex-col gap-0.5">
        <span
          className={`text-2xl font-semibold tracking-tight ${accent ?? "text-foreground"}`}
        >
          {value}
        </span>
        <span className="text-xs text-muted-foreground">{footer}</span>
      </div>
    ) : (
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-muted-foreground">
          Non disponible
        </span>
        <span className="text-xs text-muted-foreground/80 leading-snug">
          {metric.reason}
        </span>
      </div>
    )}
  </Card>
);

export const DealRevenueBanner = () => {
  const { currency } = useConfigurationContext();
  const { snapshot, period, inactivityThresholdDays } = useDealCockpit();
  const amount = (value: number) => formatCompactAmount(value, currency);
  const scope =
    period.id === "all"
      ? "toutes périodes confondues"
      : `date de clôture prévue dans ${period.label.toLowerCase()}`;

  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <DealKpiCard
        label="ARR actuel (récurrent)"
        hint="Le revenu récurrent en cours ne peut pas être calculé : le CRM suit des opportunités, pas des contrats."
        icon={<Repeat className="w-4 h-4 text-muted-foreground" />}
        metric={snapshot.recurring}
      />

      <DealKpiCard
        label="Signé"
        hint={`Somme des montants des opportunités gagnées — ${scope}.`}
        icon={<Handshake className="w-4 h-4 text-[var(--nosho-green-dark)]" />}
        metric={snapshot.signed}
        value={amount(snapshot.signed.amount)}
        accent="text-[var(--nosho-green-dark)]"
        footer={pluralize(
          snapshot.signed.count,
          "opportunité gagnée",
          "opportunités gagnées",
        )}
      />

      <DealKpiCard
        label="Potentiel"
        hint={`Somme des montants des opportunités encore ouvertes — ${scope}.`}
        icon={
          <TrendingUp className="w-4 h-4 text-[var(--deal-series-potential)]" />
        }
        metric={snapshot.potential}
        value={amount(snapshot.potential.amount)}
        footer={pluralize(
          snapshot.potential.count,
          "opportunité ouverte",
          "opportunités ouvertes",
        )}
      />

      <DealKpiCard
        label="Potentiel pondéré"
        hint="Montant des opportunités ouvertes multiplié par leur probabilité de gain. La priorité commerciale n'entre pas dans ce calcul."
        icon={
          <PieChart className="w-4 h-4 text-[var(--deal-series-weighted)]" />
        }
        metric={snapshot.weighted}
        value={
          snapshot.weighted.available
            ? amount(snapshot.weighted.amount)
            : undefined
        }
        footer={
          snapshot.weighted.available ? (
            <>
              Probabilité moyenne :{" "}
              {formatPercent(snapshot.weighted.averageProbability)}
              {snapshot.weighted.unweightedCount > 0 && (
                <>
                  {" · "}
                  <span className="text-[var(--deal-status-serious)]">
                    {pluralize(
                      snapshot.weighted.unweightedCount,
                      "opportunité sans probabilité",
                      "opportunités sans probabilité",
                    )}
                  </span>
                </>
              )}
            </>
          ) : undefined
        }
      />

      <DealKpiCard
        label="À risque"
        hint={`Opportunités ouvertes sans activité depuis au moins ${inactivityThresholdDays} jours, ou dont la date de clôture prévue est dépassée.`}
        icon={
          <AlertTriangle className="w-4 h-4 text-[var(--deal-status-serious)]" />
        }
        metric={snapshot.atRisk}
        value={amount(snapshot.atRisk.amount)}
        accent="text-[var(--deal-status-serious)]"
        footer={pluralize(
          snapshot.atRisk.count,
          "opportunité concernée",
          "opportunités concernées",
        )}
      />

      <DealKpiCard
        label="Perdu"
        hint={`Somme des montants des opportunités perdues ou déclinées — ${scope}. Il ne s'agit pas du churn : le CRM ne suit pas les contrats en cours.`}
        icon={
          <TrendingDown className="w-4 h-4 text-[var(--deal-status-critical)]" />
        }
        metric={snapshot.lost}
        value={amount(snapshot.lost.amount)}
        accent="text-[var(--deal-status-critical)]"
        footer={pluralize(
          snapshot.lost.count,
          "opportunité perdue",
          "opportunités perdues",
        )}
      />
    </div>
  );
};
