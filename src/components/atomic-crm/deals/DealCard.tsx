import { Draggable } from "@hello-pangea/dnd";
import { useRedirect, RecordContextProvider } from "ra-core";
import { ReferenceField } from "@/components/admin/reference-field";
import { SelectField } from "@/components/admin/select-field";
import { Card, CardContent } from "@/components/ui/card";

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
            {/*
              La priorité ouvre la carte, écrite (NOS-1068).

              Elle était un point de 8 px avec son libellé en `sr-only` : rien
              à lire pour qui ne connaît pas le code couleur, et un niveau P0
              indiscernable d'un P2 à distance. « P0 » écrit tient dans la même
              place et se lit sans apprentissage.
            */}
            <div className="flex items-center gap-2 mb-1.5">
              <DealPriorityField compact />
              <span className="flex-1" />
              <DealStaleBadge deal={deal} />
            </div>
            <div className="flex-1 flex">
              {/*
                L'avatar de la société a été retiré ici. Il n'affichait qu'une
                initiale, souvent la même d'une carte à l'autre dans une même
                colonne, alors que le nom de la société est écrit juste à côté
                du nom de l'opportunité — l'information était déjà là, en clair.
              */}
              <p className="flex-1 text-sm font-medium mb-2">
                <ReferenceField
                  source="company_id"
                  reference="companies"
                  link={false}
                />
                {" - "}
                {deal.name}
              </p>
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
