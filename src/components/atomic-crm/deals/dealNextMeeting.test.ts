import type { Task } from "../types";
import { getNextMeetingTask, isMeetingTask } from "./dealNextMeeting";

const NOW = new Date("2026-08-20T10:00:00.000Z");

const task = (overrides: Partial<Task> & Pick<Task, "id">): Task => ({
  contact_id: 1,
  type: "meeting",
  text: "Point d'étape",
  due_date: "2026-08-25T09:00:00.000Z",
  done_date: null,
  ...overrides,
});

describe("isMeetingTask", () => {
  it.each(["meeting", "demo", "lunch"])(
    "treats %s as a meeting",
    (type: string) => {
      expect(isMeetingTask({ type })).toBe(true);
    },
  );

  it.each(["call", "email", "follow-up", "ship", "thank-you", "none"])(
    "does not treat %s as a meeting",
    (type: string) => {
      expect(isMeetingTask({ type })).toBe(false);
    },
  );

  it("does not treat a task without a type as a meeting", () => {
    expect(isMeetingTask({ type: undefined as unknown as string })).toBe(false);
  });
});

describe("getNextMeetingTask", () => {
  it("returns null when there is no task at all", () => {
    expect(getNextMeetingTask(undefined, NOW)).toBeNull();
    expect(getNextMeetingTask([], NOW)).toBeNull();
  });

  it("returns the earliest upcoming meeting", () => {
    const result = getNextMeetingTask(
      [
        task({ id: 1, due_date: "2026-09-01T09:00:00.000Z" }),
        task({ id: 2, due_date: "2026-08-24T09:00:00.000Z" }),
        task({ id: 3, due_date: "2026-08-28T09:00:00.000Z" }),
      ],
      NOW,
    );
    expect(result?.id).toBe(2);
  });

  it("ignores tasks that are not meetings, even when they are sooner", () => {
    const result = getNextMeetingTask(
      [
        task({ id: 1, type: "call", due_date: "2026-08-21T09:00:00.000Z" }),
        task({ id: 2, type: "email", due_date: "2026-08-22T09:00:00.000Z" }),
        task({ id: 3, type: "demo", due_date: "2026-08-26T09:00:00.000Z" }),
      ],
      NOW,
    );
    expect(result?.id).toBe(3);
  });

  it("ignores meetings that already happened", () => {
    const result = getNextMeetingTask(
      [
        task({ id: 1, due_date: "2026-08-10T09:00:00.000Z" }),
        task({ id: 2, due_date: "2026-08-30T09:00:00.000Z" }),
      ],
      NOW,
    );
    expect(result?.id).toBe(2);
  });

  it("ignores meetings already marked as done", () => {
    const result = getNextMeetingTask(
      [
        task({
          id: 1,
          due_date: "2026-08-21T09:00:00.000Z",
          done_date: "2026-08-19T09:00:00.000Z",
        }),
        task({ id: 2, due_date: "2026-08-30T09:00:00.000Z" }),
      ],
      NOW,
    );
    expect(result?.id).toBe(2);
  });

  it("still shows a meeting scheduled for today", () => {
    // Postponing from the task list stores a bare YYYY-MM-DD, so a meeting due
    // today carries no time and must not vanish as the day goes on.
    const result = getNextMeetingTask(
      [task({ id: 1, due_date: "2026-08-20" })],
      NOW,
    );
    expect(result?.id).toBe(1);
  });

  it("drops a date-only meeting from a previous day", () => {
    expect(
      getNextMeetingTask([task({ id: 1, due_date: "2026-08-19" })], NOW),
    ).toBeNull();
  });

  it("ignores tasks with a missing or unparseable due date", () => {
    expect(
      getNextMeetingTask(
        [
          task({ id: 1, due_date: undefined as unknown as string }),
          task({ id: 2, due_date: "not-a-date" }),
        ],
        NOW,
      ),
    ).toBeNull();
  });

  it("never invents a meeting when the deal only has non-meeting tasks", () => {
    expect(
      getNextMeetingTask(
        [task({ id: 1, type: "call" }), task({ id: 2, type: "follow-up" })],
        NOW,
      ),
    ).toBeNull();
  });
});
