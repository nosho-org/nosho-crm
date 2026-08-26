import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { ForDeal, Mobile } from "./TaskCreateSheet.stories";
import { useDataProvider, type DataProvider } from "ra-core";
import { buildContact } from "@/test/StoryWrapper";

describe("TaskCreateSheet", () => {
  it("creates a task for a selected contact and updates last_seen", async () => {
    let dataProvider: DataProvider | null = null;
    const DataProviderListener = () => {
      dataProvider = useDataProvider();
      return null;
    };
    const originalLastSeen = "2025-01-02T10:00:00.000Z";

    const screen = await render(
      <Mobile
        data={{
          contacts: [
            buildContact({
              first_name: "Ada",
              id: 1,
              last_name: "Lovelace",
              last_seen: "2025-01-01T10:00:00.000Z",
              nb_tasks: 1,
            }),
            buildContact({
              first_name: "Grace",
              id: 2,
              last_name: "Hopper",
              last_seen: originalLastSeen,
            }),
          ],
          tasks: [
            {
              contact_id: 1,
              due_date: "2025-01-03T12:00:00.000Z",
              id: 1,
              sales_id: 0,
              text: "Existing seeded task",
              type: "email",
            },
          ],
        }}
      >
        <DataProviderListener />
      </Mobile>,
    );

    await screen
      .getByLabelText(/description/i)
      .fill("Follow up about onboarding");

    const [contactInput, typeInput] = screen.getByRole("combobox").all();

    await contactInput.click();
    await screen.getByText("Grace Hopper").click();

    await typeInput.click();
    const typeOptions = screen.getByRole("listbox");
    // Task type labels are French (defaultTaskTypes); the stored value stays "call".
    await typeOptions.getByText("Appel").click();

    const dueDateInput = screen.getByLabelText(/due date/i);
    await dueDateInput.clear();
    await dueDateInput.fill("2026-03-06T12:30");

    await screen.getByRole("button", { name: /^save$/i }).click();

    await expect.element(screen.getByText("Tâche ajoutée")).toBeInTheDocument();

    await expect
      .element(screen.getByText("Créer une tâche"))
      .not.toBeInTheDocument();

    await expect
      .poll(async () => {
        const { data } = await dataProvider!.getList("tasks", {
          filter: {},
          pagination: { page: 1, perPage: 10 },
          sort: { field: "id", order: "ASC" },
        });
        return data.some((task) => task.text === "Follow up about onboarding");
      })
      .toBe(true);

    const tasks = await dataProvider!.getList("tasks", {
      filter: {},
      pagination: { page: 1, perPage: 10 },
      sort: { field: "id", order: "ASC" },
    });
    const createdTask = tasks.data.find(
      (task) => task.text === "Follow up about onboarding",
    );

    expect(createdTask).toMatchObject({
      contact_id: 2,
      text: "Follow up about onboarding",
      type: "call",
    });
    expect(tasks.data).toHaveLength(2);

    const updatedContact = await dataProvider!.getOne("contacts", {
      id: 2,
    });
    expect(updatedContact.data.last_seen).not.toBe(originalLastSeen);
    expect(updatedContact.data.nb_tasks).toBe(1);
  });

  /**
   * #112. `tasks.deal_id` has existed since migration 20260823140000 and no UI
   * ever wrote it — the opportunity page had lost its "Créer une tâche" button
   * in the same commit that added the column.
   */
  it("creates a task on the opportunity itself, asking for no contact", async () => {
    let dataProvider: DataProvider | null = null;
    const DataProviderListener = () => {
      dataProvider = useDataProvider();
      return null;
    };

    const screen = await render(
      <ForDeal>
        <DataProviderListener />
      </ForDeal>,
    );

    await screen.getByLabelText(/description/i).fill("Préparer le comité");

    // Two comboboxes: the type, then the assignee (NOS-1038). The contact
    // autocomplete is still absent — it is `required()`, so rendering it here
    // would block the save of a task that already has an owner: the opportunity.
    // The count is asserted rather than the absence of the contact input so the
    // test keeps failing if a third picker appears unannounced.
    const comboboxes = screen.getByRole("combobox").all();
    expect(comboboxes).toHaveLength(2);

    await comboboxes[0].click();
    await screen.getByRole("listbox").getByText("Appel").click();

    const dueDateInput = screen.getByLabelText(/due date/i);
    await dueDateInput.clear();
    await dueDateInput.fill("2026-03-06T12:30");

    await screen.getByRole("button", { name: /^save$/i }).click();

    await expect.element(screen.getByText("Tâche ajoutée")).toBeInTheDocument();

    // The early return in front of the contact lookup used to skip the close.
    await expect
      .element(screen.getByLabelText(/description/i))
      .not.toBeInTheDocument();

    await expect
      .poll(async () => {
        const { data } = await dataProvider!.getList("tasks", {
          filter: {},
          pagination: { page: 1, perPage: 10 },
          sort: { field: "id", order: "ASC" },
        });
        return data.find((task) => task.text === "Préparer le comité");
      })
      .toMatchObject({ deal_id: 36, type: "call" });

    const { data: tasks } = await dataProvider!.getList("tasks", {
      filter: {},
      pagination: { page: 1, perPage: 10 },
      sort: { field: "id", order: "ASC" },
    });
    const created = tasks.find((task) => task.text === "Préparer le comité");
    // Not the first contact of the opportunity, the way the pre-8dd2513e
    // button did it: the task belongs to the opportunity.
    expect(created?.contact_id ?? null).toBeNull();
  });
});
