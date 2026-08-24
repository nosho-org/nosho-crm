import { NOTE_TYPE_CHOICES, type NoteTypeValue } from "./noteTypes";
import { noteKind } from "../deals/show/dealTimeline";

/**
 * The catalogue the user picks from and the reader the timeline filters with
 * live in two different modules. Nothing but this test stops them drifting:
 * pick a type in the form, and the matching filter tab must find the note back.
 */
describe("NOTE_TYPE_CHOICES", () => {
  it.each(NOTE_TYPE_CHOICES.map((choice) => choice.value))(
    "%s round-trips through noteKind",
    (value: NoteTypeValue) => {
      expect(noteKind(value)).toBe(value);
    },
  );

  it("still reads the legacy free-text values written before the selector", () => {
    expect(noteKind("Appel sortant")).toBe("call");
    expect(noteKind("RDV physique")).toBe("meeting");
    expect(noteKind("Relance mail")).toBe("email");
    expect(noteKind(null)).toBe("note");
    expect(noteKind(undefined)).toBe("note");
    expect(noteKind("")).toBe("note");
  });
});
