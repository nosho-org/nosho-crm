/**
 * The activity types a deal note can carry.
 *
 * `deal_notes.type` is free text and predates any referential, so the timeline
 * matches it loosely (see `noteKind` in `deals/show/dealTimeline.ts`). These
 * slugs are chosen to be exactly what those regexes already recognise, so the
 * catalogue and the reader cannot disagree:
 *
 *   "call"    → /appel|call|phone/
 *   "meeting" → /meeting|rendez|rdv|demo|démo/
 *   "email"   → /mail/          (matched inside "email")
 *   "note"    → no match, the neutral fallback
 *
 * `noteTypes.test.ts` pins that round-trip. Historical notes keep whatever text
 * they had — nothing here rewrites them.
 */
export const NOTE_TYPE_CHOICES = [
  { id: "note", value: "note", name: "Note" },
  { id: "call", value: "call", name: "Appel" },
  { id: "meeting", value: "meeting", name: "Meeting" },
  { id: "email", value: "email", name: "Email" },
] as const;

export type NoteTypeValue = (typeof NOTE_TYPE_CHOICES)[number]["value"];
