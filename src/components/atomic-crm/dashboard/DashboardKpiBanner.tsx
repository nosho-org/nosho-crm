import {
  FileText,
  FlaskConical,
  PieChart,
  Target,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { MagicCard, NumberTicker } from "@/components/ui/motion";

import { formatCurrencyCompact } from "../misc/formatCurrency";
import { computeRevenueSnapshot } from "../deals/cockpit/dealRevenue";
import {
  computeStageBreakdown,
  type DealStageBucket,
} from "../deals/cockpit/dealStageBreakdown";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { formatPercent } from "../deals/cockpit/dealFormat";
import { pluralize } from "../deals/cockpit/dealFormat";
import { useDashboard } from "./DashboardContext";

/**
 * ---------------------------------------------------------------------------
 * The KPI banner (NOS-955 §1, revu par NOS-1065 puis NOS-1082)
 * ---------------------------------------------------------------------------
 * Six cartes, dans l'ordre où une affaire avance :
 *
 *     Pipeline brut → pondéré → Qualifié → Démo/POC → Proposition → signé
 *
 * Trois viennent de `computeRevenueSnapshot`, trois de `computeStageBreakdown`,
 * la même ventilation que le funnel juste en dessous — jamais un second calcul
 * maison, sous peine de deux chiffres pour la même étape sur un même écran.
 *
 * La grille descend en trois colonnes avant d'en montrer six : six cartes sur
 * un écran moyen donnent des montants illisibles, et deux rangées de trois se
 * lisent mieux qu'une rangée écrasée.
 *
 * « ARR perdu » et « Objectif MRR » ont été retirés à la demande de Simon. Le
 * second était le seul indicateur comparé à une cible ; `computeMrrProgress`
 * reste dans `dashboardKpi.ts`, sans appelant, pour le jour où on le remet.
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
  tickerValue,
  context,
  children,
}: {
  label: string;
  icon: LucideIcon;
  color: string;
  value: string;
  /**
   * Le montant brut, pour le compteur qui monte (NOS-1170).
   *
   * L'audit : « À réserver au **chiffre héros, une seule fois par écran** ».
   * Une seule carte le passe — le pipeline pondéré, la seule métrique
   * prédictive du bandeau. Sur six cartes qui comptent toutes ensemble,
   * l'effet ne dirait plus lequel regarder.
   */
  tickerValue?: number;
  context?: string;
  children?: React.ReactNode;
}) => (
  /*
   * `MagicCard` : le halo suit le curseur au survol (NOS-1170).
   *
   * L'audit le place ici précisément : « Utile sur une grille dense où la
   * bordure coûte cher visuellement. » Six cartes côte à côte, où épaissir une
   * bordure au survol ferait sauter la mise en page d'un pixel — et six fois
   * plus depuis que la bande est collante.
   */
  <MagicCard className="rounded-xl">
    <Card className="p-4 flex flex-col gap-1 min-w-0 bg-transparent">
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
        {tickerValue != null ? (
          <NumberTicker
            value={tickerValue}
            format={(current) => formatCurrencyCompact(current)}
          />
        ) : (
          value
        )}
      </span>
      {context && (
        <span className="text-xs text-muted-foreground">{context}</span>
      )}
      {children}
    </Card>
  </MagicCard>
);

/**
 * L'ARR d'une étape précise (NOS-1065).
 *
 * Lit la même ventilation que `PipelineFunnel`, pas un second calcul : deux
 * agrégations sur le même écran finissent toujours par afficher deux chiffres
 * pour la même étape.
 *
 * Couleur neutre, à dessein. La règle du bandeau est qu'une teinte porte un
 * sens — vert gagné, bleu potentiel, violet pondéré, rouge perdu. Ces trois
 * cartes ne sont pas une catégorie de plus : elles détaillent le pipeline brut
 * affiché à gauche. Leur emprunter une teinte déjà prise dirait autre chose que
 * ce qu'elles montrent.
 */
const StageKpiCard = ({
  stage,
  icon,
  buckets,
}: {
  stage: string;
  icon: LucideIcon;
  buckets: DealStageBucket[];
}) => {
  const bucket = buckets.find((entry) => entry.stage === stage);
  if (!bucket) return null;

  return (
    <KpiCard
      label={`ARR en ${bucket.label}`}
      icon={icon}
      color="var(--muted-foreground)"
      value={formatCurrencyCompact(bucket.amount)}
      context={
        bucket.hasUnvaluedDeals
          ? `${pluralize(bucket.count, "opportunité", "opportunités")} — montant manquant sur certaines`
          : `${pluralize(bucket.count, "opportunité", "opportunités")}`
      }
    />
  );
};

export const DashboardKpiBanner = () => {
  const { deals, weighting, inactivityThresholdDays, today, truncated } =
    useDashboard();
  const { dealStages } = useConfigurationContext();

  const snapshot = computeRevenueSnapshot(deals, {
    weighting,
    inactivityThresholdDays,
    today,
  });

  // `includeEmpty` : une étape sans affaire doit afficher 0 €, pas disparaître.
  // Une carte qui s'évapore laisse croire à un problème d'affichage plutôt qu'à
  // un pipeline vide — et fait bouger les quatre autres.
  const buckets = computeStageBreakdown(
    deals,
    dealStages,
    weighting.pipelineStatuses,
    { openOnly: true, includeEmpty: true },
  );

  const won = "var(--deal-status-won)";
  const potential = "var(--deal-series-potential)";
  const weighted = "var(--deal-series-weighted)";

  return (
    <section aria-label="Indicateurs clés" className="flex flex-col gap-2">
      {truncated && (
        <p className="text-xs text-[var(--deal-status-warning)]">
          {/* A total computed on a truncated page is not the total. */}
          {truncated.loaded} opportunités chargées sur {truncated.total} — les
          montants ci-dessous ne couvrent pas la totalité de la sélection.
        </p>
      )}

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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
          /* Le seul compteur qui monte de l'ecran : la seule metrique
             predictive du bandeau. */
          tickerValue={
            snapshot.weighted.available ? snapshot.weighted.amount : undefined
          }
        />

        <StageKpiCard stage="qualified" icon={Target} buckets={buckets} />
        <StageKpiCard stage="demo-poc" icon={FlaskConical} buckets={buckets} />
        <StageKpiCard stage="proposal" icon={FileText} buckets={buckets} />

        <KpiCard
          label="ARR signé (won)"
          icon={Trophy}
          color={won}
          value={formatCurrencyCompact(snapshot.signed.amount)}
          context={`${pluralize(snapshot.signed.count, "opportunité gagnée", "opportunités gagnées")}`}
        />
      </div>
    </section>
  );
};
