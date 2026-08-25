import { useState } from "react";
import { Plus } from "lucide-react";
import { useRecordContext } from "ra-core";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { Task } from "../../tasks/Task";
import { TaskCreateSheet } from "../../tasks/TaskCreateSheet";
import type { Deal } from "../../types";
import { useDealTasks } from "./useDealTasks";

/**
 * ---------------------------------------------------------------------------
 * Tâches (issue #114)
 * ---------------------------------------------------------------------------
 * The block `8dd2513e` dropped when the deal moved from a dialog to a page, and
 * never put back. "Prochaine tâche" above only surfaces the most urgent one;
 * an opportunity routinely carries several.
 *
 * Reuses `<Task>` so a task looks and behaves the same here as on a contact and
 * on the dashboard — checkbox, postpone, edit, delete all included.
 *
 * `AddTask` is deliberately NOT reused for the CTA: it reads its contact from
 * `useRecordContext()`, which on this page holds a `Deal`, so it would write the
 * opportunity's id into `contact_id`.
 */

export const DealTasksBlock = () => {
  const record = useRecordContext<Deal>();
  const [creating, setCreating] = useState(false);
  const { tasks, isPending, refresh } = useDealTasks(record);

  if (!record) return null;

  const contactIds = (record.contact_ids ?? []) as number[];

  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Tâches
        </span>
        <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
          <Plus className="w-3.5 h-3.5" aria-hidden />
          Ajouter une tâche
        </Button>
      </div>

      {isPending ? null : tasks.length === 0 ? (
        <span className="text-sm text-muted-foreground">
          Aucune tâche en cours sur cette opportunité.
        </span>
      ) : (
        <div className="space-y-2">
          {tasks.map(({ task }) => (
            <Task key={task.id} task={task} showContact showTime={false} />
          ))}
        </div>
      )}

      <TaskCreateSheet
        open={creating}
        onOpenChange={setCreating}
        deal_id={record.id}
        dealContactIds={contactIds}
        dealName={record.name}
        onCreated={refresh}
      />
    </Card>
  );
};
