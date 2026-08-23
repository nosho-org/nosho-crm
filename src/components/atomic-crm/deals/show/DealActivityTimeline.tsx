import { useState } from "react";
import {
  ArrowRightLeft,
  CalendarDays,
  CheckCircle2,
  Mail,
  Phone,
  StickyNote,
} from "lucide-react";
import { useGetList, useRecordContext } from "ra-core";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { useConfigurationContext } from "../../root/ConfigurationContext";
import { NoteCreate } from "../../notes/NoteCreate";
import type { Deal, DealNote } from "../../types";
import { DealOwner } from "../cockpit/DealFieldBadges";
import {
  TIMELINE_FILTERS,
  buildDealTimeline,
  filterTimeline,
  type TimelineKind,
} from "./dealTimeline";

/**
 * ---------------------------------------------------------------------------
 * Activité — timeline unique (NOS-958 §6)
 * ---------------------------------------------------------------------------
 * "C'est là que la fiche actuelle est particulièrement confuse." Four sources
 * merged into one chronological stream, most recent first.
 *
 * Nothing is migrated or rewritten: the existing notes are read as they are,
 * and their `type` column — present since the table was created, never read
 * until now — is what tells a call from a meeting.
 */

const KIND_STYLE: Record<
  TimelineKind,
  { icon: typeof StickyNote; color: string; label: string }
> = {
  note: { icon: StickyNote, color: "var(--muted-foreground)", label: "Note" },
  call: { icon: Phone, color: "var(--deal-series-potential)", label: "Appel" },
  meeting: {
    icon: CalendarDays,
    color: "var(--deal-series-weighted)",
    label: "Meeting",
  },
  email: { icon: Mail, color: "var(--deal-status-warning)", label: "Email" },
  action: {
    icon: CheckCircle2,
    color: "var(--deal-status-won)",
    label: "Action",
  },
  stage: {
    icon: ArrowRightLeft,
    color: "var(--muted-foreground)",
    label: "Étape",
  },
};

const formatStamp = (iso: string | null): string => {
  if (!iso) return "date inconnue";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "date inconnue";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
};

/** Long notes are clamped rather than dumped: "Ne plus afficher des pavés". */
const Body = ({ text }: { text: string }) => {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 240 || text.split("\n").length > 3;

  return (
    <>
      <p
        className={`text-sm text-muted-foreground whitespace-pre-line ${
          isLong && !expanded ? "line-clamp-3" : ""
        }`}
      >
        {text}
      </p>
      {isLong && (
        <button
          type="button"
          className="text-xs text-foreground hover:underline self-start"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Réduire" : "Lire plus"}
        </button>
      )}
    </>
  );
};

export const DealActivityTimeline = () => {
  const record = useRecordContext<Deal>();
  const { dealStages, archivedDealStages } = useConfigurationContext();
  const [filter, setFilter] = useState<"all" | TimelineKind>("all");
  const [composing, setComposing] = useState(false);

  const dealId = record?.id;
  const query = { enabled: dealId != null };

  const { data: notes } = useGetList<DealNote>(
    "deal_notes",
    {
      filter: { deal_id: dealId },
      sort: { field: "date", order: "DESC" },
      pagination: { page: 1, perPage: 200 },
    },
    query,
  );
  const { data: calls } = useGetList(
    "call_logs",
    {
      filter: { deal_id: dealId },
      sort: { field: "started_at", order: "DESC" },
      pagination: { page: 1, perPage: 100 },
    },
    query,
  );
  const { data: tasks } = useGetList(
    "tasks",
    {
      filter: { deal_id: dealId },
      sort: { field: "done_date", order: "DESC" },
      pagination: { page: 1, perPage: 100 },
    },
    query,
  );
  const { data: stageChanges } = useGetList(
    "deal_stage_history",
    {
      filter: { deal_id: dealId },
      sort: { field: "changed_at", order: "DESC" },
      pagination: { page: 1, perPage: 100 },
    },
    query,
  );

  if (!record) return null;

  const stageLabel = (slug: string | null | undefined) =>
    dealStages.find((s) => s.value === slug)?.label ??
    archivedDealStages?.find((s) => s.value === slug)?.label ??
    slug ??
    "—";

  const items = filterTimeline(
    buildDealTimeline({
      notes,
      calls: calls as never,
      tasks: tasks as never,
      stageChanges: stageChanges as never,
      stageLabel,
    }),
    filter,
  );

  return (
    <Card className="p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Activité
        </span>
        <Button
          size="sm"
          variant={composing ? "secondary" : "outline"}
          onClick={() => setComposing((value) => !value)}
        >
          {composing ? "Annuler" : "Ajouter une activité"}
        </Button>
      </div>

      {composing && (
        <div className="border-b border-border pb-4">
          {/* The existing note form, unchanged: "reconnectant la nouvelle
              interface aux mécanismes/backend existants". */}
          <NoteCreate reference="deals" showStatus={false} />
        </div>
      )}

      <div className="flex items-center gap-1 flex-wrap" role="tablist">
        {TIMELINE_FILTERS.map((tab) => (
          <Button
            key={tab.value}
            type="button"
            size="sm"
            role="tab"
            aria-selected={filter === tab.value}
            variant={filter === tab.value ? "default" : "ghost"}
            onClick={() => setFilter(tab.value)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          Aucune activité{filter !== "all" ? " de ce type" : ""} sur cette
          opportunité.
        </p>
      ) : (
        <ol className="flex flex-col">
          {items.map((item, index) => {
            const style = KIND_STYLE[item.kind];
            const Icon = style.icon;
            return (
              <li key={item.id} className="flex gap-3">
                {/* Vertical rail: the chronological thread the mockup shows. */}
                <div className="flex flex-col items-center shrink-0">
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center"
                    style={{
                      background: `color-mix(in oklch, ${style.color} 15%, transparent)`,
                    }}
                    aria-hidden
                  >
                    <Icon
                      className="w-3.5 h-3.5"
                      style={{ color: style.color }}
                    />
                  </span>
                  {index < items.length - 1 && (
                    <span className="w-px flex-1 bg-border my-1" aria-hidden />
                  )}
                </div>

                <div className="flex flex-col gap-1 pb-5 min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <span className="text-sm font-medium min-w-0">
                      <span className="text-xs uppercase tracking-wide text-muted-foreground mr-2">
                        {style.label}
                      </span>
                      {item.title}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-2">
                      {item.salesId != null && (
                        <DealOwner ownerId={item.salesId} title="Auteur" />
                      )}
                      {formatStamp(item.date)}
                    </span>
                  </div>
                  {item.body && <Body text={item.body} />}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
};
