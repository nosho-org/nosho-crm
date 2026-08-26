import { render } from "vitest-browser-react";
import {
  CoreAdminContext,
  Form,
  required,
  ResourceContextProvider,
  testDataProvider,
} from "ra-core";

import { SelectInput } from "./select-input";

/**
 * Guard against the invisible-validation half of issue #115.
 *
 * `SelectInput` imported `FormError` but only rendered it in its loading
 * branch. `stage` is a `required()` SelectInput in the opportunity form, so an
 * empty value blocked submit with no message, no red text, and no focus target
 * (the component attaches no `field.ref` either). The only feedback left was a
 * bottom-centre toast, behind a dialog spanning most of the viewport.
 *
 * The reset "X" made it reachable in one click: `handleReset` writes
 * `emptyValue` without looking at `isRequired`.
 *
 * Assertions target the `form-message` slot rather than the wording, so they do
 * not depend on the translation catalogue.
 */

const CHOICES = [
  { id: "lead", name: "Lead" },
  { id: "qualified", name: "Qualifié" },
];

const renderInput = (
  props: Record<string, unknown> = {},
  defaultValues: Record<string, unknown> = {},
) =>
  render(
    <CoreAdminContext dataProvider={testDataProvider()}>
      <ResourceContextProvider value="deals">
        <Form onSubmit={() => {}} defaultValues={defaultValues}>
          <SelectInput
            source="stage"
            label="Étape"
            choices={CHOICES}
            {...props}
          />
          <button type="submit">Enregistrer</button>
        </Form>
      </ResourceContextProvider>
    </CoreAdminContext>,
  );

const formMessages = (container: Element) =>
  container.querySelectorAll('[data-slot="form-message"]');

/** The clear button is a bare <div role="button">, unlike the real <button>. */
const resetButtons = (container: Element) =>
  container.querySelectorAll('div[role="button"]');

describe("SelectInput", () => {
  it("renders the validation error of a required field on submit", async () => {
    const screen = await renderInput({ validate: required() });

    await screen.getByRole("button", { name: "Enregistrer" }).click();

    await expect.poll(() => formMessages(screen.container).length).toBe(1);
  });

  it("renders no error while the field is valid", async () => {
    const screen = await renderInput(
      { validate: required() },
      {
        stage: "lead",
      },
    );

    await screen.getByRole("button", { name: "Enregistrer" }).click();

    await expect.poll(() => formMessages(screen.container).length).toBe(0);
  });

  it("offers the reset X on an optional field", async () => {
    const screen = await renderInput({}, { stage: "lead" });

    await expect.poll(() => resetButtons(screen.container).length).toBe(1);
  });

  it("hides the reset X on a required field", async () => {
    // Clearing a required select left the form unsubmittable with no way back
    // to a valid value short of reloading the page.
    const screen = await renderInput(
      { validate: required() },
      {
        stage: "lead",
      },
    );

    await expect.poll(() => resetButtons(screen.container).length).toBe(0);
  });
});
