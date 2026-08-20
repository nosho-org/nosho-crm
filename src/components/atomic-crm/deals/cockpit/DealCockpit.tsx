import { Info, KanbanSquare, List as ListIcon, RefreshCw } from "lucide-react";
import { useListContext, useRefresh, useStore } from "ra-core";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { DealCockpitFilters } from "./DealCockpitFilters";
import { DealCockpitProvider, useDealCockpit } from "./DealCockpitContext";
import { DealForecastTable } from "./DealForecastTable";
import { DealInactivityAlert } from "./DealInactivityAlert";
import { DealRevenueBanner } from "./DealRevenueBanner";
import { DealTable } from "./DealTable";

export type DealViewMode = "board" | "list";

/**
 * Warns when the figures describe fewer deals than exist. A total computed on
 * a truncated page is not the total, and the banner must not imply otherwise.
 */
const TruncationNotice = () => {
  const { truncated } = useDealCockpit();
  if (!truncated) return null;
  return (
    <p className="text-xs text-[var(--deal-status-serious)] inline-flex items-start gap-1.5">
      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
      Montants calculés sur les {truncated.loaded} opportunités chargées, sur{" "}
      {truncated.total} au total. Affinez les filtres pour un chiffre complet.
    </p>
  );
};

const CockpitHeader = ({
  viewMode,
  onViewModeChange,
}: {
  viewMode: DealViewMode;
  onViewModeChange: (mode: DealViewMode) => void;
}) => {
  const { isFetching } = useListContext();
  const refresh = useRefresh();
  const { deals, queriedDeals } = useDealCockpit();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-col">
        <h2 className="text-lg font-semibold">Pilotage des opportunités</h2>
        <span className="text-xs text-muted-foreground">
          {deals.length} opportunité{deals.length > 1 ? "s" : ""} dans la
          sélection
          {deals.length !== queriedDeals.length &&
            ` (sur ${queriedDeals.length} chargées)`}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refresh()}
          disabled={isFetching}
          aria-label="Actualiser les données"
        >
          <RefreshCw
            className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`}
          />
          Actualiser
        </Button>
        <ToggleGroup
          type="single"
          size="sm"
          value={viewMode}
          onValueChange={(value) =>
            value && onViewModeChange(value as DealViewMode)
          }
          aria-label="Mode d'affichage"
        >
          <ToggleGroupItem value="board" aria-label="Vue tableau de bord">
            <KanbanSquare className="w-4 h-4" />
            Colonnes
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="Vue liste">
            <ListIcon className="w-4 h-4" />
            Liste
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  );
};

const CockpitLayout = ({ board }: { board: ReactNode }) => {
  const [viewMode, setViewMode] = useStore<DealViewMode>(
    "deals.viewMode",
    "board",
  );

  return (
    <div className="flex flex-col gap-4 w-full">
      <CockpitHeader viewMode={viewMode} onViewModeChange={setViewMode} />
      <DealRevenueBanner />
      <TruncationNotice />
      <DealInactivityAlert />
      <DealForecastTable />
      <DealCockpitFilters />
      {viewMode === "list" ? <DealTable /> : board}
    </div>
  );
};

/**
 * Wraps the Opportunités screen: revenue banner, forecast, filters, then either
 * the existing kanban board or the dense list. Everything inside describes the
 * one selection computed by `DealCockpitProvider`.
 */
export const DealCockpit = ({ board }: { board: ReactNode }) => (
  <DealCockpitProvider>
    <CockpitLayout board={board} />
  </DealCockpitProvider>
);
