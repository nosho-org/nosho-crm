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
 *   Prochaine tâche | Date prochaine tâche | Responsable | Clôture prévue |
 *   Dernière activité
 *
 * MRR is deliberately gone — "ARR suffit et l'espace est plus utile pour
 * l'action commerciale". Dernière activité is not in the spec text but is in
 * the mockup, and it is what makes the dormancy alert legible from here.
 *
 * ---------------------------------------------------------------------------
 * Why every column carries a width (issue #124)
 * ---------------------------------------------------------------------------
 * The table used to lay out in `auto` mode, which sizes each column from the
 * content of the rows currently rendered. Filtering by stage changes the rows,
 * so it changed the geometry: measured on the demo dataset at a 1512 px
 * viewport, `stage=lead` overflowed by 4 px with everything on screen, while
 * `stage=qualified` overflowed by 63 px and pushed "Dernière activité" past
 * the scroll edge — and "Responsable" went from 98 px to 147 px on the way.
 * The reporter read that as columns appearing and disappearing depending on
 * the stage, which is exactly what it was.
 *
 * `table-fixed` plus a width on every column makes the layout a property of
 * the screen rather than of the rows: same columns, same widths, same scroll,
 * whatever the filter. Cells truncate instead of widening, and `min-w`
 * guarantees the headers stay readable on a narrow window — where the table
 * scrolls by the same amount for every stage.
 */

/**
 * Column widths, in pixels, summing to the table's `min-w`.
 *
 * Sized so each header fits without being clipped; the text-heavy columns get
 * whatever is left. Above the `min-w` the browser stretches them all
 * proportionally, which is still stage-independent.
 */
const COLUMN_WIDTHS = {
  priority: "w-[100px]",
  name: "w-[140px]",
  company: "w-[116px]",
  stage: "w-[84px]",
  products: "w-[124px]",
  amount: "w-[104px]",
  nextAction: "w-[120px]",
  nextActionDate: "w-[140px]",
  category: "w-[88px]",
  sales: "w-[108px]",
  // NOS-1015. Ajoutée après « Clôture prévue » : les deux dates de vie de
  // l'opportunité se lisent côte à côte, et l'écart entre elles est justement
  // ce qu'on vient regarder. Même largeur que sa voisine, même en-tête court.
  enteredAt: "w-[100px]",
  closingDate: "w-[100px]",
  // Widest header of the lot, and it is last: anything narrower and the label
  // is the one thing clipped on an otherwise complete row.
  lastActivity: "w-[136px]",
} as const;

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
      // <DataTable> puts its own className on the wrapper and renders <Table>
      // with no way through, so the layout lands on the nested table.
      //
      // 1492px = 1392 + les 100 de « Date entrée » (NOS-1015). Ce `min-w` doit
      // suivre `COLUMN_WIDTHS` : c'est en le laissant en arrière qu'#124 avait
      // fait disparaître « Dernière activité » du bout de la ligne.
      className="[&_table]:table-fixed [&_table]:min-w-[1492px]"
    >
      <DataTable.Col
        source="priority_rank"
        label="Priorité"
        headerClassName={COLUMN_WIDTHS.priority}
      >
        <DealPriorityField />
      </DataTable.Col>
      <DataTable.Col
        source="name"
        label="Opportunité"
        headerClassName={COLUMN_WIDTHS.name}
        cellClassName="truncate"
      />
      <DataTable.Col
        source="company_id"
        label="Société"
        headerClassName={COLUMN_WIDTHS.company}
        cellClassName="truncate"
      >
        <ReferenceField
          source="company_id"
          reference="companies"
          link={false}
        />
      </DataTable.Col>
      <DataTable.Col
        source="stage"
        label="Étape"
        headerClassName={COLUMN_WIDTHS.stage}
        cellClassName="truncate"
      >
        <StageField stages={dealStages} />
      </DataTable.Col>
      <DataTable.Col
        label="Produit(s)"
        headerClassName={COLUMN_WIDTHS.products}
        cellClassName="truncate"
      >
        <ProductsField />
      </DataTable.Col>
      <DataTable.Col
        source="amount"
        label="ARR"
        headerClassName={`text-right ${COLUMN_WIDTHS.amount}`}
        cellClassName="text-right tabular-nums truncate"
      >
        <ArrField currency={currency} />
      </DataTable.Col>
      <DataTable.Col
        source="next_action"
        label="Prochaine action"
        headerClassName={COLUMN_WIDTHS.nextAction}
        cellClassName="truncate"
      >
        <NextActionField />
      </DataTable.Col>
      <DataTable.Col
        source="next_action_date"
        label="Date prochaine action"
        headerClassName={COLUMN_WIDTHS.nextActionDate}
        cellClassName="truncate"
      >
        <NextActionDateField />
      </DataTable.Col>
      <DataTable.Col
        source="category"
        label="Catégorie"
        headerClassName={COLUMN_WIDTHS.category}
        cellClassName="truncate"
      >
        <ChoiceField choices={dealCategories} source="category" />
      </DataTable.Col>
      <DataTable.Col
        source="sales_id"
        label="Responsable"
        headerClassName={COLUMN_WIDTHS.sales}
        cellClassName="truncate"
      >
        <ReferenceField source="sales_id" reference="sales" link={false} />
      </DataTable.Col>
      <DataTable.Col
        source="entered_at"
        label="Date entrée"
        headerClassName={COLUMN_WIDTHS.enteredAt}
        cellClassName="truncate"
      >
        <DateField source="entered_at" />
      </DataTable.Col>
      <DataTable.Col
        source="expected_closing_date"
        label="Clôture prévue"
        headerClassName={COLUMN_WIDTHS.closingDate}
        cellClassName="truncate"
      >
        <DateField source="expected_closing_date" />
      </DataTable.Col>
      <DataTable.Col
        source="last_activity_at"
        label="Dernière activité"
        headerClassName={COLUMN_WIDTHS.lastActivity}
        cellClassName="text-right truncate"
      >
        <LastActivityField />
      </DataTable.Col>
    </DataTable>
  );
};

/**
 * Products carried by the deal, in the shared badge style.
 *
 * `flex-nowrap` because the column has a fixed width now (issue #124): left to
 * wrap, a deal carrying all three products made its row twice as tall as its
 * neighbours. The badges clip instead, and the full list is one click away on
 * the deal page.
 */
const ProductsField = () => {
  const record = useRecordContext<Deal>();
  if (!record) return null;
  return <DealProductBadges products={record.products} wrap={false} />;
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

const DateField = ({
  source,
}: {
  source: "expected_closing_date" | "entered_at";
}) => {
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
