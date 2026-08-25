import type { Identifier } from "ra-core";

import type { DealNote } from "../../types";

/**
 * ---------------------------------------------------------------------------
 * The deal activity timeline (NOS-958 §6)
 * ---------------------------------------------------------------------------
 * "Le but est de transformer l'affichage existant en une timeline commerciale
 * chronologique." Four sources feed it, and none of them is rewritten:
 *
 *   * `deal_notes` — the existing notes, with their `type` column telling a
 *     note from a call, a meeting or an email. That column has existed since
 *     the table was created and was simply never read;
 *   * `call_logs` — calls already linked to the deal;
 *   * `tasks` — completed actions, reachable since `tasks.deal_id` exists;
 *   * `deal_stage_history` — stage moves.
 *
 * "ATTENTION : Ne supprimer absolument aucune note ou activité historique."
 * Nothing here writes; it only merges and sorts.
 */

/**
 * What a row *looks* like: its icon and its little label. Deliberately finer
 * than the tabs — a call and a note are filed together but must not render
 * identically.
 */
export type TimelineKind =
  | "note"
  | "call"
  | "meeting"
  | "email"
  | "task"
  | "update";

/**
 * Which table an item came from — only `note` rows are editable. Two sources
 * can produce the same kind: `stage` and `audit` are both `kind: "update"`.
 */
export type TimelineSource = "note" | "call" | "task" | "stage" | "audit";

/**
 * The tabs, which are NOT the kinds.
 *
 * Coupling the two is what used to make "remove the Appels tab" mean "lose the
 * phone icon". The team records every exchange as a note whatever the channel,
 * so channels stop being a filter — but Allo syncs real calls into `call_logs`
 * that nobody will ever retype, so they stay in the stream.
 */
export type TimelineTab = "all" | "note" | "task" | "update";

export interface TimelineItem {
  id: string;
  kind: TimelineKind;
  /**
   * The table this came from, and its id there. `kind` cannot stand in for it:
   * a note typed "Appel" and a row from `call_logs` are both `kind: "call"`,
   * but only the first one can be edited.
   */
  source: TimelineSource;
  sourceId: Identifier;
  /** ISO timestamp. Items without one sort last rather than being dropped. */
  date: string | null;
  /** Who did it, when known. */
  salesId: Identifier | null;
  title: string;
  /** Long text, clamped by the UI behind a "Lire plus". */
  body?: string | null;
  /** Attachments carried by a note. */
  attachments?: DealNote["attachments"];
}

/** The filter tabs, in order. */
export const TIMELINE_FILTERS: { value: TimelineTab; label: string }[] = [
  { value: "all", label: "Tout" },
  { value: "note", label: "Notes" },
  { value: "task", label: "Tâches" },
  { value: "update", label: "Mises à jour" },
];

/** Which kinds each tab gathers. */
const TAB_KINDS: Record<Exclude<TimelineTab, "all">, TimelineKind[]> = {
  // An Allo call is an exchange, like a note. It loses its own tab, not its
  // place in the stream.
  note: ["note", "call", "meeting", "email"],
  task: ["task"],
  update: ["update"],
};

/**
 * `deal_notes.type` is free text and predates any referential, so it is matched
 * loosely. An unrecognised value falls back to "note" — the note is still shown,
 * under the most neutral heading, rather than dropped for failing a match.
 *
 * Still used after the tabs were reduced to four: it no longer drives filtering
 * but it still drives the icon and the row label, and it is what the "Type
 * d'activité" select and the 20260824160000 backfill feed.
 */
export const noteKind = (type: string | null | undefined): TimelineKind => {
  const value = (type ?? "").trim().toLowerCase();
  if (/appel|call|phone/.test(value)) return "call";
  if (/meeting|rendez|rdv|demo|démo/.test(value)) return "meeting";
  if (/mail/.test(value)) return "email";
  return "note";
};

/** First line of a note, used as its title when it has no other. */
const firstLine = (text: string | null | undefined): string => {
  const line = (text ?? "").trim().split("\n")[0]?.trim() ?? "";
  if (!line) return "Note";
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
};

export interface TimelineSources {
  notes?: DealNote[];
  calls?: {
    id: Identifier;
    started_at?: string | null;
    direction?: string | null;
    // `call_logs` has never had a `summary` column — it carries `ai_summary`
    // and `summary_short`. Reading the wrong name left every call body empty.
    ai_summary?: string | null;
    summary_short?: string | null;
    sales_id?: Identifier | null;
  }[];
  tasks?: {
    id: Identifier;
    text?: string | null;
    type?: string | null;
    done_date?: string | null;
    sales_id?: Identifier | null;
  }[];
  stageChanges?: {
    id: Identifier;
    from_stage?: string | null;
    to_stage: string;
    changed_at: string;
    changed_by?: Identifier | null;
  }[];
  /**
   * Every other edit of the opportunity, from `deal_change_log` (20260825120000).
   * One row per field changed; `title` is composed by the caller, which is the
   * only place that knows how to render a stage slug, a sales id or an amount.
   */
  updates?: {
    id: Identifier;
    field: string;
    changed_at: string;
    changed_by?: Identifier | null;
    title: string;
  }[];
  /** Resolves a stage slug to its label, archived stages included. */
  stageLabel?: (slug: string | null | undefined) => string;
}

/**
 * Merge every source into one list, most recent first.
 *
 * Ids are prefixed per source: the four tables have independent sequences, so
 * a bare id would collide and React would reuse the wrong row.
 */
export function buildDealTimeline(sources: TimelineSources): TimelineItem[] {
  const label = sources.stageLabel ?? ((slug) => slug ?? "—");
  const items: TimelineItem[] = [];

  for (const note of sources.notes ?? []) {
    items.push({
      id: `note-${note.id}`,
      kind: noteKind(note.type),
      source: "note",
      sourceId: note.id,
      date: note.date ?? null,
      salesId: note.sales_id ?? null,
      title: firstLine(note.text),
      body: note.text,
      attachments: note.attachments,
    });
  }

  for (const call of sources.calls ?? []) {
    items.push({
      id: `call-${call.id}`,
      kind: "call",
      source: "call",
      sourceId: call.id,
      date: call.started_at ?? null,
      salesId: call.sales_id ?? null,
      title:
        call.direction === "outbound"
          ? "Appel sortant"
          : call.direction === "inbound"
            ? "Appel entrant"
            : "Appel",
      body: call.ai_summary ?? call.summary_short ?? null,
    });
  }

  // Only completed tasks. A pending one is a plan, not an activity, and it is
  // already shown by the "Prochaine tâche" and "Tâches" blocks above.
  for (const task of sources.tasks ?? []) {
    if (!task.done_date) continue;
    items.push({
      id: `task-${task.id}`,
      kind: "task",
      source: "task",
      sourceId: task.id,
      date: task.done_date,
      salesId: task.sales_id ?? null,
      title: task.text?.trim() || "Tâche terminée",
    });
  }

  for (const change of sources.stageChanges ?? []) {
    items.push({
      id: `stage-${change.id}`,
      kind: "update",
      source: "stage",
      sourceId: change.id,
      date: change.changed_at,
      salesId: change.changed_by ?? null,
      title: change.from_stage
        ? `Étape : ${label(change.from_stage)} → ${label(change.to_stage)}`
        : `Étape initiale : ${label(change.to_stage)}`,
    });
  }

  for (const change of sources.updates ?? []) {
    items.push({
      id: `update-${change.id}`,
      kind: "update",
      source: "audit",
      sourceId: change.id,
      date: change.changed_at,
      salesId: change.changed_by ?? null,
      title: change.title,
    });
  }

  return items.sort((a, b) => {
    // Undated items sort last rather than being dropped: they are real
    // activities whose timestamp was never recorded.
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });
}

/**
 * Apply a filter tab.
 *
 * Tabs gather kinds (see `TAB_KINDS`); they are not kinds themselves. "Notes"
 * holds every exchange whatever its channel, which is what lets the Appels /
 * Meetings / Emails tabs disappear without their rows disappearing with them.
 */
export function filterTimeline(
  items: TimelineItem[],
  filter: TimelineTab,
): TimelineItem[] {
  if (filter === "all") return items;
  const kinds = TAB_KINDS[filter];
  return items.filter((item) => kinds.includes(item.kind));
}
