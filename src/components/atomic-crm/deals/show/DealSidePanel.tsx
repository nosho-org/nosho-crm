import { useGetList, useRecordContext } from "ra-core";
import { ReferenceField } from "@/components/admin/reference-field";
import { Card } from "@/components/ui/card";

import { useConfigurationContext } from "../../root/ConfigurationContext";
import { formatCurrency } from "../../misc/formatCurrency";
import type { Deal } from "../../types";
import { UNKNOWN, formatPercent } from "../cockpit/dealFormat";
import { getDealProbability } from "../cockpit/dealWeighting";
import { formatISODateString } from "../dealUtils";
import { DealProductBadges } from "../shared/DealBadges";
import { DealClientCard } from "./DealClientCard";
import { DealNextMeetingCard } from "./DealNextMeetingCard";

/**
 * ---------------------------------------------------------------------------
 * Colonne droite (NOS-958 §7)
 * ---------------------------------------------------------------------------
 * "Cette colonne doit rester courte. Elle ne doit surtout pas devenir un
 * bordel." Four blocks, nothing else: owner and weighting, products,
 * attachments, stage history.
 */

const Row = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="flex items-baseline justify-between gap-2">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="text-sm font-medium text-right">{children}</span>
  </div>
);

const StageHistory = () => {
  const record = useRecordContext<Deal>();
  const { dealStages, archivedDealStages } = useConfigurationContext();

  const { data } = useGetList(
    "deal_stage_history",
    {
      filter: { deal_id: record?.id },
      sort: { field: "changed_at", order: "DESC" },
      pagination: { page: 1, perPage: 5 },
    },
    { enabled: record?.id != null },
  );

  if (!record || !data?.length) return null;

  const label = (slug: string | null | undefined) =>
    dealStages.find((s) => s.value === slug)?.label ??
    archivedDealStages?.find((s) => s.value === slug)?.label ??
    slug ??
    "—";

  return (
    <Card className="p-4 flex flex-col gap-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Historique des étapes
      </span>
      <ol className="flex flex-col">
        {data.map((entry, index) => (
          <li key={String(entry.id)} className="flex gap-2.5">
            {/* Chronological rail, per PJ3. The most recent dot is coloured. */}
            <div className="flex flex-col items-center shrink-0">
              <span
                className="w-2 h-2 rounded-full mt-1.5"
                style={{
                  background:
                    index === 0
                      ? "var(--deal-series-potential)"
                      : "var(--muted-foreground)",
                }}
                aria-hidden
              />
              {index < data.length - 1 && (
                <span className="w-px flex-1 bg-border my-1" aria-hidden />
              )}
            </div>
            <div className="flex flex-col pb-3 min-w-0">
              <span className="text-sm font-medium">
                {label(entry.to_stage as string)}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatISODateString(String(entry.changed_at).slice(0, 10))}
                {entry.changed_by != null && (
                  <>
                    {" — "}
                    <ReferenceField
                      source="changed_by"
                      reference="sales"
                      link={false}
                      record={entry}
                    />
                  </>
                )}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
};

export const DealSidePanel = () => {
  const record = useRecordContext<Deal>();
  const { dealStageProbabilities, dealPipelineStatuses, currency } =
    useConfigurationContext();

  if (!record) return null;

  const { value: probability } = getDealProbability(record, {
    stageProbabilities: dealStageProbabilities ?? {},
    pipelineStatuses: dealPipelineStatuses,
  });

  const weighted =
    probability !== null && record.amount != null
      ? record.amount * probability
      : null;

  return (
    <div className="flex flex-col gap-4">
      {/* First in the column, and above "Informations" on purpose: the next
          appointment is the one date a rep looks for when opening the page.
          Renders nothing when there is no upcoming meeting task. */}
      <DealNextMeetingCard />

      {/* Qui est ce client, et où (NOS-1122). Placé avant « Informations » :
          on ouvre une affaire qu'on ne resitue pas toujours, et savoir à qui
          on a affaire précède la probabilité de gain. Ne rend rien quand la
          société n'a ni descriptif ni ville. */}
      <DealClientCard />

      <Card className="p-4 flex flex-col gap-2.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Informations
        </span>
        <Row label="Responsable">
          {record.sales_id != null ? (
            <ReferenceField source="sales_id" reference="sales" link={false} />
          ) : (
            UNKNOWN
          )}
        </Row>
        <Row label="Probabilité de gain">
          {/* Null, not 0 %: "no probability recorded" and "no chance of
              winning" are different statements. */}
          {probability !== null ? formatPercent(probability) : UNKNOWN}
        </Row>
        <Row label="ARR pondéré">
          {weighted !== null ? formatCurrency(weighted, currency) : UNKNOWN}
        </Row>
      </Card>

      <Card className="p-4 flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Produits concernés
        </span>
        {record.products?.length ? (
          <DealProductBadges products={record.products} />
        ) : (
          <span className="text-sm text-muted-foreground">{UNKNOWN}</span>
        )}
      </Card>

      <StageHistory />
    </div>
  );
};
