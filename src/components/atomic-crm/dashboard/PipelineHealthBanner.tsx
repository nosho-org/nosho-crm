import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  Moon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { formatCurrencyCompact } from "../misc/formatCurrency";
import { toDealsLink } from "../deals/dealFilterContract";
import { useDashboard } from "./DashboardContext";
import {
  computeHealthAlerts,
  countHealthAlerts,
  type HealthAlert,
  type HealthSeverity,
} from "./dashboardHealth";

/**
 * ---------------------------------------------------------------------------
 * Santé du pipeline (NOS-955 §5 and §6)
 * ---------------------------------------------------------------------------
 * "Ce bandeau n'est pas un nouveau dashboard de KPI. Il doit uniquement
 * signaler les anomalies qui nécessitent une action commerciale."
 *
 * Two rules the spec is emphatic about:
 *   * the "Voir" button expands nothing here — it navigates to Opportunités
 *     with the matching filter already applied;
 *   * the alerts react to the four global filters, so a selection narrows the
 *     anomalies too. That falls out of reading `deals` from the context.
 */

const SEVERITY_STYLE: Record<
  HealthSeverity,
  { color: string; icon: typeof Clock }
> = {
  critical: { color: "var(--deal-status-critical)", icon: Clock },
  attention: { color: "var(--deal-status-serious)", icon: Moon },
  anomaly: { color: "var(--deal-status-warning)", icon: HelpCircle },
};

const AlertCard = ({ alert }: { alert: HealthAlert }) => {
  const { selectionFilter } = useDashboard();
  const { color, icon: Icon } = SEVERITY_STYLE[alert.severity];

  return (
    <div className="flex items-center gap-3 min-w-0 flex-1">
      <span
        className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center"
        style={{ background: `color-mix(in oklch, ${color} 15%, transparent)` }}
        aria-hidden
      >
        <Icon className="w-4 h-4" style={{ color }} />
      </span>

      <span className="min-w-0 flex-1">
        <span
          className="block text-sm font-medium truncate"
          title={alert.title}
        >
          {alert.title}
        </span>
        <span className="block text-xs text-muted-foreground truncate">
          {alert.criterion} · {formatCurrencyCompact(alert.amount)} concernés
        </span>
      </span>

      <Button asChild size="sm" variant="outline" className="shrink-0">
        <Link
          to={toDealsLink({
            // The whole dashboard selection, period bounds included, narrowed by
            // the alert's own criterion — the spec's "Paris / Imagerie / Agent
            // entrant / Thomas" example. Dropping the period here would open a
            // list of 17 from an alert that counted 7.
            ...selectionFilter,
            ...alert.filter,
          })}
          style={{ color }}
        >
          Voir
        </Link>
      </Button>
    </div>
  );
};

export const PipelineHealthBanner = () => {
  const {
    deals,
    weighting,
    inactivityThresholdDays,
    nextActionOptions,
    today,
  } = useDashboard();

  const options = {
    pipelineStatuses: weighting.pipelineStatuses,
    inactivityThresholdDays,
    nextActionOptions,
    today,
  };

  const alerts = computeHealthAlerts(deals, options);
  const total = countHealthAlerts(deals, options);

  if (alerts.length === 0) {
    return (
      <Card className="p-4 flex items-center gap-3">
        <CheckCircle2
          className="w-5 h-5 shrink-0"
          style={{ color: "var(--deal-status-won)" }}
          aria-hidden
        />
        <span className="text-sm">
          Aucun point d'attention sur cette sélection.
        </span>
      </Card>
    );
  }

  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <AlertTriangle
          className="w-4 h-4 shrink-0"
          style={{ color: "var(--deal-status-serious)" }}
          aria-hidden
        />
        <h2 className="text-sm font-semibold">Santé du pipeline</h2>
        <span className="text-xs text-muted-foreground">
          {total} point{total > 1 ? "s" : ""} d'attention
          {/* Never truncate in silence: showing three of four would read as
              "there are only three problems". */}
          {total > alerts.length &&
            ` · ${alerts.length} affiché${alerts.length > 1 ? "s" : ""}`}
        </span>
      </div>

      <ul className="flex flex-col lg:flex-row gap-4 lg:gap-6">
        {alerts.map((alert) => (
          <li key={alert.id} className="flex min-w-0 flex-1">
            <AlertCard alert={alert} />
          </li>
        ))}
      </ul>
    </Card>
  );
};
