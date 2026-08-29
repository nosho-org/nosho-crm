import {
  FileText,
  FlaskConical,
  PieChart,
  Target,
  TrendingUp,
  Trophy,
  UserPlus,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useGetList } from "ra-core";
import { Link } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MagicCard, NumberTicker } from "@/components/ui/motion";

import { formatCurrencyCompact } from "../misc/formatCurrency";
import type { Deal, RevenueActual } from "../types";
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
import { toDealsLink } from "../deals/dealFilterContract";
import {
  currentMonthStart,
  formatMonth,
  groupByMonth,
  monthOverMonth,
} from "./revenueActuals";

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
  /*
   * Toutes les cartes ont exactement la meme forme (NOS-1181).
   *
   * « Pipeline brut (potentiel) » a le libelle le plus long : il passait a la
   * ligne quand les autres tenaient sur une, et cette carte-la etait plus
   * haute que ses voisines. La grille etirait alors toute la rangee sur elle.
   *
   * Trois hauteurs sont donc figees plutot que laissees au contenu :
   * `min-h-[2.5em]` sur le libelle (deux lignes), `min-h-[1.5rem]` sur le
   * montant, `min-h-[1rem]` sur le contexte. Une carte sans contexte occupe la
   * meme place qu'une carte qui en a un.
   *
   * `h-full` remonte jusqu'a la grille : sans lui, `items-stretch` n'a rien a
   * etirer, et le `MagicCard` intermediaire casse la chaine.
   */
  <MagicCard className="rounded-xl h-full">
    <Card className="h-full p-3 flex flex-col gap-0.5 min-w-0 bg-transparent">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground line-clamp-2 min-h-[2.5em] leading-tight">
          {label}
        </span>
        <Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} aria-hidden />
      </div>
      <span
        className="text-xl font-semibold leading-tight truncate min-h-[1.5rem]"
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
      <span
        className={`text-xs line-clamp-1 min-h-[1rem] ${
          contextClassName ?? "text-muted-foreground"
        }`}
      >
        {context}
      </span>
      {children}
    </Card>
  </MagicCard>
);

/**
 * Une carte KPI qui mene aux elements qu'elle compte (NOS-1181).
 *
 * Un chiffre qu'on ne peut pas ouvrir est un cul-de-sac : on lit « 25
 * opportunites en Qualifie » et il faut ensuite reconstruire le filtre a la
 * main dans la liste.
 *
 * Le lien est un `<Link>` et non un `onClick` : il s'ouvre dans un nouvel
 * onglet au clic du milieu, se copie, et se lit par un lecteur d'ecran comme
 * ce qu'il est.
 */
const LinkedKpiCard = ({
  to,
  ...card
}: Parameters<typeof KpiCard>[0] & {
  to: { pathname: string; search: string };
}) => (
  <Link
    to={to}
    className="no-underline text-inherit block h-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--deal-series-potential)] rounded-xl"
  >
    <KpiCard {...card} />
  </Link>
);

/**
 * Le MRR réellement encaissé (NOS-1179).
 *
 * Le seul chiffre du bandeau qui ne vienne pas d'une saisie. Tous les autres
 * additionnent des ARR tapés dans des opportunités ; celui-ci somme ce qui a
 * atterri sur le compte Qonto — reversements Mollie et virements directs de
 * clients.
 *
 * ## Il affiche le dernier mois COMPLET, et le nomme
 *
 * Un mois entamé au tiers afficherait un tiers du chiffre, et se lirait comme
 * une chute de 66 % tous les 10 du mois. Le mois est donc écrit à côté :
 * un montant sans son mois se lit comme « maintenant », ce qu'il n'est pas.
 *
 * ## Il ne suit aucun filtre
 *
 * Ni la période, ni le responsable. Un encaissement bancaire n'a pas de
 * commercial, et le restreindre à une période choisie plus haut donnerait un
 * total qui n'a plus de sens comptable.
 */
const CashKpiCard = () => {
  const [open, setOpen] = useState(false);

  const { data: rows } = useGetList<RevenueActual>("revenue_actuals", {
    pagination: { page: 1, perPage: 60 },
    sort: { field: "month", order: "DESC" },
  });

  const trend = monthOverMonth(rows ?? []);
  const up = (trend?.deltaPercent ?? 0) > 0;

  const card = trend ? (
    <KpiCard
      label="Encaissé"
      icon={Wallet}
      color="var(--deal-status-won)"
      value={formatCurrencyCompact(trend.current.amount)}
      context={[
        formatMonth(trend.current.month),
        trend.deltaPercent != null
          ? `${trend.deltaPercent > 0 ? "+" : ""}${trend.deltaPercent} %`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")}
      contextClassName={
        trend.deltaPercent == null
          ? undefined
          : up
            ? "text-[var(--deal-status-won)]"
            : "text-[var(--deal-status-serious)]"
      }
    />
  ) : (
    <KpiCard
      label="Encaissé"
      icon={Wallet}
      color="var(--deal-status-won)"
      value="—"
      context="aucun mois complet relevé"
    />
  );

  return (
    <>
      {/*
        Un bouton et non un lien : il n'y a pas de page « encaisse » vers
        laquelle mener. Le clic ouvre la serie mois par mois, qui est la seule
        chose qu'on veut voir derriere ce chiffre.
      */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block h-full w-full text-left rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--deal-status-won)] cursor-pointer"
        aria-label="Voir l'encaisse mois par mois"
      >
        {card}
      </button>
      {open && (
        <CashHistoryDialog rows={rows ?? []} onClose={() => setOpen(false)} />
      )}
    </>
  );
};

/**
 * L'encaisse mois par mois (NOS-1181, demande par Simon).
 *
 * « Un petit graphique qui reprend les encaissements Mollie mois par mois
 * depuis janvier 2026, afin de voir la croissance reelle du MRR. »
 *
 * ## Des barres, pas une courbe
 *
 * Chaque mois est une somme close, pas un point sur un continuum. Une courbe
 * suggererait qu'il s'est passe quelque chose entre deux mois ; il ne s'est
 * rien passe, il y a deux totaux.
 *
 * ## Le mois en cours est present, et grise
 *
 * Le KPI l'ecarte, mais le graphique le montre -- barre plus pale et mention
 * « en cours ». Le taire ferait croire que rien n'est encaisse ce mois-ci ;
 * le presenter comme les autres ferait lire une chute. Le griser dit ce qu'il
 * est : un mois incomplet.
 *
 * ## Fait a la main, sans bibliotheque
 *
 * Sept a douze barres et un axe : `nivo` est deja dans le bundle mais il
 * apporte une legende, un theme et une gestion de survol dont rien n'est
 * utile ici. Des `div` en pourcentage sont plus courts que la configuration
 * qu'il faudrait lui ecrire.
 */
const CashHistoryDialog = ({
  rows,
  onClose,
}: {
  rows: RevenueActual[];
  onClose: () => void;
}) => {
  const months = groupByMonth(rows);
  const current = currentMonthStart();
  const max = Math.max(...months.map((m) => m.amount), 1);

  const first = months[0];
  const lastComplete = months.filter((m) => m.month < current).at(-1);
  const growth =
    first &&
    lastComplete &&
    first.amount > 0 &&
    first.month !== lastComplete.month
      ? Math.round(((lastComplete.amount - first.amount) / first.amount) * 100)
      : null;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Encaissé mois par mois</DialogTitle>
          <DialogDescription>
            Reversements Mollie et virements directs de clients, relevés sur le
            compte Qonto. Le mois en cours est incomplet, et grisé.
          </DialogDescription>
        </DialogHeader>

        {months.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun mois relevé pour l'instant.
          </p>
        ) : (
          <>
            <div className="flex items-end gap-2 h-40 pt-2">
              {months.map((month) => {
                const partial = month.month >= current;
                return (
                  <div
                    key={month.month}
                    className="flex-1 flex flex-col items-center gap-1 min-w-0"
                    title={`${formatMonth(month.month)} — ${formatCurrencyCompact(month.amount)}${
                      partial ? " (mois en cours)" : ""
                    }`}
                  >
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {formatCurrencyCompact(month.amount)}
                    </span>
                    <div
                      className={`w-full rounded-t ${
                        partial
                          ? "bg-[var(--muted)] border border-dashed border-[var(--deal-status-won)]"
                          : "bg-[var(--deal-status-won)]"
                      }`}
                      style={{
                        // 8 % de plancher : une barre a zero disparait, et une
                        // barre absente se lit comme une donnee manquante.
                        height: `${Math.max(8, (month.amount / max) * 100)}%`,
                      }}
                    />
                    <span className="text-[10px] text-muted-foreground truncate w-full text-center">
                      {formatMonth(month.month).slice(0, 4)}
                    </span>
                  </div>
                );
              })}
            </div>

            {growth != null && first && lastComplete && (
              <p className="text-sm text-muted-foreground border-t pt-3">
                De {formatMonth(first.month)} à{" "}
                {formatMonth(lastComplete.month)} :{" "}
                <b className="text-foreground">
                  {growth > 0 ? "+" : ""}
                  {growth} %
                </b>{" "}
                — {formatCurrencyCompact(first.amount)} →{" "}
                {formatCurrencyCompact(lastComplete.amount)}.
              </p>
            )}
          </>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

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
  const { selection, today, selectionFilter } = useDashboard();

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
    <LinkedKpiCard
      // Les leads du mois : le lien ouvre exactement ce que le chiffre compte.
      to={toDealsLink({
        ...selectionFilter,
        periodStart: currentMonthStart(today),
        periodEnd: null,
      })}
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
  const { selectionFilter } = useDashboard();
  const bucket = buckets.find((entry) => entry.stage === stage);
  if (!bucket) return null;

  return (
    <LinkedKpiCard
      to={toDealsLink({ ...selectionFilter, stage })}
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
  const {
    deals,
    weighting,
    inactivityThresholdDays,
    today,
    truncated,
    selectionFilter,
  } = useDashboard();
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

      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
        {/*
          Les nouveaux leads en tête (NOS-1178, demandé par Simon).

          L'ordre du bandeau suit le chemin d'une affaire, et une affaire
          commence par entrer. Les six autres cartes disent ensuite ce que le
          pipeline en fait, jusqu'au signé.
        */}
        <NewLeadsKpiCard />

        {/* « Pipeline brut » et non « Pipeline brut (potentiel) » : c'est le
            libellé qui débordait sur deux lignes et déformait la rangée. Le
            mot « potentiel » ne disait rien que « brut » ne dise déjà. */}
        <LinkedKpiCard
          to={toDealsLink(selectionFilter)}
          label="Pipeline brut"
          icon={TrendingUp}
          color={potential}
          value={formatCurrencyCompact(snapshot.potential.amount)}
          context={`${pluralize(snapshot.potential.count, "opportunité ouverte", "opportunités ouvertes")}`}
        />

        <LinkedKpiCard
          to={toDealsLink(selectionFilter)}
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

        <CashKpiCard />

        <LinkedKpiCard
          to={toDealsLink({ ...selectionFilter, stage: "closed-won" })}
          label="ARR signé"
          icon={Trophy}
          color={won}
          value={formatCurrencyCompact(snapshot.signed.amount)}
          context={`${pluralize(snapshot.signed.count, "opportunité gagnée", "opportunités gagnées")}`}
        />
      </div>
    </section>
  );
};
