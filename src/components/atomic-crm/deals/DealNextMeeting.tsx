import { CalendarClock } from "lucide-react";
import { useGetList } from "ra-core";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Task } from "../types";
import { getNextMeetingTask } from "./dealNextMeeting";
import { formatDealMeetingDate } from "./dealUtils";

/**
 * Read-only "Prochain meeting" line in the opportunity summary (issue #99).
 *
 * Purely derived from the open tasks of the deal's contacts — nothing is
 * created, edited or invented here. When no upcoming meeting task exists the
 * block renders nothing rather than showing a placeholder date. See
 * `dealNextMeeting.ts` for what the task model can and cannot guarantee.
 */
export const DealNextMeeting = ({ contactIds }: { contactIds?: number[] }) => {
  const { taskTypes } = useConfigurationContext();
  const hasContacts = !!contactIds?.length;

  // Same query shape as <DealTasks>, so React Query serves both from one cache
  // entry instead of issuing a second request.
  const { data: tasks, isPending } = useGetList<Task>(
    "tasks",
    {
      pagination: { page: 1, perPage: 50 },
      sort: { field: "due_date", order: "ASC" },
      filter: {
        "contact_id@in": `(${contactIds?.join(",")})`,
        "done_date@is": null,
      },
    },
    { enabled: hasContacts },
  );

  if (!hasContacts || isPending) return null;

  const nextMeeting = getNextMeetingTask(tasks);
  if (!nextMeeting) return null;

  const typeLabel = taskTypes.find(
    (type) => type.value === nextMeeting.type,
  )?.label;

  return (
    // No horizontal margin: the opportunity summary row spaces its blocks with
    // `gap-x-8`, so an extra `mr-*` here would double the gutter.
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground tracking-wide">
        Prochain meeting
      </span>
      <div className="flex items-center gap-1.5">
        <CalendarClock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-sm">
          {formatDealMeetingDate(nextMeeting.due_date)}
        </span>
      </div>
      <span
        className="text-xs text-muted-foreground truncate max-w-60"
        title={nextMeeting.text}
      >
        {typeLabel ? `${typeLabel} · ` : ""}
        {nextMeeting.text}
      </span>
    </div>
  );
};
