import {
  FileText,
  FlaskConical,
  PieChart,
  Target,
  TrendingUp,
  Trophy,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { useGetList } from "ra-core";
import { Card } from "@/components/ui/card";
import { MagicCard, NumberTicker } from "@/components/ui/motion";

import { formatCurrencyCompact } from "../misc/formatCurrency";
import type { Deal } from "../types";
import { computeRevenueSnapshot } from "../deals/cockpit/dealRevenue";
import {
  computeStageBreakdown,
  type DealStageBucket,
} from "../deals/cockpit/dealStageBreakdown";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { formatPercent } from "../deals/cockpit/dealFormat";
import { pluralize } from "../deals/cockpit/dealFormat";
import { useDashboard } from "./DashboardContext";
import { computeNewLeadsTrend, describeLeadsTrend } from "./newLeads";

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
  contextClassName,
  children,
}: {
  label: string;
  icon: LucideIcon;
  color: string;
  value: string;
  /**
   * Le montant brut, pour le compteur qui monte (NOS-1177).
   *
   * L'audit : « À réserver au **chiffre héros, une seule fois par écran** ».
   * Une seule carte le passe — le pipeline pondéré, la seule métrique
   * prédictive du bandeau. Sur six cartes qui comptent toutes ensemble,
   * l'effet ne dirait plus lequel regarder.
   */
  tickerValue?: number;
  context?: string;
  /**
   * Colore la ligne de contexte seule.
   *
   * C'est la tendance qui est bonne ou mauvaise, pas le chiffre : « 12
   * nouveaux leads » n'est ni vert ni rouge, « −40 % » l'est.
   */
  contextClassName?: string;
  children?: React.ReactNode;
}) => (
  /*
   * `MagicCard` : le halo suit le curseur au survol (NOS-1177).
   *
   * L'audit le place ici précisément : « Utile sur une grille dense où la
   * bordure coûte cher visuellement. » Six cartes côte à côte, où épaissir une
   * bordure au survol ferait sauter la mise en page d'un pixel — et six fois
   * plus depuis que la bande est collante.
   */
  <MagicCard className="rounded-xl">
    <Card className="p-3 flex flex-col gap-0.5 min-w-0 bg-transparent">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} aria-hidden />
      </div>
      <span
        className="text-xl font-semibold leading-tight truncate"
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
        <span
          className={`text-xs ${contextClassName ?? "text-muted-foreground"}`}
        >
          {context}
        </span>
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
 *
 * (Ce commentaire décrit `StageKpiCard`, plus bas.)
 */

/**
 * Nouveaux leads du mois, et la tendance (NOS-1178).
 *
 * Le seul indicateur du bandeau qui mesure une **entrée** et non un stock. Les
 * six autres disent ce que le pipeline contient ; celui-ci dit ce qu'on y met.
 * Un pipeline qui ne se remplit plus se voit ici des semaines avant de se voir
 * ailleurs.
 *
 * ## Sa propre requête, et son propre périmètre
 *
 * Il ne lit pas `deals` du contexte : celui-ci est filtré sur la période
 * choisie en haut de l'écran, alors que « par rapport au mois passé » désigne
 * deux mois calendaires. Croiser les deux donnerait « le mois en cours, dans
 * les 90 derniers jours » — une phrase qui ne veut rien dire.
 *
 * Il suit en revanche le **responsable** sélectionné : « mes nouveaux leads »
 * est une question qu'on se pose, contrairement à « mes leads des 90 derniers
 * jours du mois en cours ».
 */
const NewLeadsKpiCard = () => {
  const { selection, today } = useDashboard();

  const { data: deals } = useGetList<Deal>("deals", {
    pagination: { page: 1, perPage: 1000 },
    sort: { field: "entered_at", order: "DESC" },
    filter: {
      ...(selection.salesId != null ? { sales_id: selection.salesId } : {}),
    },
  });

  const trend = computeNewLeadsTrend(deals ?? [], today);
  const up = (trend.deltaPercent ?? 0) > 0;

  return (
    <KpiCard
      label="Nouveaux leads"
      icon={UserPlus}
      color="var(--deal-series-potential)"
      value={String(trend.current)}
      context={describeLeadsTrend(trend)}
      // La couleur de la variation est portée par le contexte, pas par le
      // chiffre : c'est la tendance qui est bonne ou mauvaise, pas le nombre
      // de leads.
      contextClassName={
        trend.deltaPercent == null
          ? undefined
          : up
            ? "text-[var(--deal-status-won)]"
            : "text-[var(--deal-status-serious)]"
      }
    />
  );
};

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
      context={[
        pluralize(bucket.count, "opportunité", "opportunités"),
        // Le pondéré à côté du brut, comme les deux cartes de tête
        // (NOS-1178). Absent plutôt qu'à zéro quand rien n'est pondérable :
        // « 0 € pondéré » se lirait comme une prévision nulle.
        bucket.weightedAvailable
          ? `${formatCurrencyCompact(bucket.weightedAmount)} pondéré`
          : null,
        bucket.hasUnvaluedDeals ? "montant manquant sur certaines" : null,
      ]
        .filter(Boolean)
        .join(" · ")}
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
    // La ponderation traverse jusqu aux cartes d etape (NOS-1178) : le
    // bandeau montrait brut ET pondere en tete, puis trois etapes en brut
    // seulement -- on ne pouvait pas rapprocher les cartes entre elles.
    { openOnly: true, includeEmpty: true, weighting },
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

      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {/*
          Les nouveaux leads en tête (NOS-1178, demandé par Simon).

          L'ordre du bandeau suit le chemin d'une affaire, et une affaire
          commence par entrer. Les six autres cartes disent ensuite ce que le
          pipeline en fait, jusqu'au signé.
        */}
        <NewLeadsKpiCard />

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
