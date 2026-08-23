import { useRecordContext } from "ra-core";
import { ReferenceField } from "@/components/admin/reference-field";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

import { useConfigurationContext } from "../../root/ConfigurationContext";
import { arrToMrr, formatCurrency } from "../../misc/formatCurrency";
import type { Deal } from "../../types";
import { UNKNOWN } from "../cockpit/dealFormat";
import { isClosedStage } from "../cockpit/dealFields";
import { formatISODateString } from "../dealUtils";
import { DealProductBadges } from "../shared/DealBadges";

/**
 * ---------------------------------------------------------------------------
 * Synthèse de l'opportunité (NOS-957 §3)
 * ---------------------------------------------------------------------------
 * Three sub-blocks rather than a flat list of fields, "afin d'éviter une
 * succession de champs sans hiérarchie": what it is worth and when, what kind
 * of deal it is, and where it came from.
 *
 * Missing values render "—". Never `0 €`, never a made-up date: "Ne pas
 * afficher 0 € ou une fausse date lorsqu'une donnée n'existe pas."
 */

const Field = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-0.5 min-w-0">
    <span className="text-xs uppercase tracking-wide text-muted-foreground">
      {label}
    </span>
    <span className="text-sm font-medium">{children}</span>
  </div>
);

const SubBlock = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-3">
    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--deal-series-potential)]">
      {title}
    </span>
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {children}
    </div>
  </div>
);

const labelOf = (
  choices: { value: string; label: string }[] | undefined,
  value: string | null | undefined,
) => choices?.find((choice) => choice.value === value)?.label ?? null;

export const DealSynthesis = () => {
  const record = useRecordContext<Deal>();
  const {
    dealCategories,
    archivedDealCategories,
    dealOpportunityTypes,
    dealPipelineStatuses,
    leadSources,
    currency,
  } = useConfigurationContext();

  if (!record) return null;

  const mrr =
    typeof record.mrr === "number" ? record.mrr : arrToMrr(record.amount);

  // A closed deal cannot be late: it is done, whatever the date said it would be.
  const isOverdue =
    !!record.expected_closing_date &&
    !isClosedStage(record.stage, dealPipelineStatuses) &&
    new Date(record.expected_closing_date) < new Date();

  const category =
    labelOf(dealCategories, record.category) ??
    labelOf(archivedDealCategories, record.category) ??
    record.category;

  return (
    <Card className="p-4 flex flex-col gap-5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Synthèse de l'opportunité
      </span>

      <SubBlock title="Valeur & timing">
        <Field label="ARR annuel">
          {record.amount != null
            ? formatCurrency(record.amount, currency)
            : UNKNOWN}
        </Field>
        <Field label="MRR calculé">
          {mrr != null ? formatCurrency(mrr, currency) : UNKNOWN}
        </Field>
        <Field label="Clôture prévue">
          {record.expected_closing_date ? (
            <span className="inline-flex flex-col gap-1 items-start">
              <span
                style={
                  isOverdue
                    ? { color: "var(--deal-status-critical)" }
                    : undefined
                }
              >
                {formatISODateString(record.expected_closing_date)}
              </span>
              {isOverdue && (
                <Badge
                  variant="outline"
                  className="text-[var(--deal-status-critical)] border-[var(--deal-status-critical)]"
                >
                  Dépassée
                </Badge>
              )}
            </span>
          ) : (
            UNKNOWN
          )}
        </Field>
        <Field label="Date entrée">
          {record.entered_at ? formatISODateString(record.entered_at) : UNKNOWN}
        </Field>
        <Field label="Date signature">
          {record.won_at ? formatISODateString(record.won_at) : UNKNOWN}
        </Field>
      </SubBlock>

      <SubBlock title="Nature du deal">
        <Field label="Type d'opportunité">
          {labelOf(dealOpportunityTypes, record.opportunity_type) ?? UNKNOWN}
        </Field>
        <Field label="Produit(s)">
          {record.products?.length ? (
            <DealProductBadges products={record.products} />
          ) : (
            UNKNOWN
          )}
        </Field>
        <Field label="Catégorie">{category || UNKNOWN}</Field>
      </SubBlock>

      <SubBlock title="Origine du deal">
        <Field label="Source du lead">
          {labelOf(leadSources, record.lead_source) ?? UNKNOWN}
        </Field>
        <Field label="Apporteur">
          {record.referrer_id ? (
            <ReferenceField
              source="referrer_id"
              reference="sales"
              link={false}
            />
          ) : (
            UNKNOWN
          )}
        </Field>
      </SubBlock>
    </Card>
  );
};
