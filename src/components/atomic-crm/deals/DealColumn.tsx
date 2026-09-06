import { Droppable } from "@hello-pangea/dnd";

import { formatCurrencyCompact } from "../misc/formatCurrency";
import { pluralize } from "./cockpit/dealFormat";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Deal } from "../types";
import { computeStageBreakdown } from "./cockpit/dealStageBreakdown";
import { DealCard } from "./DealCard";

/**
 * One hue per stage, from the NOS-956 mockup. Drawn as a rule under the column
 * header rather than as a background: the cards carry the deal's own colours
 * (priority, products, action date) and a tinted column would compete with them.
 */
const STAGE_ACCENT: Record<string, string> = {
  "a-reclasser": "var(--muted-foreground)",
  lead: "#7cc0f0",
  qualified: "var(--deal-series-potential)",
  // Même dégradé que le entonnoir du tableau de bord (PipelineFunnel) : les
  // deux écrans doivent nommer la même étape de la même couleur.
  demo: "var(--deal-series-weighted)",
  poc: "#c4569e",
  proposal: "#f0993f",
  negociation: "var(--deal-status-warning)",
  "closed-won": "var(--deal-status-won)",
  lost: "var(--deal-status-lost)",
  churn: "var(--muted-foreground)",
};

export const DealColumn = ({
  stage,
  deals,
}: {
  stage: string;
  deals: Deal[];
}) => {
  const { dealStages, dealPipelineStatuses, currency } =
    useConfigurationContext();

  // Through the shared aggregate rather than a local sum, so a column header and
  // the dashboard funnel can never disagree on what a stage is worth — including
  // how each treats a deal with no amount.
  const [bucket] = computeStageBreakdown(
    deals,
    dealStages,
    dealPipelineStatuses,
  ).filter((candidate) => candidate.stage === stage);

  const label = bucket?.label ?? stage;
  const accent = STAGE_ACCENT[stage] ?? "var(--muted-foreground)";

  return (
    <div className="flex-1 min-w-[220px] pb-8">
      <div className="sticky top-0 z-10 flex flex-col bg-background py-2 shadow-[0_4px_6px_-6px_rgba(0,0,0,0.15)]">
        <span
          className="h-0.5 w-full rounded-full mb-1.5"
          style={{ background: accent }}
          aria-hidden
        />
        <div className="flex items-baseline justify-between gap-2 px-1">
          <h3
            className="text-xs font-semibold uppercase tracking-wide truncate"
            style={{ color: accent }}
            title={label}
          >
            {label}
          </h3>
          <span className="text-xs font-medium text-muted-foreground tabular-nums shrink-0">
            {deals.length}
          </span>
        </div>
        <p className="text-sm font-medium px-1">
          {formatCurrencyCompact(bucket?.amount ?? 0, currency)} ARR
        </p>
        <p className="text-xs text-muted-foreground px-1">
          {pluralize(deals.length, "opportunité", "opportunités")}
          {bucket?.hasUnvaluedDeals && (
            <span title="Certaines opportunités n'ont pas de montant"> *</span>
          )}
        </p>
      </div>
      <Droppable droppableId={stage}>
        {(droppableProvided, snapshot) => (
          <div
            ref={droppableProvided.innerRef}
            {...droppableProvided.droppableProps}
            className={`flex flex-col rounded-2xl mt-2 gap-2 ${
              snapshot.isDraggingOver ? "bg-muted" : ""
            }`}
          >
            {deals.map((deal, index) => (
              <DealCard key={deal.id} deal={deal} index={index} />
            ))}
            {droppableProvided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
};
