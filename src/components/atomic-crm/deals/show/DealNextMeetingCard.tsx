import { CalendarClock } from "lucide-react";
import { useRecordContext } from "ra-core";
import { Card } from "@/components/ui/card";

import { useConfigurationContext } from "../../root/ConfigurationContext";
import type { Deal } from "../../types";
import { formatDealMeetingDate } from "../dealUtils";
import { getNextMeetingTask } from "../nextMeetingTask";
import { useDealTasks } from "./useDealTasks";

/**
 * ---------------------------------------------------------------------------
 * Prochain meeting (issue #99, remounted by #114)
 * ---------------------------------------------------------------------------
 * "When is my next appointment with this client" is not a question the flat
 * task list answers at a glance, which is why this stays its own line rather
 * than being folded into the "Tâches" block below.
 *
 * Read-only and purely derived: only task types that denote a real appointment
 * qualify (`meeting`, `demo`, `lunch` — see `nextMeetingTask.ts`), and when
 * none exists the card renders nothing rather than inventing a placeholder
 * date.
 *
 * Shipped in #99, silently unmounted by `8dd2513e`, and remounted here on
 * `useDealTasks` — so it reaches tasks the same way every other block does
 * (`deal_id` OR one of the deal's contacts) instead of the `contact_id`-only
 * filter it used to carry, which missed tasks attached straight to the deal.
 */
export const DealNextMeetingCard = () => {
  const record = useRecordContext<Deal>();
  const { taskTypes } = useConfigurationContext();
  // Same arguments as the blocks above, so React Query serves all of them from
  // one cache entry rather than issuing another request.
  const { tasks, isPending } = useDealTasks(record);

  if (!record || isPending) return null;

  const nextMeeting = getNextMeetingTask(tasks.map(({ task }) => task));
  if (!nextMeeting) return null;

  const typeLabel = taskTypes.find(
    (type) => type.value === nextMeeting.type,
  )?.label;

  return (
    <Card className="p-4 flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Prochain meeting
      </span>
      <div className="flex items-center gap-1.5">
        <CalendarClock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-sm">
          {formatDealMeetingDate(nextMeeting.due_date)}
        </span>
      </div>
      <span
        className="text-xs text-muted-foreground line-clamp-2"
        title={nextMeeting.text}
      >
        {typeLabel ? `${typeLabel} · ` : ""}
        {nextMeeting.text}
      </span>
    </Card>
  );
};
