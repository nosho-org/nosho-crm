import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { useRedirect } from "ra-core";
import { useMemo, useState, type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { useConfigurationContext } from "../../root/ConfigurationContext";
import { useCrmSkin } from "../../root/skins";
import { useDealCockpit } from "./DealCockpitContext";
import {
  getDormantDeals,
  sumDormantAmounts,
  type DormantDeal,
} from "./dealDormant";
import { formatAmount, formatDaysAgo, pluralize } from "./dealFormat";

const PREVIEW_COUNT = 5;

interface DormantViewProps {
  dormant: DormantDeal[];
  visible: DormantDeal[];
  expanded: boolean;
  onToggle: () => void;
  onOpen: (id: DormantDeal["deal"]["id"]) => void;
  total: string;
  thresholdDays: number;
  currency: string;
}

const ExpandLabel = ({
  expanded,
  hidden,
}: {
  expanded: boolean;
  hidden: number;
}): ReactNode =>
  expanded ? (
    <>
      <ChevronUp className="w-3.5 h-3.5" />
      Réduire
    </>
  ) : (
    <>
      <ChevronDown className="w-3.5 h-3.5" />
      Voir les {hidden} autres
    </>
  );

/* -------------------------------------------------------------------------- */
/* Skin "default" — the warning banner                                         */
/* -------------------------------------------------------------------------- */

const DefaultDormantAlert = ({
  dormant,
  visible,
  expanded,
  onToggle,
  onOpen,
  total,
  thresholdDays,
}: DormantViewProps) => (
  <Alert className="border-[var(--deal-status-warning)]/50 bg-[var(--deal-status-warning)]/5">
    <AlertTriangle className="text-[var(--deal-status-serious)]" />
    <AlertTitle>
      {pluralize(
        dormant.length,
        "opportunité en sommeil",
        "opportunités en sommeil",
      )}{" "}
      — {total}
    </AlertTitle>
    <AlertDescription className="w-full">
      <p>
        Aucune activité enregistrée depuis au moins {thresholdDays} jours. Seuil
        modifiable dans Paramètres › Opportunités.
      </p>
      <ul className="w-full mt-1 flex flex-col gap-1">
        {visible.map(({ deal, daysSinceActivity }) => (
          <li key={deal.id}>
            <button
              type="button"
              onClick={() => onOpen(deal.id)}
              className="flex w-full items-center justify-between gap-3 rounded px-1 py-0.5 text-left text-xs hover:bg-muted/60"
            >
              <span className="truncate text-foreground">{deal.name}</span>
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {formatDaysAgo(daysSinceActivity)}
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
          onClick={onToggle}
        >
          <ExpandLabel
            expanded={expanded}
            hidden={dormant.length - PREVIEW_COUNT}
          />
        </Button>
      )}
    </AlertDescription>
  </Alert>
);

/* -------------------------------------------------------------------------- */
/* Skin "dense" — a scannable table, warning carried by a single rule          */
/* -------------------------------------------------------------------------- */

const DENSE_ROW =
  "grid grid-cols-[minmax(0,1fr)_7rem_5rem] gap-4 px-4 items-center";

const DenseDormantTable = ({
  dormant,
  visible,
  expanded,
  onToggle,
  onOpen,
  total,
  thresholdDays,
  currency,
}: DormantViewProps) => (
  <div className="rounded-lg border border-l-2 border-l-[var(--deal-status-warning)] bg-card overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b">
      <div className="flex items-center gap-2.5 min-w-0">
        <AlertTriangle
          className="w-4 h-4 shrink-0 text-[var(--deal-status-serious)]"
          aria-hidden
        />
        <span className="text-sm font-semibold">
          {pluralize(
            dormant.length,
            "opportunité en sommeil",
            "opportunités en sommeil",
          )}
        </span>
        <span className="text-sm text-muted-foreground tabular-nums">
          {total}
        </span>
      </div>
      <span className="text-xs text-muted-foreground">
        Seuil : {thresholdDays} jours — modifiable dans Paramètres ›
        Opportunités.
      </span>
    </div>

    <div className={`${DENSE_ROW} py-1.5 bg-muted/40 border-b`}>
      <span className="text-[0.625rem] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
        Opportunité
      </span>
      <span className="text-[0.625rem] font-semibold uppercase tracking-[0.07em] text-muted-foreground text-right">
        Montant
      </span>
      <span className="text-[0.625rem] font-semibold uppercase tracking-[0.07em] text-muted-foreground text-right">
        Inactif
      </span>
    </div>

    <ul className="flex flex-col">
      {visible.map(({ deal, daysSinceActivity }) => (
        <li key={deal.id} className="border-b last:border-b-0 border-border/50">
          <button
            type="button"
            onClick={() => onOpen(deal.id)}
            className={`${DENSE_ROW} w-full py-2 text-left hover:bg-muted/40`}
          >
            <span className="truncate text-sm">{deal.name}</span>
            <span className="text-sm text-right tabular-nums">
              {deal.amount == null ? "—" : formatAmount(deal.amount, currency)}
            </span>
            <span className="text-xs text-right tabular-nums text-[var(--deal-status-serious)]">
              {formatDaysAgo(daysSinceActivity)}
            </span>
          </button>
        </li>
      ))}
    </ul>

    {dormant.length > PREVIEW_COUNT && (
      <div className="px-3 py-1.5 border-t bg-muted/40">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-1"
          onClick={onToggle}
        >
          <ExpandLabel
            expanded={expanded}
            hidden={dormant.length - PREVIEW_COUNT}
          />
        </Button>
      </div>
    )}
  </div>
);

/* -------------------------------------------------------------------------- */
/* Skin "calme" — a composed panel rather than a warning                       */
/* -------------------------------------------------------------------------- */

const CalmDormantPanel = ({
  dormant,
  visible,
  expanded,
  onToggle,
  onOpen,
  total,
  thresholdDays,
  currency,
}: DormantViewProps) => (
  <div className="rounded-[var(--radius-xl)] bg-[var(--deal-status-warning)]/8 p-6 flex flex-col gap-4">
    <div className="flex items-start gap-3.5">
      <span
        className="flex items-center justify-center w-9 h-9 rounded-full bg-[var(--deal-status-warning)]/20 shrink-0"
        aria-hidden
      >
        <AlertTriangle className="w-4 h-4 text-[var(--deal-status-serious)]" />
      </span>
      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-base font-semibold">
          {pluralize(
            dormant.length,
            "opportunité en sommeil",
            "opportunités en sommeil",
          )}{" "}
          — {total}
        </span>
        <span className="text-sm text-muted-foreground">
          Aucune activité depuis au moins {thresholdDays} jours. Seuil
          modifiable dans Paramètres › Opportunités.
        </span>
      </div>
    </div>

    <ul className="flex flex-col gap-1">
      {visible.map(({ deal, daysSinceActivity }) => (
        <li key={deal.id}>
          <button
            type="button"
            onClick={() => onOpen(deal.id)}
            className="flex w-full items-center justify-between gap-4 rounded-[var(--radius-md)] bg-card px-3.5 py-2.5 text-left hover:bg-card/70"
          >
            <span className="truncate text-sm">{deal.name}</span>
            <span className="flex items-center gap-4 shrink-0">
              <span className="text-sm tabular-nums">
                {deal.amount == null
                  ? "—"
                  : formatAmount(deal.amount, currency)}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground w-24 text-right">
                {formatDaysAgo(daysSinceActivity)}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>

    {dormant.length > PREVIEW_COUNT && (
      <Button
        variant="ghost"
        size="sm"
        className="self-start h-8 rounded-full px-3"
        onClick={onToggle}
      >
        <ExpandLabel
          expanded={expanded}
          hidden={dormant.length - PREVIEW_COUNT}
        />
      </Button>
    )}
  </div>
);

/* -------------------------------------------------------------------------- */

/**
 * Issue #94: surface open deals nobody has touched for a while, on the
 * Opportunités screen itself. Deliberately independent from priority — an
 * important deal can be perfectly active, and a normal one can be forgotten.
 *
 * The three skins say the same thing with different weight: a warning banner,
 * a scannable table, or a composed panel. They share one dormant set.
 */
/**
 * Le corps de l'alerte, sans le contexte cockpit (NOS-1013).
 *
 * L'alerte vivait uniquement dans `DealCockpit`, donc uniquement sur les vues
 * personnalisées `/views/:viewId` — alors que Marc-Henri l'avait demandée deux
 * fois « sur l'écran opportunité ». NOS-955 l'avait déplacée vers le dashboard
 * sans le lui dire. Séparer la lecture des données de leur rendu permet de la
 * remonter sur `/deals` sans y monter tout le cockpit.
 */
export const DormantAlert = ({
  deals,
  activityOptions,
  thresholdDays,
}: {
  deals: DormantDeal["deal"][];
  activityOptions: Parameters<typeof getDormantDeals>[1];
  thresholdDays: number;
}) => {
  const { currency } = useConfigurationContext();
  const skin = useCrmSkin();
  const redirect = useRedirect();
  const [expanded, setExpanded] = useState(false);

  const dormant = useMemo(
    () => getDormantDeals(deals, activityOptions),
    [deals, activityOptions],
  );

  if (dormant.length === 0) return null;

  const props: DormantViewProps = {
    dormant,
    visible: expanded ? dormant : dormant.slice(0, PREVIEW_COUNT),
    expanded,
    onToggle: () => setExpanded((previous) => !previous),
    onOpen: (id) =>
      redirect(`/deals/${id}/show`, undefined, undefined, undefined, {
        _scrollToTop: false,
      }),
    total: formatAmount(sumDormantAmounts(dormant), currency),
    thresholdDays,
    currency,
  };

  if (skin === "dense") return <DenseDormantTable {...props} />;
  if (skin === "calme") return <CalmDormantPanel {...props} />;
  return <DefaultDormantAlert {...props} />;
};

/** L'alerte telle que la monte le cockpit des vues personnalisées. */
export const DealInactivityAlert = () => {
  const { deals, activityOptions, inactivityThresholdDays } = useDealCockpit();
  return (
    <DormantAlert
      deals={deals}
      activityOptions={activityOptions}
      thresholdDays={inactivityThresholdDays}
    />
  );
};
