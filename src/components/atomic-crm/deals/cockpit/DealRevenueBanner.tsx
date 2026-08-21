import {
  AlertTriangle,
  Handshake,
  Info,
  Moon,
  PieChart,
  Repeat,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { Card } from "@/components/ui/card";

import { useConfigurationContext } from "../../root/ConfigurationContext";
import { useCrmSkin } from "../../root/skins";
import { useDealCockpit } from "./DealCockpitContext";
import { getDormantDeals, sumDormantAmounts } from "./dealDormant";
import { formatCompactAmount, formatPercent, pluralize } from "./dealFormat";

/**
 * One figure the banner can show — or the reason it cannot show one. There is
 * no third state, and no placeholder zero standing in for "we don't know":
 * `value` and `unavailable` are mutually exclusive.
 */
interface MetricTile {
  key: string;
  label: string;
  hint: string;
  icon: ReactNode;
  value?: string;
  unavailable?: string;
  footer?: ReactNode;
  /** Tailwind text-colour class applied to the figure itself. */
  accent?: string;
}

/** Two related figures under one heading — how the grouped skins read. */
interface MetricGroup {
  key: string;
  label: string;
  /** Colour of the group's marker; the group's own semantic, not a decoration. */
  accent: string;
  tiles: [MetricTile, MetricTile];
  /** A third fact too small for a tile of its own. */
  note?: string;
}

const useMetricTiles = () => {
  const { currency } = useConfigurationContext();
  const { snapshot, period, inactivityThresholdDays, deals, activityOptions } =
    useDealCockpit();
  const amount = (value: number) => formatCompactAmount(value, currency);
  const scope =
    period.id === "all"
      ? "toutes périodes confondues"
      : `date de clôture prévue dans ${period.label.toLowerCase()}`;

  const dormant = useMemo(
    () => getDormantDeals(deals, activityOptions),
    [deals, activityOptions],
  );

  const recurring: MetricTile = {
    key: "recurring",
    label: "ARR actuel (récurrent)",
    hint: "Le revenu récurrent en cours ne peut pas être calculé : le CRM suit des opportunités, pas des contrats.",
    icon: <Repeat className="w-4 h-4 text-muted-foreground" />,
    unavailable: snapshot.recurring.available
      ? undefined
      : snapshot.recurring.reason,
  };

  const signed: MetricTile = {
    key: "signed",
    label: "Signé",
    hint: `Somme des montants des opportunités gagnées — ${scope}.`,
    icon: <Handshake className="w-4 h-4 text-[var(--nosho-green-dark)]" />,
    value: amount(snapshot.signed.amount),
    accent: "text-[var(--nosho-green-dark)]",
    footer: pluralize(
      snapshot.signed.count,
      "opportunité gagnée",
      "opportunités gagnées",
    ),
  };

  const potential: MetricTile = {
    key: "potential",
    label: "Potentiel",
    hint: `Somme des montants des opportunités encore ouvertes — ${scope}.`,
    icon: (
      <TrendingUp className="w-4 h-4 text-[var(--deal-series-potential)]" />
    ),
    value: amount(snapshot.potential.amount),
    footer: pluralize(
      snapshot.potential.count,
      "opportunité ouverte",
      "opportunités ouvertes",
    ),
  };

  const weighted: MetricTile = {
    key: "weighted",
    label: "Potentiel pondéré",
    hint: "Montant des opportunités ouvertes multiplié par leur probabilité de gain. La priorité commerciale n'entre pas dans ce calcul.",
    icon: <PieChart className="w-4 h-4 text-[var(--deal-series-weighted)]" />,
    value: snapshot.weighted.available
      ? amount(snapshot.weighted.amount)
      : undefined,
    unavailable: snapshot.weighted.available
      ? undefined
      : snapshot.weighted.reason,
    footer: snapshot.weighted.available ? (
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
    ) : undefined,
  };

  const atRisk: MetricTile = {
    key: "atRisk",
    label: "À risque",
    hint: `Opportunités ouvertes sans activité depuis au moins ${inactivityThresholdDays} jours, ou dont la date de clôture prévue est dépassée.`,
    icon: (
      <AlertTriangle className="w-4 h-4 text-[var(--deal-status-serious)]" />
    ),
    value: amount(snapshot.atRisk.amount),
    accent: "text-[var(--deal-status-serious)]",
    footer: pluralize(
      snapshot.atRisk.count,
      "opportunité concernée",
      "opportunités concernées",
    ),
  };

  const lost: MetricTile = {
    key: "lost",
    label: "Perdu",
    hint: `Somme des montants des opportunités perdues ou déclinées — ${scope}. Il ne s'agit pas du churn : le CRM ne suit pas les contrats en cours.`,
    icon: (
      <TrendingDown className="w-4 h-4 text-[var(--deal-status-critical)]" />
    ),
    value: amount(snapshot.lost.amount),
    /* Zero losses is not an alert: red would make an empty column shout. */
    accent:
      snapshot.lost.amount > 0
        ? "text-[var(--deal-status-critical)]"
        : "text-muted-foreground",
    footer: pluralize(
      snapshot.lost.count,
      "opportunité perdue",
      "opportunités perdues",
    ),
  };

  const dormantTile: MetricTile = {
    key: "dormant",
    label: "En sommeil",
    hint: `Opportunités ouvertes sans aucune activité depuis au moins ${inactivityThresholdDays} jours. Seuil modifiable dans Paramètres › Opportunités.`,
    icon: <Moon className="w-4 h-4 text-[var(--deal-status-warning)]" />,
    value: String(dormant.length),
    footer: `${formatCompactAmount(sumDormantAmounts(dormant), currency)} · plus de ${inactivityThresholdDays} jours sans activité`,
  };

  return { recurring, signed, potential, weighted, atRisk, lost, dormantTile };
};

type MetricTiles = ReturnType<typeof useMetricTiles>;

const buildGroups = ({
  recurring,
  signed,
  potential,
  weighted,
  atRisk,
  lost,
  dormantTile,
}: MetricTiles): MetricGroup[] => [
  {
    key: "closed",
    label: "Réalisé",
    accent: "var(--nosho-green-dark)",
    tiles: [signed, lost],
    note: recurring.unavailable
      ? `ARR récurrent : ${recurring.unavailable}`
      : undefined,
  },
  {
    key: "pipeline",
    label: "Pipeline",
    accent: "var(--deal-series-potential)",
    tiles: [potential, weighted],
  },
  {
    key: "attention",
    label: "Attention requise",
    accent: "var(--deal-status-serious)",
    tiles: [atRisk, dormantTile],
  },
];

/* -------------------------------------------------------------------------- */
/* Skin "default" — six tiles                                                  */
/* -------------------------------------------------------------------------- */

const DealKpiCard = ({ tile }: { tile: MetricTile }) => (
  <Card className="p-4 gap-3 shadow-sm border-border/60">
    <div className="flex items-start justify-between gap-2">
      <span
        className="text-xs font-medium text-muted-foreground leading-tight inline-flex items-center gap-1"
        title={tile.hint}
      >
        {tile.label}
        <Info className="w-3 h-3 shrink-0 opacity-60" aria-hidden />
      </span>
      <span
        className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted/60 shrink-0"
        aria-hidden
      >
        {tile.icon}
      </span>
    </div>

    {tile.value !== undefined ? (
      <div className="flex flex-col gap-0.5">
        <span
          className={`text-2xl font-semibold tracking-tight tabular-nums ${tile.accent ?? "text-foreground"}`}
        >
          {tile.value}
        </span>
        <span className="text-xs text-muted-foreground">{tile.footer}</span>
      </div>
    ) : (
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-muted-foreground">
          Non disponible
        </span>
        <span className="text-xs text-muted-foreground/80 leading-snug">
          {tile.unavailable}
        </span>
      </div>
    )}
  </Card>
);

/* -------------------------------------------------------------------------- */
/* Skin "dense" — one surface, three named groups, rules instead of elevation  */
/* -------------------------------------------------------------------------- */

const DenseTile = ({ tile }: { tile: MetricTile }) => (
  <div className="flex flex-col gap-1 p-4 min-w-0">
    <span
      className="text-xs font-medium text-muted-foreground inline-flex items-center gap-1"
      title={tile.hint}
    >
      {tile.label}
      <Info className="w-3 h-3 shrink-0 opacity-60" aria-hidden />
    </span>
    {tile.value !== undefined ? (
      <>
        <span
          className={`text-2xl font-semibold tracking-tight tabular-nums leading-tight ${tile.accent ?? "text-foreground"}`}
        >
          {tile.value}
        </span>
        <span className="text-xs text-muted-foreground">{tile.footer}</span>
      </>
    ) : (
      <>
        <span className="text-sm font-medium text-muted-foreground mt-1">
          Non disponible
        </span>
        <span className="text-xs text-muted-foreground/80 leading-snug">
          {tile.unavailable}
        </span>
      </>
    )}
  </div>
);

const DenseBanner = ({ groups }: { groups: MetricGroup[] }) => (
  <div className="grid grid-cols-1 lg:grid-cols-3 rounded-lg border bg-card overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-border">
    {groups.map((group) => (
      <div key={group.key} className="flex flex-col min-w-0">
        <div className="flex items-center gap-2 px-4 py-2 bg-muted/40 border-b">
          <span
            className="w-1.5 h-1.5 rounded-[2px] shrink-0"
            style={{ backgroundColor: group.accent }}
            aria-hidden
          />
          <span className="text-[0.625rem] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
            {group.label}
          </span>
        </div>
        <div className="grid grid-cols-2 divide-x divide-border/60 flex-1">
          {group.tiles.map((tile) => (
            <DenseTile key={tile.key} tile={tile} />
          ))}
        </div>
        {group.note && (
          <p className="px-4 pb-3 text-xs text-muted-foreground/80 leading-snug">
            {group.note}
          </p>
        )}
      </div>
    ))}
  </div>
);

/* -------------------------------------------------------------------------- */
/* Skin "calme" — three panels, one dominant figure each                       */
/* -------------------------------------------------------------------------- */

const CalmCompanion = ({ tile }: { tile: MetricTile }) => (
  <div className="flex items-start justify-between gap-3">
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-xs text-muted-foreground" title={tile.hint}>
        {tile.label}
      </span>
      {tile.value === undefined && (
        <span className="text-xs text-muted-foreground/80 leading-snug">
          {tile.unavailable}
        </span>
      )}
    </div>
    <span
      className={`text-sm font-medium shrink-0 tabular-nums ${
        tile.value === undefined
          ? "text-muted-foreground/80"
          : (tile.accent ?? "text-foreground")
      }`}
    >
      {tile.value ?? "Non disponible"}
    </span>
  </div>
);

const CalmBanner = ({ groups }: { groups: MetricGroup[] }) => (
  <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
    {groups.map((group) => {
      const [headline, companion] = group.tiles;
      return (
        <Card key={group.key} className="p-6 gap-5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold">{group.label}</span>
            <span
              className="flex items-center justify-center w-8 h-8 rounded-full bg-muted shrink-0"
              aria-hidden
            >
              {headline.icon}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <span
              className="text-xs text-muted-foreground"
              title={headline.hint}
            >
              {headline.label}
            </span>
            {headline.value !== undefined ? (
              <>
                <span
                  className={`text-3xl font-semibold tracking-tight tabular-nums leading-none ${headline.accent ?? "text-foreground"}`}
                >
                  {headline.value}
                </span>
                <span className="text-xs text-muted-foreground">
                  {headline.footer}
                </span>
              </>
            ) : (
              <>
                <span className="text-lg font-medium text-muted-foreground">
                  Non disponible
                </span>
                <span className="text-xs text-muted-foreground/80 leading-snug">
                  {headline.unavailable}
                </span>
              </>
            )}
          </div>

          <div className="h-px bg-border" aria-hidden />
          <CalmCompanion tile={companion} />
          {group.note && (
            <p className="text-xs text-muted-foreground/80 leading-snug">
              {group.note}
            </p>
          )}
        </Card>
      );
    })}
  </div>
);

/* -------------------------------------------------------------------------- */

export const DealRevenueBanner = () => {
  const skin = useCrmSkin();
  const tiles = useMetricTiles();

  if (skin === "dense") return <DenseBanner groups={buildGroups(tiles)} />;
  if (skin === "calme") return <CalmBanner groups={buildGroups(tiles)} />;

  const { recurring, signed, potential, weighted, atRisk, lost } = tiles;

  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {[recurring, signed, potential, weighted, atRisk, lost].map((tile) => (
        <DealKpiCard key={tile.key} tile={tile} />
      ))}
    </div>
  );
};
