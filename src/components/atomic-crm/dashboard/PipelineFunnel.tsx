import { ArrowRight, FilePlus2, MoveRight, Trophy, XCircle } from "lucide-react";
import { type Identifier, useGetList } from "ra-core";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { legacyDealStages } from "../root/defaultConfiguration";
import { formatCurrencyCompact } from "../misc/formatCurrency";
import { pluralize } from "../deals/cockpit/dealFormat";
import {
  computeStageBreakdown,
  totalStageBreakdown,
} from "../deals/cockpit/dealStageBreakdown";
import type { DealRecord } from "../deals/cockpit/dealFields";
import { toDealsLink } from "../deals/dealFilterContract";
import { useDashboard } from "./DashboardContext";
import {
  type StageChangeRow,
  computePipelineWeek,
  debutDeSemaine,
  formatVariation,
} from "./pipelineWeek";

/**
 * Pipeline par étape (NOS-955 §4), et sa semaine (NOS-1378).
 *
 * "Afficher uniquement les opportunités ouvertes […] Pour chaque étape : ARR
 * total + nombre d'opportunités."
 *
 * Marc-Henri, le 06/09/2026 : « chaque lundi, pouvoir voir immédiatement
 * combien de nouveaux leads, combien d'opportunités ont avancé, où le pipeline
 * bouge, combien gagné/perdu. Aucun reporting Excel manuel. »
 *
 * L'agrégat vient de `dealStageBreakdown`, qui alimente aussi les en-têtes de
 * colonnes du kanban : mêmes chiffres sur les deux écrans, par construction.
 * Les mouvements viennent de `pipelineWeek`, qui les calcule depuis le journal
 * des changements plutôt que depuis des instantanés hebdomadaires stockés.
 *
 * ## Ce bloc ignore le filtre de période, délibérément
 *
 * Le filtre de période du tableau de bord porte sur `expected_closing_date`.
 * Croisé avec une semaine calendaire, il produirait des chiffres faux : une
 * opportunité passée en Proposition mardi mais dont la date de clôture prévue
 * tombe hors période disparaîtrait du décompte, alors qu'elle a bel et bien
 * bougé cette semaine.
 *
 * Le bloc fait donc sa propre requête et ne suit que le filtre **Responsable**,
 * comme le KPI « Nouveaux leads » avant lui (NOS-1178) et pour la même raison.
 * L'interface le dit, plutôt que de laisser croire à un chiffre filtré.
 */

/** One hue per stage, matching the board columns of NOS-956. */
const STAGE_COLORS: Record<string, string> = {
  "a-reclasser": "var(--muted-foreground)",
  lead: "#7cc0f0",
  qualified: "var(--deal-series-potential)",
  // `demo` garde le violet de l'ancienne « Démo / POC » — c'est la couleur que
  // l'équipe associe déjà à cette zone du pipeline. `poc` reçoit un magenta,
  // interpolé entre ce violet et l'orange de « Proposition », pour que la
  // progression du dégradé reste continue après le redécoupage du 06/09/2026.
  demo: "var(--deal-series-weighted)",
  poc: "#c4569e",
  proposal: "#f0993f",
  negociation: "var(--deal-status-warning)",
  "closed-won": "var(--deal-status-won)",
  lost: "var(--deal-status-lost)",
};

/**
 * Le churn est écarté de ce tableau.
 *
 * Marc-Henri demande « Lead → Qualifié → Démo → POC → Proposition → Négociation
 * → Won / Lost ». Une résiliation après signature n'est pas une étape que le
 * pipeline traverse : la lister ici ajouterait une ligne qui ne bouge jamais
 * d'une semaine sur l'autre.
 */
const ETAPES_MASQUEES = new Set(["churn", "a-reclasser"]);

/**
 * Le lien vers les opportunités qu'un chiffre compte (NOS-1379).
 *
 * Simon : « faut que les KPI soient cliquables et amènent vers les
 * opportunités concernées ».
 *
 * Le lien nomme les identifiants un par un plutôt que de redécrire le critère.
 * `DealFilterState.ids` existe exactement pour ça (NOS-1193) : « le seul filtre
 * qui ne peut pas diverger de ce qui l'a produit ». Tenter de retraduire
 * « ayant bougé cette semaine » en filtres de liste donnerait un second calcul,
 * donc une seconde définition, donc un lien qui ment sur son propre chiffre.
 *
 * Et surtout : **le filtre de sélection n'est PAS ajouté**. Les identifiants
 * sont déjà le résultat exact, responsable compris ; y superposer
 * `periodStart` — qui vise `expected_closing_date` — retrancherait des lignes
 * que le chiffre annonce.
 */
const lienVers = (ids: Identifier[]) => toDealsLink({ ids });

const KpiSemaine = ({
  icone: Icone,
  libelle,
  valeur,
  detail,
  couleur,
  ids,
}: {
  icone: typeof Trophy;
  libelle: string;
  valeur: string;
  detail?: string | null;
  couleur?: string;
  ids: Identifier[];
}) => {
  const contenu = (
    <>
      <Icone
        className="w-4 h-4 mt-0.5 shrink-0"
        style={{ color: couleur ?? "var(--muted-foreground)" }}
        aria-hidden
      />
      <div className="min-w-0">
        <span className="block text-lg font-semibold tabular-nums leading-tight">
          {valeur}
        </span>
        <span className="block text-xs text-muted-foreground leading-tight">
          {libelle}
        </span>
        {detail ? (
          <span
            className="block text-xs tabular-nums leading-tight"
            style={{ color: couleur ?? "var(--muted-foreground)" }}
          >
            {detail}
          </span>
        ) : null}
      </div>
    </>
  );

  const classes =
    "flex items-start gap-2 min-w-0 rounded-md border border-border/60 px-3 py-2";

  // Zéro n'ouvre rien : un lien vers une liste vide promet un contenu qui
  // n'existe pas, et se distingue mal d'un lien cassé.
  if (ids.length === 0) {
    return <div className={classes}>{contenu}</div>;
  }

  return (
    <Link
      to={lienVers(ids)}
      className={`${classes} hover:bg-muted/50 transition-colors`}
      aria-label={`${valeur} ${libelle} — voir ${ids.length === 1 ? "l'opportunité" : "les opportunités"}`}
    >
      {contenu}
    </Link>
  );
};

export const PipelineFunnel = () => {
  const { dealStages } = useConfigurationContext();
  const { weighting, selection, selectionFilter, today } = useDashboard();

  // Le filtre Responsable, et lui seul — voir l'en-tête du module.
  const filtreResponsable = useMemo(
    () => (selection.salesId != null ? { sales_id: selection.salesId } : {}),
    [selection.salesId],
  );

  const { data: dealsSemaine } = useGetList<DealRecord>("deals", {
    pagination: { page: 1, perPage: 1000 },
    sort: { field: "id", order: "ASC" },
    filter: filtreResponsable,
  });

  const debut = useMemo(() => debutDeSemaine(today), [today]);

  /*
   * Le journal depuis lundi. `field: "stage"` est filtré côté serveur : le
   * journal enregistre vingt-trois champs, et rapatrier les changements de
   * montant ou de responsable pour les jeter ensuite serait du gâchis.
   *
   * `source` n'est PAS filtré ici : `computePipelineWeek` s'en charge, et c'est
   * mieux ainsi — la règle « seuls les changements humains comptent » est une
   * décision métier, elle appartient au module testé, pas à une chaîne de
   * requête.
   */
  const { data: changements } = useGetList<StageChangeRow & { id: number }>(
    "deal_change_log",
    {
      pagination: { page: 1, perPage: 1000 },
      sort: { field: "changed_at", order: "ASC" },
      filter: { field: "stage", "changed_at@gte": debut.toISOString() },
    },
  );

  const deals = useMemo(() => dealsSemaine ?? [], [dealsSemaine]);

  /*
   * `includeEmpty` : une étape sans opportunité reste affichée, à 0 € (NOS-1084).
   *
   * Le funnel les masquait. En production, Proposition, Négociation et
   * À reclasser n'ont aucune opportunité — le bloc listait donc trois étapes
   * sur six, pendant que le bandeau juste au-dessus annonçait « ARR en
   * Proposition : 0 € ». Deux widgets nourris par la même agrégation
   * répondaient différemment à la même question, ce que ce module existe
   * précisément pour empêcher.
   *
   * Et une étape vide est une information : « rien n'est passé en Proposition »
   * est un signal commercial. La masquer laisse croire que l'étape n'existe pas.
   *
   * `openOnly` est faux : Won et Lost font partie de la lecture hebdomadaire
   * demandée — c'est là qu'on voit ce que la semaine a produit.
   */
  const buckets = computeStageBreakdown(
    deals,
    dealStages,
    weighting.pipelineStatuses,
    { openOnly: false, includeEmpty: true },
  ).filter((bucket) => !ETAPES_MASQUEES.has(bucket.stage));

  const semaine = useMemo(
    () =>
      computePipelineWeek(
        deals,
        changements ?? [],
        dealStages,
        today,
        // Le journal traverse les renommages d etapes : `demo-poc` ecrit par un
        // humain mardi doit se lire `demo` aujourd hui.
        legacyDealStages,
      ),
    [deals, changements, dealStages, today],
  );

  // Le vide se mesure sur les opportunités, pas sur les lignes : il y a toujours
  // des étapes configurées, donc `buckets.length` ne tombe jamais à zéro.
  const isEmpty = totalStageBreakdown(buckets).count === 0;

  // Bars are scaled against the largest bucket, not the total: the point is to
  // compare stages with one another, and a share-of-total scale would flatten
  // every bar once one stage dominates.
  const max = buckets.reduce((peak, bucket) => Math.max(peak, bucket.amount), 0);

  const semaineDu = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
  }).format(debut);

  return (
    <Card className="p-4 flex flex-col gap-3 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Pipeline par étape</h2>
        <Link
          to={toDealsLink(selectionFilter)}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          Voir le pipeline complet
          <ArrowRight className="w-3 h-3" aria-hidden />
        </Link>
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">
          Activité commerciale — semaine du {semaineDu}
        </h3>
        <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
          <KpiSemaine
            icone={FilePlus2}
            libelle="Nouveaux leads"
            valeur={String(semaine.kpis.nouveauxLeads.count)}
            ids={semaine.kpis.nouveauxLeads.ids}
            couleur="var(--deal-series-potential)"
          />
          <KpiSemaine
            icone={MoveRight}
            libelle="Opportunités ayant bougé"
            valeur={String(semaine.kpis.ayantBouge.count)}
            ids={semaine.kpis.ayantBouge.ids}
          />
          <KpiSemaine
            icone={Trophy}
            // Le libellé porte le NOM, jamais le nombre : la tuile affiche
            // déjà le compteur en gros juste au-dessus, et `pluralize` le
            // préfixerait une seconde fois — « 2 » puis « 2 gagnées ».
            libelle={semaine.kpis.won.count > 1 ? "gagnées" : "gagnée"}
            valeur={String(semaine.kpis.won.count)}
            ids={semaine.kpis.won.ids}
            detail={
              semaine.kpis.won.count > 0
                ? `+ ${formatCurrencyCompact(semaine.kpis.won.amount)} ARR`
                : null
            }
            couleur="var(--deal-status-won)"
          />
          <KpiSemaine
            icone={XCircle}
            libelle={semaine.kpis.lost.count > 1 ? "perdues" : "perdue"}
            valeur={String(semaine.kpis.lost.count)}
            ids={semaine.kpis.lost.ids}
            detail={
              semaine.kpis.lost.count > 0
                ? `- ${formatCurrencyCompact(semaine.kpis.lost.amount)} ARR`
                : null
            }
            couleur="var(--deal-status-lost)"
          />
        </div>
      </section>

      {isEmpty ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          Aucune opportunité sur cette sélection.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {buckets.map((bucket) => {
            const mouvement = semaine.parEtape[bucket.stage] ?? {
              entrees: 0,
              variation: 0,
            };
            return (
              <li key={bucket.stage} className="flex items-center gap-3 min-w-0">
                <span
                  className="text-xs w-24 shrink-0 truncate"
                  title={bucket.label}
                >
                  {bucket.label}
                </span>

                <Link
                  to={toDealsLink({ ...selectionFilter, stage: bucket.stage })}
                  className="flex-1 min-w-0 group"
                  /*
                   * `pluralize` PRÉFIXE déjà le nombre : le préfixer une
                   * seconde fois donnait « 3 3 opportunités ». Le défaut
                   * vivait ici depuis l'origine du bloc, et seuls les lecteurs
                   * d'écran l'entendaient — d'où sa longévité.
                   */
                  aria-label={`${bucket.label} — ${pluralize(bucket.count, "opportunité", "opportunités")}, ${formatCurrencyCompact(bucket.amount)}, ${pluralize(mouvement.entrees, "entrée", "entrées")} cette semaine, stock ${formatVariation(mouvement.variation)} depuis lundi`}
                >
                  <div
                    className="bg-muted overflow-hidden"
                    style={{
                      height: "0.625rem",
                      borderRadius: "var(--skin-bar-radius)",
                    }}
                  >
                    <div
                      className="h-full transition-[width] group-hover:opacity-80"
                      style={{
                        width: max > 0 ? `${(bucket.amount / max) * 100}%` : "0%",
                        background:
                          STAGE_COLORS[bucket.stage] ?? "var(--muted-foreground)",
                        borderRadius: "var(--skin-bar-radius)",
                      }}
                    />
                  </div>
                </Link>

                {/*
                 * Les deux chiffres de la semaine, côte à côte et distincts.
                 * C'est le point sur lequel Marc-Henri a insisté : une étape
                 * peut recevoir cinq opportunités et n'en gagner que deux en
                 * stock. Les afficher l'un sous l'autre les ferait lire comme
                 * deux versions du même nombre.
                 */}
                <span className="text-right shrink-0 w-20 hidden sm:block">
                  <span className="block text-xs tabular-nums">
                    {mouvement.entrees > 0 ? (
                      // Cliquable au même titre que les KPI : ce chiffre aussi
                      // désigne un ensemble précis d'opportunités.
                      <Link
                        to={lienVers(mouvement.entreesIds)}
                        className="text-[var(--deal-status-won)] hover:underline"
                        aria-label={`${bucket.label} — voir ${pluralize(mouvement.entrees, "opportunité entrée", "opportunités entrées")} cette semaine`}
                      >
                        + {mouvement.entrees} entré
                        {mouvement.entrees > 1 ? "es" : "e"}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </span>
                  <span
                    className="block text-xs tabular-nums text-muted-foreground"
                    title="Variation du stock depuis lundi"
                  >
                    {formatVariation(mouvement.variation)} vs W-1
                  </span>
                </span>

                <span className="text-right shrink-0 w-28">
                  <span className="block text-sm font-medium tabular-nums">
                    {formatCurrencyCompact(bucket.amount)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {/* pluralize already prefixes the count. */}
                    {pluralize(bucket.count, "opportunité", "opportunités")}
                    {bucket.hasUnvaluedDeals && (
                      <span title="Certaines opportunités n'ont pas de montant">
                        {" "}
                        *
                      </span>
                    )}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-muted-foreground border-t border-border/60 pt-2">
        <strong className="font-medium">Entrées</strong> = opportunités ayant
        rejoint l'étape cette semaine (un flux).{" "}
        <strong className="font-medium">vs W-1</strong> = variation du stock
        depuis lundi (un solde) : une étape peut recevoir cinq opportunités et
        n'en gagner que deux. Ces chiffres suivent le filtre Responsable, mais
        pas le filtre de période — une semaine est une fenêtre fixe.
      </p>
    </Card>
  );
};
