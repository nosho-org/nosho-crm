import { useQueryClient } from "@tanstack/react-query";
import {
  DragDropContext,
  Droppable,
  type OnDragEndResponder,
} from "@hello-pangea/dnd";
import isEqual from "lodash/isEqual";
import {
  useCanAccess,
  useDataProvider,
  useGetIdentity,
  useListContext,
  type DataProvider,
} from "ra-core";
import { createContext, useContext, useEffect, useState } from "react";
import { useLocation } from "react-router";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Deal } from "../types";
import { DealColumn } from "./DealColumn";
import type { DealsByStage } from "./stages";
import { getDealsByStage } from "./stages";

const CUSTOM_VIEW_DROPPABLE_PREFIX = "custom-view:";
const DEFAULT_VIEW_DROPPABLE_ID = `${CUSTOM_VIEW_DROPPABLE_PREFIX}__default__`;

interface DealListViewContextValue {
  initialVisibleStages?: string[];
  companyType?: string;
}
export const DealListViewContext = createContext<DealListViewContextValue>({});
export const DealListViewProvider = DealListViewContext.Provider;

export const DealListContent = () => {
  const { customViews, dealStages } = useConfigurationContext();
  const { initialVisibleStages } = useContext(DealListViewContext);
  const { data: unorderedDeals, isPending } = useListContext<Deal>();
  const dataProvider = useDataProvider();
  const queryClient = useQueryClient();
  const location = useLocation();
  const { identity } = useGetIdentity();
  const { canAccess: isAdmin } = useCanAccess({
    resource: "configuration",
    action: "edit",
  });
  const storageKey = `dealListVisibleStages:${location.pathname}`;
  const currentSaleId = identity?.id as number | undefined;
  const visibleCustomViews = customViews.filter(
    (view) =>
      isAdmin ||
      !view.allowedUserIds?.length ||
      (currentSaleId != null && view.allowedUserIds.includes(currentSaleId)),
  );

  const [dealsByStage, setDealsByStage] = useState<DealsByStage>(
    getDealsByStage([], dealStages),
  );

  // Use saved preference from localStorage, then initialVisibleStages, then all stages
  const [visibleStages, setVisibleStages] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        const valid = parsed.filter((s) =>
          dealStages.some((ds) => ds.value === s),
        );
        if (valid.length > 0) return new Set(valid);
      }
    } catch {
      // Ignore malformed or unavailable localStorage preferences.
    }
    return initialVisibleStages
      ? new Set(initialVisibleStages)
      : new Set(dealStages.map((s) => s.value));
  });

  const toggleStage = (stageValue: string) => {
    setVisibleStages((prev) => {
      const next = new Set(prev);
      if (next.has(stageValue)) {
        if (next.size === 1) return prev; // keep at least one visible
        next.delete(stageValue);
      } else {
        next.add(stageValue);
      }
      try {
        localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        // Ignore unavailable localStorage.
      }
      return next;
    });
  };

  useEffect(() => {
    if (unorderedDeals) {
      const newDealsByStage = getDealsByStage(unorderedDeals, dealStages);
      if (!isEqual(newDealsByStage, dealsByStage)) {
        setDealsByStage(newDealsByStage);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unorderedDeals]);

  if (isPending) return null;

  const onDragEnd: OnDragEndResponder = (result) => {
    const { destination, source } = result;

    if (!destination) {
      return;
    }

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    const sourceStage = source.droppableId;
    const sourceDeal = dealsByStage[sourceStage][source.index]!;

    if (destination.droppableId.startsWith(CUSTOM_VIEW_DROPPABLE_PREFIX)) {
      const targetCompanyType =
        destination.droppableId === DEFAULT_VIEW_DROPPABLE_ID
          ? null
          : (visibleCustomViews.find(
              (view) =>
                `${CUSTOM_VIEW_DROPPABLE_PREFIX}${view.id}` ===
                destination.droppableId,
            )?.companyType ?? null);

      if ((sourceDeal.company_type ?? null) === targetCompanyType) {
        return;
      }

      setDealsByStage(
        removeDealFromStageLocal(sourceStage, source.index, dealsByStage),
      );

      updateDealCompanyType(sourceDeal, targetCompanyType, dataProvider).then(
        () => {
          queryClient.invalidateQueries({ queryKey: ["deals", "getList"] });
        },
      );
      return;
    }

    const destinationStage = destination.droppableId;
    const destinationDeal = dealsByStage[destinationStage][
      destination.index
    ] ?? {
      stage: destinationStage,
      index: undefined, // undefined if dropped after the last item
    };

    // compute local state change synchronously
    setDealsByStage(
      updateDealStageLocal(
        sourceDeal,
        { stage: sourceStage, index: source.index },
        { stage: destinationStage, index: destination.index },
        dealsByStage,
      ),
    );

    // persist the changes and invalidate all deal list caches (all views)
    updateDealStage(sourceDeal, destinationDeal, dataProvider).then(() => {
      queryClient.invalidateQueries({ queryKey: ["deals", "getList"] });
    });
  };

  const visibleDealStages = dealStages.filter((s) =>
    visibleStages.has(s.value),
  );

  return (
    <div className="flex flex-col gap-4">
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex flex-col gap-3">
          {visibleCustomViews.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Déplacer vers
              </span>
              <ViewDropTarget
                droppableId={DEFAULT_VIEW_DROPPABLE_ID}
                label="Opportunités"
              />
              {visibleCustomViews.map((view) => (
                <ViewDropTarget
                  key={view.id}
                  droppableId={`${CUSTOM_VIEW_DROPPABLE_PREFIX}${view.id}`}
                  label={view.label}
                />
              ))}
            </div>
          )}

          {/* Stage filter toggles */}
          <div className="flex flex-wrap gap-2 pb-1">
            {dealStages.map((stage) => {
              const isVisible = visibleStages.has(stage.value);
              const count = dealsByStage[stage.value]?.length ?? 0;
              return (
                <button
                  key={stage.value}
                  onClick={() => toggleStage(stage.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                    isVisible
                      ? "bg-[var(--nosho-orange)]/10 border-[var(--nosho-orange)]/40 text-[var(--nosho-orange-dark)]"
                      : "bg-muted/50 border-border text-muted-foreground/50 line-through"
                  }`}
                >
                  <span>{stage.label}</span>
                  {count > 0 && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        isVisible
                          ? "bg-[var(--nosho-orange)]/20 text-[var(--nosho-orange-dark)]"
                          : "bg-muted text-muted-foreground/50"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
            {visibleStages.size < dealStages.length && (
              <button
                onClick={() => {
                  const all = new Set(dealStages.map((s) => s.value));
                  setVisibleStages(all);
                  try {
                    localStorage.setItem(storageKey, JSON.stringify([...all]));
                  } catch {
                    // Ignore unavailable localStorage.
                  }
                }}
                className="px-3 py-1.5 rounded-full text-xs font-medium text-[var(--nosho-green-dark)] bg-[var(--nosho-green)]/10 border border-[var(--nosho-green)]/30 transition-all hover:bg-[var(--nosho-green)]/20"
              >
                Tout afficher
              </button>
            )}
          </div>
        </div>

        {/* Kanban columns */}
        <div className="flex gap-4 overflow-auto pb-4 h-[calc(100dvh-14rem)] min-h-[420px]">
          {visibleDealStages.map((stage) => (
            <DealColumn
              stage={stage.value}
              deals={dealsByStage[stage.value]}
              key={stage.value}
            />
          ))}
        </div>
      </DragDropContext>
    </div>
  );
};

const ViewDropTarget = ({
  droppableId,
  label,
}: {
  droppableId: string;
  label: string;
}) => (
  <Droppable droppableId={droppableId} direction="horizontal">
    {(provided, snapshot) => (
      <div
        ref={provided.innerRef}
        {...provided.droppableProps}
        className={`flex items-center min-h-8 px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
          snapshot.isDraggingOver
            ? "bg-[var(--nosho-green)]/15 border-[var(--nosho-green)] text-[var(--nosho-green-dark)]"
            : "bg-muted/40 border-border text-muted-foreground"
        }`}
      >
        {label}
        <div className="hidden">{provided.placeholder}</div>
      </div>
    )}
  </Droppable>
);

const removeDealFromStageLocal = (
  sourceStage: string,
  sourceIndex: number,
  dealsByStage: DealsByStage,
) => {
  const sourceColumn = [...dealsByStage[sourceStage]];
  sourceColumn.splice(sourceIndex, 1);

  return {
    ...dealsByStage,
    [sourceStage]: sourceColumn,
  };
};

const updateDealStageLocal = (
  sourceDeal: Deal,
  source: { stage: string; index: number },
  destination: {
    stage: string;
    index?: number; // undefined if dropped after the last item
  },
  dealsByStage: DealsByStage,
) => {
  if (source.stage === destination.stage) {
    // moving deal inside the same column
    const column = dealsByStage[source.stage];
    column.splice(source.index, 1);
    column.splice(destination.index ?? column.length + 1, 0, sourceDeal);
    return {
      ...dealsByStage,
      [destination.stage]: column,
    };
  } else {
    // moving deal across columns
    const sourceColumn = dealsByStage[source.stage];
    const destinationColumn = dealsByStage[destination.stage];
    sourceColumn.splice(source.index, 1);
    destinationColumn.splice(
      destination.index ?? destinationColumn.length + 1,
      0,
      sourceDeal,
    );
    return {
      ...dealsByStage,
      [source.stage]: sourceColumn,
      [destination.stage]: destinationColumn,
    };
  }
};

const updateDealStage = async (
  source: Deal,
  destination: {
    stage: string;
    index?: number; // undefined if dropped after the last item
  },
  dataProvider: DataProvider,
) => {
  if (source.stage === destination.stage) {
    // moving deal inside the same column
    // Fetch all the deals in this stage (because the list may be filtered, but we need to update even non-filtered deals)
    const { data: columnDeals } = await dataProvider.getList("deals", {
      sort: { field: "index", order: "ASC" },
      pagination: { page: 1, perPage: 1000 },
      filter: { stage: source.stage },
    });
    const destinationIndex = destination.index ?? columnDeals.length + 1;

    if (source.index > destinationIndex) {
      // deal moved up, eg
      // dest   src
      //  <------
      // [4, 7, 23, 5]
      await Promise.all([
        // for all deals between destinationIndex and source.index, increase the index
        ...columnDeals
          .filter(
            (deal) =>
              deal.index >= destinationIndex && deal.index < source.index,
          )
          .map((deal) =>
            dataProvider.update("deals", {
              id: deal.id,
              data: { index: deal.index + 1 },
              previousData: deal,
            }),
          ),
        // for the deal that was moved, update its index
        dataProvider.update("deals", {
          id: source.id,
          data: { index: destinationIndex },
          previousData: source,
        }),
      ]);
    } else {
      // deal moved down, e.g
      // src   dest
      //  ------>
      // [4, 7, 23, 5]
      await Promise.all([
        // for all deals between source.index and destinationIndex, decrease the index
        ...columnDeals
          .filter(
            (deal) =>
              deal.index <= destinationIndex && deal.index > source.index,
          )
          .map((deal) =>
            dataProvider.update("deals", {
              id: deal.id,
              data: { index: deal.index - 1 },
              previousData: deal,
            }),
          ),
        // for the deal that was moved, update its index
        dataProvider.update("deals", {
          id: source.id,
          data: { index: destinationIndex },
          previousData: source,
        }),
      ]);
    }
  } else {
    // moving deal across columns
    // Fetch all the deals in both stages (because the list may be filtered, but we need to update even non-filtered deals)
    const [{ data: sourceDeals }, { data: destinationDeals }] =
      await Promise.all([
        dataProvider.getList("deals", {
          sort: { field: "index", order: "ASC" },
          pagination: { page: 1, perPage: 1000 },
          filter: { stage: source.stage },
        }),
        dataProvider.getList("deals", {
          sort: { field: "index", order: "ASC" },
          pagination: { page: 1, perPage: 1000 },
          filter: { stage: destination.stage },
        }),
      ]);
    const destinationIndex = destination.index ?? destinationDeals.length + 1;

    await Promise.all([
      // decrease index on the deals after the source index in the source columns
      ...sourceDeals
        .filter((deal) => deal.index > source.index)
        .map((deal) =>
          dataProvider.update("deals", {
            id: deal.id,
            data: { index: deal.index - 1 },
            previousData: deal,
          }),
        ),
      // increase index on the deals after the destination index in the destination columns
      ...destinationDeals
        .filter((deal) => deal.index >= destinationIndex)
        .map((deal) =>
          dataProvider.update("deals", {
            id: deal.id,
            data: { index: deal.index + 1 },
            previousData: deal,
          }),
        ),
      // change the dragged deal to take the destination index and column
      dataProvider.update("deals", {
        id: source.id,
        data: {
          index: destinationIndex,
          stage: destination.stage,
        },
        previousData: source,
      }),
    ]);
  }
};

const updateDealCompanyType = async (
  source: Deal,
  companyType: string | null,
  dataProvider: DataProvider,
) => {
  await dataProvider.update("deals", {
    id: source.id,
    data: { company_type: companyType },
    previousData: source,
  });
};
