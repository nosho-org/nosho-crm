export const foreignKeyMapping = {
  contacts: "contact_id",
  deals: "deal_id",
} as const;

/**
 * The resource a note is stored in, per parent.
 *
 * Notes used to read this from `useResourceContext()`, which only ever worked
 * because every caller wrapped them in a `<ReferenceManyField reference="…">`.
 * The deal page renders the note form directly, where the ambient resource is
 * `deals` — writing there would have created an opportunity instead of a note.
 * Deriving it from the `reference` prop removes that dependency entirely.
 */
export const noteResourceMapping = {
  contacts: "contact_notes",
  deals: "deal_notes",
} as const;
