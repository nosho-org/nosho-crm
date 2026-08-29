import { useState } from "react";
import { CheckSquare } from "lucide-react";
import { useRecordContext } from "ra-core";
import { Button } from "@/components/ui/button";
import { useShimmer } from "@/components/ui/motion";

import { TaskCreateSheet } from "../../tasks/TaskCreateSheet";
import type { Deal } from "../../types";

/**
 * ---------------------------------------------------------------------------
 * « Créer une tâche » (#112)
 * ---------------------------------------------------------------------------
 * The page rewrite (8dd2513e) deleted `DealShow.tsx` and left this behind. Same
 * label and same icon as the button it restores — that is what the sales team
 * looks for.
 *
 * The task is attached to the opportunity (`tasks.deal_id`), not to its first
 * contact the way the old modal did. That is what the column was added for, and
 * it works on an opportunity that has no contact at all.
 */
export const DealCreateTaskButton = ({
  label = "Créer une tâche",
  variant = "outline",
}: {
  label?: string;
  variant?: "outline" | "default";
}) => {
  const record = useRecordContext<Deal>();
  const [open, setOpen] = useState(false);
  /*
   * Le reflet ne joue que sur l'action principale de l'étape (NOS-1177).
   *
   * L'audit : « Discipline absolue : jamais deux sur un même écran. » La fiche
   * n'en désigne qu'une, `getDealPrimaryAction`, et c'est elle qui reçoit
   * `variant="default"`. Le reflet suit donc cette désignation plutôt que
   * d'être posé à la main quelque part.
   *
   * Appelé avant le `return null` : c'est un hook.
   */
  const shimmer = useShimmer(variant === "default");

  // An archived opportunity is read-only, like it is for Modifier and Archiver.
  if (!record || record.archived_at) return null;

  return (
    <>
      <Button
        size="sm"
        variant={variant}
        onClick={() => setOpen(true)}
        className={shimmer}
      >
        <CheckSquare className="w-3.5 h-3.5" aria-hidden />
        {label}
      </Button>
      <TaskCreateSheet open={open} onOpenChange={setOpen} deal_id={record.id} />
    </>
  );
};
