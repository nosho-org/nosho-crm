import { Draggable } from "@hello-pangea/dnd";
import { useRedirect, RecordContextProvider } from "ra-core";
import { ReferenceField } from "@/components/admin/reference-field";
import { SelectField } from "@/components/admin/select-field";
import { Card, CardContent } from "@/components/ui/card";

import { CompanyAvatar } from "../companies/CompanyAvatar";
import { formatCurrencyCompact } from "../misc/formatCurrency";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Deal } from "../types";
import { DealPriorityField } from "./DealPriorityField";
import { DealNextActionCell, DealStaleBadge } from "./cockpit/DealFieldBadges";
import { DealProductBadges } from "./shared/DealBadges";

export const DealCard = ({ deal, index }: { deal: Deal; index: number }) => {
  if (!deal) return null;

  return (
    <Draggable draggableId={String(deal.id)} index={index}>
      {(provided, snapshot) => (
        <DealCardContent provided={provided} snapshot={snapshot} deal={deal} />
      )}
    </Draggable>
  );
};

export const DealCardContent = ({
  provided,
  snapshot,
  deal,
}: {
  provided?: any;
  snapshot?: any;
  deal: Deal;
}) => {
  const { dealCategories, currency } = useConfigurationContext();
  const redirect = useRedirect();
  const handleClick = () => {
    redirect(`/deals/${deal.id}/show`, undefined, undefined, undefined, {
      _scrollToTop: false,
    });
  };

  return (
    <div
      className="cursor-pointer"
      {...provided?.draggableProps}
      {...provided?.dragHandleProps}
      ref={provided?.innerRef}
      onClick={handleClick}
    >
      <RecordContextProvider value={deal}>
        <Card
          className={`py-3 transition-all duration-200 ${
            snapshot?.isDragging
              ? "opacity-90 transform rotate-1 shadow-lg"
              : "shadow-sm hover:shadow-md"
          }`}
        >
          <CardContent className="px-3 flex flex-col">
            {/* Priority leads the card (issue #93); it is rendered by the
                socle's <DealPriorityField> just below, next to the title, so
                only the staleness signal sits on this row. */}
            <div className="flex items-center justify-end gap-2 mb-1.5">
              <DealStaleBadge deal={deal} />
            </div>
            <div className="flex-1 flex">
              <p className="flex-1 text-sm font-medium mb-2 flex items-start gap-1.5">
                <DealPriorityField labelled={false} className="mt-1.5" />
                <span>
                  <ReferenceField
                    source="company_id"
                    reference="companies"
                    link={false}
                  />
                  {" - "}
                  {deal.name}
                </span>
              </p>
              <ReferenceField
                source="company_id"
                reference="companies"
                link={false}
              >
                <CompanyAvatar width={20} height={20} />
              </ReferenceField>
            </div>
            {/* Products (NOS-956): a deal can carry several, so they get their
                own row rather than being crammed next to the amount. */}
            <DealProductBadges products={deal.products} className="mb-1.5" />
            <p className="text-xs text-muted-foreground">
              {/* Formatted here rather than via <NumberField>, which would use
                  the admin locale and render "€6K" instead of "6 k€". */}
              {formatCurrencyCompact(deal.amount, currency)}
              {deal.category && ", "}
              <SelectField
                source="category"
                choices={dealCategories}
                optionText="label"
                optionValue="value"
              />
            </p>
            {/* Next action, its date and its owner — issue #101. */}
            <div className="mt-2 pt-2 border-t border-border/60">
              <DealNextActionCell deal={deal} />
            </div>
          </CardContent>
        </Card>
      </RecordContextProvider>
    </div>
  );
};
