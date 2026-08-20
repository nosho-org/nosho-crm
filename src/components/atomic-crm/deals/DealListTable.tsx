import { useListContext, useRecordContext } from "ra-core";
import { DataTable } from "@/components/admin/data-table";
import { ReferenceField } from "@/components/admin/reference-field";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { formatCurrency } from "../misc/formatCurrency";
import type { Deal } from "../types";
import { DealPriorityField } from "./DealPriorityField";
import { findDealLabel } from "./deal";
import { formatISODateString } from "./dealUtils";

/**
 * Row-by-row view of the opportunities (NOS-798).
 *
 * Complements the Kanban board rather than replacing it: the toggle in
 * <DealListContent> switches between the two and remembers the choice.
 */
export const DealListTable = () => {
  const { dealStages, dealCategories, currency } = useConfigurationContext();
  const { data } = useListContext<Deal>();

  if (!data?.length) return null;

  return (
    <DataTable rowClick="show">
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
      <DataTable.Col
        source="amount"
        label="ARR"
        headerClassName="text-right"
        cellClassName="text-right tabular-nums"
      >
        <ArrField currency={currency} />
      </DataTable.Col>
      <DataTable.Col
        source="mrr"
        label="MRR"
        headerClassName="text-right"
        cellClassName="text-right tabular-nums"
      >
        <MrrField currency={currency} />
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
    </DataTable>
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

const ChoiceField = ({
  choices,
  source,
}: {
  choices: { value: string; label: string }[];
  source: "category";
}) => {
  const record = useRecordContext<Deal>();
  const value = record?.[source];
  if (!value) return null;
  return <span>{choices.find((c) => c.value === value)?.label ?? value}</span>;
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

const MrrField = ({ currency }: { currency: string }) => {
  const record = useRecordContext<Deal>();
  if (!record) return null;
  // `mrr` is a generated column; fall back to the ARR for records that predate
  // it (FakeRest fixtures, optimistic updates).
  const mrr = record.mrr ?? (record.amount != null ? record.amount / 12 : null);
  return (
    <span className="text-muted-foreground">
      {formatCurrency(mrr, currency)}
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
