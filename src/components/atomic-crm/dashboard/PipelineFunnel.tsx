import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { formatCurrencyCompact } from "../misc/formatCurrency";
import { pluralize } from "../deals/cockpit/dealFormat";
import {
  computeStageBreakdown,
  totalStageBreakdown,
} from "../deals/cockpit/dealStageBreakdown";
import { toDealsLink } from "../deals/dealFilterContract";
import { useDashboard } from "./DashboardContext";

/**
 * Pipeline par étape (NOS-955 §4).
 *
 * "Afficher uniquement les opportunités ouvertes […] Pour chaque étape : ARR
 * total + nombre d'opportunités."
 *
 * The aggregate comes from `dealStageBreakdown`, which also feeds the kanban
 * column headers. Same numbers on both screens, by construction.
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
};

export const PipelineFunnel = () => {
  const { dealStages } = useConfigurationContext();
  const { deals, weighting, selectionFilter } = useDashboard();

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
   */
  const buckets = computeStageBreakdown(
    deals,
    dealStages,
    weighting.pipelineStatuses,
    { openOnly: true, includeEmpty: true },
  );

  // Le vide se mesure désormais sur les opportunités, pas sur les lignes : il y
  // a toujours des étapes configurées, donc `buckets.length` ne tombe plus
  // jamais à zéro et le message ne serait plus jamais rendu.
  const isEmpty = totalStageBreakdown(buckets).count === 0;

  // Bars are scaled against the largest bucket, not the total: the point is to
  // compare stages with one another, and a share-of-total scale would flatten
  // every bar once one stage dominates.
  const max = buckets.reduce(
    (peak, bucket) => Math.max(peak, bucket.amount),
    0,
  );

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

      {isEmpty ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          Aucune opportunité ouverte sur cette sélection.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {buckets.map((bucket) => (
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
                aria-label={`${bucket.label} — ${bucket.count} ${pluralize(bucket.count, "opportunité", "opportunités")}, ${formatCurrencyCompact(bucket.amount)}`}
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
          ))}
        </ul>
      )}
    </Card>
  );
};
