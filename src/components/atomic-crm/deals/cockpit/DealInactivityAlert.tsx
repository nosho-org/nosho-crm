import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { useRedirect } from "ra-core";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { useConfigurationContext } from "../../root/ConfigurationContext";
import { useDealCockpit } from "./DealCockpitContext";
import { getDealActivity } from "./dealFields";
import { formatAmount, formatDaysAgo, pluralize } from "./dealFormat";

const PREVIEW_COUNT = 5;

/**
 * Issue #94: surface open deals nobody has touched for a while, on the
 * Opportunités screen itself. Deliberately independent from priority — an
 * important deal can be perfectly active, and a normal one can be forgotten.
 */
export const DealInactivityAlert = () => {
  const { currency } = useConfigurationContext();
  const { deals, activityOptions, inactivityThresholdDays } = useDealCockpit();
  const redirect = useRedirect();
  const [expanded, setExpanded] = useState(false);

  const dormant = deals
    .map((deal) => ({ deal, activity: getDealActivity(deal, activityOptions) }))
    .filter(({ activity }) => activity.isStale)
    .sort(
      (a, b) =>
        (b.activity.daysSinceActivity ?? 0) -
        (a.activity.daysSinceActivity ?? 0),
    );

  if (dormant.length === 0) return null;

  const amount = dormant.reduce(
    (total, { deal }) => total + (deal.amount ?? 0),
    0,
  );
  const visible = expanded ? dormant : dormant.slice(0, PREVIEW_COUNT);

  return (
    <Alert className="border-[var(--deal-status-warning)]/50 bg-[var(--deal-status-warning)]/5">
      <AlertTriangle className="text-[var(--deal-status-serious)]" />
      <AlertTitle>
        {pluralize(
          dormant.length,
          "opportunité en sommeil",
          "opportunités en sommeil",
        )}{" "}
        — {formatAmount(amount, currency)}
      </AlertTitle>
      <AlertDescription className="w-full">
        <p>
          Aucune activité enregistrée depuis au moins {inactivityThresholdDays}{" "}
          jours. Seuil modifiable dans Paramètres › Opportunités.
        </p>
        <ul className="w-full mt-1 flex flex-col gap-1">
          {visible.map(({ deal, activity }) => (
            <li key={deal.id}>
              <button
                type="button"
                onClick={() =>
                  redirect(
                    `/deals/${deal.id}/show`,
                    undefined,
                    undefined,
                    undefined,
                    { _scrollToTop: false },
                  )
                }
                className="flex w-full items-center justify-between gap-3 rounded px-1 py-0.5 text-left text-xs hover:bg-muted/60"
              >
                <span className="truncate text-foreground">{deal.name}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {formatDaysAgo(activity.daysSinceActivity)}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {dormant.length > PREVIEW_COUNT && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 h-7 px-1"
            onClick={() => setExpanded((previous) => !previous)}
          >
            {expanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                Réduire
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                Voir les {dormant.length - PREVIEW_COUNT} autres
              </>
            )}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
};
