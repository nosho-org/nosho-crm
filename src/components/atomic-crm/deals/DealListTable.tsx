import { useListContext, useRecordContext } from "ra-core";
import { DataTable } from "@/components/admin/data-table";
import { ReferenceField } from "@/components/admin/reference-field";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { formatCurrency } from "../misc/formatCurrency";
import type { Deal } from "../types";
import { DealBulkEditStage } from "./DealBulkEditStage";
import { DealPriorityField } from "./DealPriorityField";
import { DealNextActionDate, DealProductBadges } from "./shared/DealBadges";
import { getDealActivity } from "./cockpit/dealFields";
import { startOfToday } from "./cockpit/dealDates";
import { findDealLabel } from "./deal";
import { formatISODateString } from "./dealUtils";

/**
 * Row-by-row view of the opportunities (NOS-798, columns revised by NOS-956).
 *
 * Complements the Kanban board rather than replacing it: the toggle in
 * <DealListContent> switches between the two and remembers the choice.
 *
 * Column order is the one the spec prescribes:
 *   Priorité | Opportunité | Société | Étape | Produit(s) | ARR |
 *   Prochaine action | Date prochaine action | Responsable | Clôture prévue |
 *   Dernière activité
 *
 * MRR is deliberately gone — "ARR suffit et l'espace est plus utile pour
 * l'action commerciale". Dernière activité is not in the spec text but is in
 * the mockup, and it is what makes the dormancy alert legible from here.
 */
export const DealListTable = () => {
  const { dealStages, dealCategories, currency } = useConfigurationContext();
  const { data } = useListContext<Deal>();

  if (!data?.length) return null;

  return (
    <DataTable
      rowClick="show"
      // Row selection is what makes the bulk stage change possible — the tool
      // the spec asks for to empty the "À reclasser" queue.
      bulkActionButtons={<DealBulkEditStage />}
    >
      <DataTable.Col
        source="priority_rank"
        label="Priorité"
        headerClassName="w-32"
      >
        <DealPriorityField />
      </DataTable.Col>
      <DataTable.Col source="name" label="Opportunité" />
      <DataTable.Col source="company_id" label="Société">
        <ReferenceField
          source="company_id"
          reference="companies"
          link={false}
        />
      </DataTable.Col>
      <DataTable.Col source="stage" label="Étape">
        <StageField stages={dealStages} />
      </DataTable.Col>
      <DataTable.Col label="Produit(s)">
        <ProductsField />
      </DataTable.Col>
      <DataTable.Col
        source="amount"
        label="ARR"
        headerClassName="text-right"
        cellClassName="text-right tabular-nums"
      >
        <ArrField currency={currency} />
      </DataTable.Col>
      <DataTable.Col source="next_action" label="Prochaine action">
        <NextActionField />
      </DataTable.Col>
      <DataTable.Col source="next_action_date" label="Date prochaine action">
        <NextActionDateField />
      </DataTable.Col>
      <DataTable.Col source="category" label="Catégorie">
        <ChoiceField choices={dealCategories} source="category" />
      </DataTable.Col>
      <DataTable.Col source="sales_id" label="Responsable">
        <ReferenceField source="sales_id" reference="sales" link={false} />
      </DataTable.Col>
      <DataTable.Col source="expected_closing_date" label="Clôture prévue">
        <DateField source="expected_closing_date" />
      </DataTable.Col>
      <DataTable.Col
        source="last_activity_at"
        label="Dernière activité"
        cellClassName="text-right"
      >
        <LastActivityField />
      </DataTable.Col>
    </DataTable>
  );
};

/** Products carried by the deal, in the shared badge style. */
const ProductsField = () => {
  const record = useRecordContext<Deal>();
  if (!record) return null;
  return <DealProductBadges products={record.products} />;
};

/**
 * The action itself. Its date lives in its own column, per the spec.
 *
 * Falls back to the deal's oldest pending task when nobody typed a next action
 * — which, in production, is every single opportunity (issue #108).
 */
const NextActionField = () => {
  const record = useRecordContext<Deal>();
  const typed = record?.next_action?.trim();
  const fromTask = record?.next_task_text?.trim();
  const action = typed || fromTask;
  if (!action) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className="truncate block max-w-56"
      title={typed ? action : `Tâche en cours : ${action}`}
    >
      {action}
      {!typed && (
        <span className="ml-1 text-muted-foreground/70 text-xs">(tâche)</span>
      )}
    </span>
  );
};

/**
 * Colour-coded date: red overdue, orange today, neutral upcoming, warning when
 * undefined. The colour goes on this cell and nowhere else — "ne pas colorer
 * toute la ligne ou toute la carte […] sans transformer le CRM en arc en ciel".
 */
const NextActionDateField = () => {
  const record = useRecordContext<Deal>();
  if (!record) return null;
  return <DealNextActionDate deal={record} />;
};

/** How long since anything happened — the dormancy signal, read at a glance. */
const LastActivityField = () => {
  const record = useRecordContext<Deal>();
  const { dealPipelineStatuses, dealInactivityAlertDays } =
    useConfigurationContext();
  if (!record) return null;
  const { daysSinceActivity, isStale } = getDealActivity(record, {
    pipelineStatuses: dealPipelineStatuses,
    thresholdDays: dealInactivityAlertDays,
    today: startOfToday(),
  });
  if (daysSinceActivity === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span
      className={`text-xs tabular-nums ${isStale ? "text-[var(--deal-status-serious)] font-medium" : "text-muted-foreground"}`}
    >
      {daysSinceActivity} j
    </span>
  );
};

const StageField = ({
  stages,
}: {
  stages: { value: string; label: string }[];
}) => {
  const record = useRecordContext<Deal>();
  if (!record) return null;
  return <span>{findDealLabel(stages, record.stage) ?? record.stage}</span>;
};

/**
 * Category, falling back to the pre-v2 value (issue #108).
 *
 * The v2 migration (20260823093000) rewrote every non-null `category` to the
 * placeholder `'a-reclasser'` and parked the original in `legacy_category`.
 * Rendering the placeholder alone told the sales team nothing and read as a
 * bug; showing what the opportunity used to be, marked as such, keeps the
 * information visible until the reclassification is actually done.
 */
const ChoiceField = ({
  choices,
  source,
}: {
  choices: { value: string; label: string }[];
  source: "category";
}) => {
  const record = useRecordContext<Deal>();
  const value = record?.[source];
  const legacy = record?.legacy_category?.trim();
  const label = (raw: string) =>
    choices.find((c) => c.value === raw)?.label ?? raw;

  if (value && value !== "a-reclasser") return <span>{label(value)}</span>;
  if (legacy) {
    return (
      <span
        className="text-muted-foreground"
        title="Catégorie d'avant la refonte v2 — à reclasser"
      >
        {label(legacy)}
        <span className="ml-1 text-xs">(à reclasser)</span>
      </span>
    );
  }
  if (value) return <span>{label(value)}</span>;
  return <span className="text-muted-foreground">—</span>;
};

const ArrField = ({ currency }: { currency: string }) => {
  const record = useRecordContext<Deal>();
  if (!record) return null;
  return (
    <span className="inline-flex items-center gap-1">
      {formatCurrency(record.amount, currency)}
      <ManualArrIndicator />
    </span>
  );
};

const DateField = ({ source }: { source: "expected_closing_date" }) => {
  const record = useRecordContext<Deal>();
  const value = record?.[source];
  if (!value) return <span className="text-muted-foreground">–</span>;
  return <span>{formatISODateString(value)}</span>;
};

/** Small marker telling apart a typed ARR from one suggested by the ARR grid. */
export const ManualArrIndicator = ({
  className = "",
}: {
  className?: string;
}) => {
  const record = useRecordContext<Deal>();
  if (!record?.arr_is_manual) return null;
  return (
    <span
      title="Valeur saisie manuellement — le préremplissage ne l'écrasera pas"
      className={`text-[10px] font-medium leading-none text-muted-foreground border rounded px-1 py-0.5 ${className}`}
    >
      manuel
    </span>
  );
};
