import { AlertTriangle, CalendarClock, CircleDashed, User } from "lucide-react";
import { useReference, type Identifier } from "ra-core";

import type { Sale } from "../../types";
import type { DealActivity, DealNextAction, DealPriority } from "./dealFields";
import {
  getDealActivity,
  getDealNextAction,
  getDealPriorityChoice,
} from "./dealFields";
import type { DealRecord } from "./dealFields";
import {
  UNKNOWN,
  formatDate,
  formatDaysAgo,
  formatDaysUntil,
} from "./dealFormat";
import { useDealFieldOptions } from "./DealCockpitContext";

/**
 * ---------------------------------------------------------------------------
 * Shared deal cells
 * ---------------------------------------------------------------------------
 * The board cards (issue #101) and the dense list (issues #92/#93) render the
 * *same* components over the *same* adapter output. There is no second copy of
 * the "what's next" logic, so a card and its row can never disagree.
 *
 * Every one of them renders an explicit empty state when the underlying field
 * is missing, rather than collapsing to blank space.
 */

const PRIORITY_STYLES: Record<DealPriority, { dot: string; text: string }> = {
  urgent: {
    dot: "bg-[var(--deal-status-critical)]",
    text: "text-[var(--deal-status-critical)]",
  },
  important: {
    dot: "bg-[var(--deal-status-serious)]",
    text: "text-[var(--deal-status-serious)]",
  },
  // Normal is the baseline, not a status: it stays in neutral ink.
  normal: { dot: "bg-muted-foreground/60", text: "text-muted-foreground" },
};

export const DealPriorityBadge = ({
  deal,
  className = "",
}: {
  deal: DealRecord;
  className?: string;
}) => {
  const choice = getDealPriorityChoice(deal);

  if (!choice) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs text-muted-foreground/70 ${className}`}
        title="Aucune priorité enregistrée sur cette opportunité"
      >
        <CircleDashed className="w-3 h-3 shrink-0" aria-hidden />
        Non définie
      </span>
    );
  }

  const styles = PRIORITY_STYLES[choice.value];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${styles.text} ${className}`}
    >
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${styles.dot}`}
        aria-hidden
      />
      {choice.label}
    </span>
  );
};

const OwnerName = ({ id }: { id: Identifier }) => {
  const { referenceRecord, isPending } = useReference<Sale>({
    reference: "sales",
    id,
  });
  if (isPending) return <>…</>;
  if (!referenceRecord) return <>{UNKNOWN}</>;
  return (
    <>
      {referenceRecord.first_name} {referenceRecord.last_name}
    </>
  );
};

export const DealOwner = ({
  ownerId,
  className = "",
  title,
}: {
  ownerId: Identifier | null;
  className?: string;
  title?: string;
}) => (
  <span
    className={`inline-flex items-center gap-1 text-xs text-muted-foreground min-w-0 ${className}`}
    title={title}
  >
    <User className="w-3 h-3 shrink-0" aria-hidden />
    <span className="truncate">
      {ownerId == null ? "Non attribuée" : <OwnerName id={ownerId} />}
    </span>
  </span>
);

const NEXT_ACTION_DATE_STYLES: Record<DealNextAction["status"], string> = {
  overdue: "text-[var(--deal-status-critical)] font-medium",
  today: "text-[var(--deal-status-serious)] font-medium",
  upcoming: "text-muted-foreground",
  undated: "text-muted-foreground",
  missing: "text-muted-foreground",
  "not-expected": "text-muted-foreground",
};

/** Next action + date + owner, from the single `getDealNextAction` datum. */
export const DealNextActionCell = ({ deal }: { deal: DealRecord }) => {
  const { nextActionOptions } = useDealFieldOptions();
  const action = getDealNextAction(deal, nextActionOptions);

  if (action.status === "not-expected") {
    return (
      <span className="text-xs text-muted-foreground/70">
        Pas encore requise
      </span>
    );
  }

  if (action.status === "missing") {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-[var(--deal-status-serious)]"
        title="Aucune prochaine action définie à partir de l'étape Qualifié"
      >
        <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden />À définir
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-xs text-foreground truncate" title={action.label!}>
        {action.label}
      </span>
      <span className="flex items-center gap-2 flex-wrap">
        <span
          className={`inline-flex items-center gap-1 text-xs ${NEXT_ACTION_DATE_STYLES[action.status]}`}
        >
          <CalendarClock className="w-3 h-3 shrink-0" aria-hidden />
          {action.date ? formatDate(action.date) : "Sans date"}
          {action.daysUntil !== null && (
            <span className="text-muted-foreground">
              ({formatDaysUntil(action.daysUntil)})
            </span>
          )}
        </span>
        <DealOwner
          ownerId={action.ownerId}
          title={
            action.ownerIsDealOwner
              ? "Responsable de l'opportunité"
              : "Responsable de la prochaine action"
          }
        />
      </span>
    </div>
  );
};

/**
 * Last activity. The label states which column the value came from: until the
 * activity log lands, this is the last write on the deal, and calling that
 * "activité" without qualification would overstate it.
 */
const ACTIVITY_LABELS: Record<DealActivity["source"], string> = {
  last_activity_at: "Dernière activité",
  updated_at: "Dernière modification de l'opportunité",
  created_at: "Création de l'opportunité",
  none: "Aucune date connue",
};

export const DealActivityCell = ({ deal }: { deal: DealRecord }) => {
  const { activityOptions, inactivityThresholdDays } = useDealFieldOptions();
  const activity = getDealActivity(deal, activityOptions);

  if (activity.daysSinceActivity === null) {
    return <span className="text-xs text-muted-foreground/70">{UNKNOWN}</span>;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs ${
        activity.isStale
          ? "text-[var(--deal-status-serious)] font-medium"
          : "text-muted-foreground"
      }`}
      title={`${ACTIVITY_LABELS[activity.source]} : ${formatDate(activity.date)}${
        activity.isStale
          ? ` — sans activité depuis au moins ${inactivityThresholdDays} jours`
          : ""
      }`}
    >
      {activity.isStale ? (
        <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden />
      ) : (
        <span
          className="w-2 h-2 rounded-full bg-muted-foreground/40 shrink-0"
          aria-hidden
        />
      )}
      {formatDaysAgo(activity.daysSinceActivity)}
    </span>
  );
};

/** Compact dormancy marker for the board cards. */
export const DealStaleBadge = ({ deal }: { deal: DealRecord }) => {
  const { activityOptions, inactivityThresholdDays } = useDealFieldOptions();
  const { isStale, daysSinceActivity } = getDealActivity(deal, activityOptions);
  if (!isStale) return null;

  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--deal-status-warning)]/15 text-[var(--deal-status-serious)]"
      title={`Sans activité depuis ${daysSinceActivity} jours (seuil : ${inactivityThresholdDays} jours)`}
    >
      <AlertTriangle className="w-2.5 h-2.5 shrink-0" aria-hidden />
      Dormante
    </span>
  );
};
