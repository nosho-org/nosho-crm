import { Link } from "react-router-dom";
import { ArrowRight, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { formatCurrencyCompact } from "../misc/formatCurrency";
import { DealStageBadge } from "../deals/shared/DealBadges";
import { useDashboard } from "./DashboardContext";
import { explainFocus, rankDealsByFocus } from "./dealFocus";

/**
 * ---------------------------------------------------------------------------
 * « À faire maintenant » (NOS-1167)
 * ---------------------------------------------------------------------------
 * L'audit du 29 août 2026 : « Il ne voit nulle part ce qu'il doit faire dans
 * les dix prochaines minutes. »
 *
 * Une seule affaire, la mieux classée par `rankDealsByFocus`. Une seule, parce
 * que deux propositions n'en sont plus une : c'est le tri qui a de la valeur,
 * pas la liste.
 *
 * ## Le score est affiché, et c'est le point
 *
 * « score 94 · 50 k€ × 40 % · 21 j sans contact ». Un tri opaque n'est jamais
 * adopté — on le contourne, et l'écran redevient une liste qu'on relit à la
 * main. En montrant le calcul, on rend le désaccord possible : c'est ce qui
 * fait qu'on peut corriger la formule au lieu d'abandonner l'outil.
 *
 * ## Ce que cette carte ne fait pas
 *
 * Elle ne propose pas d'action à un clic — « envoyer la relance », « passer en
 * proposition ». Le prototype de l'audit en montrait quatre, mais chacune
 * suppose un geste que le CRM ne sait pas encore faire seul. Un bouton qui
 * promet et n'aboutit pas coûte plus que son absence : la carte mène donc à la
 * fiche, où les actions existent réellement.
 */
export const CockpitFocus = () => {
  const { deals, isPending, inactivityThresholdDays, today, weighting } =
    useDashboard();
  const {
    dealStages,
    dealPipelineStatuses,
    dealNextActionFromStage,
    currency,
  } = useConfigurationContext();

  const ranked = rankDealsByFocus(deals, {
    stageProbabilities: weighting.stageProbabilities,
    pipelineStatuses: dealPipelineStatuses,
    dealStages,
    fromStage: dealNextActionFromStage,
    inactivityThresholdDays,
    today,
  });

  const top = ranked[0];

  if (isPending) return null;

  if (!top) {
    return (
      <Card className="p-4 flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          À faire maintenant
        </span>
        <p className="text-sm text-muted-foreground">
          {/* Deux causes possibles, et elles ne demandent pas la même chose :
              plus rien d'ouvert, ou aucune affaire pondérable. */}
          Aucune affaire ouverte à classer sur ce périmètre — ou aucune ne porte
          à la fois un montant et une probabilité.
        </p>
      </Card>
    );
  }

  const amount = (value: number) => formatCurrencyCompact(value, currency);

  return (
    <Card className="p-4 flex flex-col gap-3 border-[var(--deal-series-potential)] border-l-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--deal-series-potential)] flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5" aria-hidden />À faire maintenant
        </span>
        {/* Le calcul, en clair. C'est ce qui rend le classement contestable. */}
        <span className="text-xs text-muted-foreground font-mono">
          score {top.score} · {explainFocus(top, amount)}
        </span>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold">
            {top.deal.company_name || top.deal.name}
          </h3>
          <p className="text-sm text-muted-foreground">
            {/* La société est déjà le titre : on n'écrit l'intitulé que
                lorsqu'il dit autre chose. */}
            {top.deal.company_name && top.deal.company_name !== top.deal.name
              ? top.deal.name
              : null}
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <DealStageBadge stage={top.deal.stage} />
            {!top.hasNextAction && (
              <span className="text-xs text-[var(--deal-status-warning)]">
                Aucune prochaine action définie
              </span>
            )}
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="text-xl font-semibold tabular-nums">
            {amount(top.deal.amount ?? 0)}
          </div>
          <div className="text-xs text-muted-foreground">
            ARR · {amount(top.weightedAmount)} pondéré
          </div>
        </div>
      </div>

      <div>
        <Button asChild size="sm">
          <Link to={`/deals/${top.deal.id}/show`}>
            Ouvrir la fiche
            <ArrowRight className="w-3.5 h-3.5" aria-hidden />
          </Link>
        </Button>
      </div>
    </Card>
  );
};
