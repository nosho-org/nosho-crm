import { useMemo, useState } from "react";
import {
  ArrowRightLeft,
  CalendarDays,
  CheckCircle2,
  CircleX,
  Edit,
  Mail,
  Phone,
  Save,
  StickyNote,
  Trash2,
} from "lucide-react";
import {
  Form,
  useDelete,
  useGetList,
  useNotify,
  useRecordContext,
  useUpdate,
} from "ra-core";
import type { FieldValues, SubmitHandler } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { useConfigurationContext } from "../../root/ConfigurationContext";
import { NoteCreate } from "../../notes/NoteCreate";
import { NoteAttachments } from "../../notes/NoteAttachments";
import { NoteInputs } from "../../notes/NoteInputs";
import type { Deal, DealNote } from "../../types";
import { DealOwner } from "../cockpit/DealFieldBadges";
import {
  TIMELINE_FILTERS,
  buildDealTimeline,
  filterTimeline,
  type TimelineItem,
  type TimelineKind,
  type TimelineTab,
} from "./dealTimeline";
import { useDealTasks } from "./useDealTasks";

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
 *
 * Notes are the only editable source; the other three are records of things
 * that happened, not things someone wrote.
 */

/** Every write here targets `deal_notes` explicitly. The ambient resource on
 *  this page is `deals`, so reading it from context would edit — or delete —
 *  the opportunity itself. */
const NOTES_RESOURCE = "deal_notes";

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
  task: {
    icon: CheckCircle2,
    color: "var(--deal-status-won)",
    label: "Tâche",
  },
  update: {
    icon: ArrowRightLeft,
    color: "var(--muted-foreground)",
    label: "Mise à jour",
  },
};

/**
 * French names for the columns the journal tracks. A field missing from the map
 * falls back to its raw column name: showing `probability` is ugly but honest,
 * and infinitely better than dropping the entry for failing a lookup.
 */
const FIELD_LABELS: Record<string, string> = {
  stage: "Étape",
  amount: "Montant",
  priority: "Priorité",
  sales_id: "Responsable",
  expected_closing_date: "Date de clôture prévue",
  contact_ids: "Contacts",
  products: "Produits",
  contact_roles: "Rôles des contacts",
  name: "Nom",
  company_id: "Société",
  company_type: "Type de société",
  opportunity_type: "Type d'opportunité",
  category: "Catégorie",
  lead_source: "Source",
  referrer_id: "Apporteur",
  probability: "Probabilité",
  description: "Description",
  next_action: "Prochaine action",
  next_action_date: "Date de prochaine action",
  next_action_owner_id: "Responsable de l'action",
  trial_start_date: "Début d'essai",
  entered_at: "Entrée en pipeline",
  archived_at: "Archivage",
};

/** `old_value` / `new_value` are jsonb: a scalar, an array or an object. */
const formatValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? `${value.length}` : "aucun";
  if (typeof value === "object") return "…";
  return String(value);
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

const TimelineRow = ({
  item,
  note,
  isLast,
  onChanged,
}: {
  item: TimelineItem;
  /** The underlying row, when this item is an editable note. */
  note?: DealNote;
  isLast: boolean;
  onChanged: () => void;
}) => {
  const [isHover, setHover] = useState(false);
  const [isEditing, setEditing] = useState(false);
  const notify = useNotify();

  const [update, { isPending }] = useUpdate();
  const [deleteNote] = useDelete(NOTES_RESOURCE, undefined, {
    mutationMode: "undoable",
    onSuccess: () => {
      notify("Activité supprimée", { type: "info", undoable: true });
    },
    // Not onSuccess: an undoable delete resolves optimistically, so refetching
    // there would pull the row straight back from the server.
    onSettled: () => onChanged(),
  });

  const handleUpdate: SubmitHandler<FieldValues> = (values) => {
    update(
      NOTES_RESOURCE,
      {
        id: note!.id,
        data: {
          ...values,
          // The datetime-local input yields a naive string; the create path
          // normalises it and the update path used not to.
          date: new Date(values.date ?? note!.date).toISOString(),
        },
        previousData: note,
      },
      {
        onSuccess: () => {
          setEditing(false);
          setHover(false);
          onChanged();
        },
      },
    );
  };

  const style = KIND_STYLE[item.kind];
  const Icon = style.icon;

  return (
    <li
      className="flex gap-3"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Vertical rail: the chronological thread the mockup shows. */}
      <div className="flex flex-col items-center shrink-0">
        <span
          className="w-7 h-7 rounded-full flex items-center justify-center"
          style={{
            background: `color-mix(in oklch, ${style.color} 15%, transparent)`,
          }}
          aria-hidden
        >
          <Icon className="w-3.5 h-3.5" style={{ color: style.color }} />
        </span>
        {!isLast && <span className="w-px flex-1 bg-border my-1" aria-hidden />}
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
            {note && !isEditing && (
              <span className={isHover ? "visible" : "invisible"}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(true)}
                  className="p-1 h-auto cursor-pointer"
                  aria-label="Modifier l'activité"
                >
                  <Edit className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    deleteNote(NOTES_RESOURCE, {
                      id: note.id,
                      previousData: note,
                    })
                  }
                  className="p-1 h-auto cursor-pointer"
                  aria-label="Supprimer l'activité"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </span>
            )}
            {item.salesId != null && (
              <DealOwner ownerId={item.salesId} title="Auteur" />
            )}
            {formatStamp(item.date)}
          </span>
        </div>

        {isEditing && note ? (
          <Form onSubmit={handleUpdate} record={note} className="mt-1">
            <NoteInputs showType />
            <div className="flex justify-end mt-2 gap-3">
              <Button
                variant="ghost"
                type="button"
                className="cursor-pointer"
                onClick={() => {
                  setEditing(false);
                  setHover(false);
                }}
              >
                <CircleX className="w-4 h-4" />
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                Enregistrer
              </Button>
            </div>
          </Form>
        ) : (
          <>
            {item.body && <Body text={item.body} />}
            {note && <NoteAttachments note={note} />}
          </>
        )}
      </div>
    </li>
  );
};

export const DealActivityTimeline = () => {
  const record = useRecordContext<Deal>();
  const { dealStages, archivedDealStages } = useConfigurationContext();
  const [filter, setFilter] = useState<TimelineTab>("all");
  const [composing, setComposing] = useState(false);

  const dealId = record?.id;
  const query = { enabled: dealId != null };

  const { data: notes, refetch: refetchNotes } = useGetList<DealNote>(
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
  // Completed tasks, reached both ways — `{ deal_id }` alone matched nothing,
  // because no task in production carries one (#114). The `or` lives in
  // `dealTaskFilter`, so it cannot drift from what the blocks above query.
  const { tasks } = useDealTasks(record, { scope: "done", perPage: 100 });
  // The whole change journal, stage moves included. `deal_stage_history` is now
  // a view over this same table filtered on `field = 'stage'` (20260825120000),
  // so querying both would list every stage move twice.
  const { data: changes } = useGetList(
    "deal_change_log",
    {
      filter: { deal_id: dealId },
      sort: { field: "changed_at", order: "DESC" },
      pagination: { page: 1, perPage: 200 },
    },
    query,
  );

  const notesById = useMemo(() => {
    const map = new Map<string, DealNote>();
    for (const note of notes ?? []) map.set(String(note.id), note);
    return map;
  }, [notes]);

  if (!record) return null;

  const stageLabel = (slug: string | null | undefined) =>
    dealStages.find((s) => s.value === slug)?.label ??
    archivedDealStages?.find((s) => s.value === slug)?.label ??
    slug ??
    "—";

  // A stage slug means nothing to a reader, and only this component can resolve
  // one — which is why the journal stores the raw values and the title is
  // composed here rather than in `buildDealTimeline`.
  const changeTitle = (change: {
    field: string;
    old_value: unknown;
    new_value: unknown;
    operation: string;
  }): string => {
    const label = FIELD_LABELS[change.field] ?? change.field;
    if (change.field === "stage") {
      return change.operation === "insert" || change.old_value == null
        ? `Étape initiale : ${stageLabel(change.new_value as string)}`
        : `Étape : ${stageLabel(change.old_value as string)} → ${stageLabel(
            change.new_value as string,
          )}`;
    }
    return `${label} : ${formatValue(change.old_value)} → ${formatValue(
      change.new_value,
    )}`;
  };

  const items = filterTimeline(
    buildDealTimeline({
      notes,
      calls: calls as never,
      tasks: tasks.map(({ task }) => task) as never,
      updates: (changes ?? []).map((change) => ({
        id: change.id,
        field: change.field,
        changed_at: change.changed_at,
        changed_by: change.changed_by,
        title: changeTitle(change as never),
      })),
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
          <NoteCreate
            reference="deals"
            showStatus={false}
            showType
            onSuccess={() => {
              setComposing(false);
              refetchNotes();
            }}
          />
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
          {items.map((item, index) => (
            <TimelineRow
              key={item.id}
              item={item}
              note={
                item.source === "note"
                  ? notesById.get(String(item.sourceId))
                  : undefined
              }
              isLast={index === items.length - 1}
              onChanged={refetchNotes}
            />
          ))}
        </ol>
      )}
    </Card>
  );
};
