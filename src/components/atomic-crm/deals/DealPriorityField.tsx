import { useRecordContext } from "ra-core";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Deal } from "../types";
import { getDealPriority } from "./dealUtils";

/**
 * Commercial priority, shown as a coloured dot (NOS-806).
 *
 * The dot alone would only convey the level through colour, so the label is
 * always rendered next to it — visible by default, and reachable by screen
 * readers even when `labelled` is false.
 */
export const DealPriorityField = ({
  labelled = true,
  className = "",
}: {
  labelled?: boolean;
  className?: string;
}) => {
  const record = useRecordContext<Deal>();
  const { dealPriorities } = useConfigurationContext();
  if (!record) return null;

  const priority = getDealPriority(record.priority, dealPriorities);

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${priority.dotClassName}`}
      />
      <span className={labelled ? "text-xs" : "sr-only"}>{priority.label}</span>
    </span>
  );
};
