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
  compact = false,
  className = "",
}: {
  labelled?: boolean;
  /**
   * Rend le niveau seul — « P0 », « P1 », « P2 » — dans une pastille lisible
   * (NOS-1068).
   *
   * Sur une carte kanban, le point de 8 px ne dit rien à qui ne connaît pas le
   * code couleur, et son libellé était en `sr-only`. Le niveau écrit tient dans
   * la même place et se lit sans apprentissage. Le libellé complet reste porté
   * par `title` et par les lecteurs d'écran.
   */
  compact?: boolean;
  className?: string;
}) => {
  const record = useRecordContext<Deal>();
  const { dealPriorities } = useConfigurationContext();
  if (!record) return null;

  const priority = getDealPriority(record.priority, dealPriorities);

  // An unset or unrecognised priority is a real state the spec names, not an
  // excuse to show the first choice in the list.
  const dotClassName = priority?.dotClassName ?? "bg-muted-foreground/25";
  const label = priority?.label ?? "Priorité à définir";

  if (compact) {
    // « P0 Critique » → « P0 ». Sans niveau reconnaissable — priorité absente
    // ou valeur inconnue — on écrit un tiret plutôt qu'un mot tronqué au
    // hasard.
    const level = /^P\d/.exec(label)?.[0] ?? "—";
    return (
      <span
        title={label}
        className={`inline-flex items-center justify-center shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white ${dotClassName} ${className}`}
      >
        <span aria-hidden="true">{level}</span>
        <span className="sr-only">{label}</span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${dotClassName}`}
      />
      <span className={labelled ? "text-xs" : "sr-only"}>{label}</span>
    </span>
  );
};
