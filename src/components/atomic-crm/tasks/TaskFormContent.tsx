import { AutocompleteInput } from "@/components/admin/autocomplete-input";
import { ReferenceInput } from "@/components/admin/reference-input";
import { SelectInput } from "@/components/admin/select-input";
import { TextInput } from "@/components/admin/text-input";
import { required } from "ra-core";
import { DateTimeInput } from "@/components/admin";

import { contactOptionText } from "../misc/ContactOption";
import { useConfigurationContext } from "../root/ConfigurationContext";

export const TaskFormContent = ({
  selectContact,
  contactRequired = true,
  contactFilter,
}: {
  selectContact?: boolean;
  /**
   * False on a task created from an opportunity: `tasks_owner_check` is already
   * satisfied by `deal_id`, and an opportunity may legitimately have no contact
   * yet. Defaults to true so every existing caller keeps its current rule.
   */
  contactRequired?: boolean;
  /** Narrows the picker, e.g. to the opportunity's own contacts. */
  contactFilter?: Record<string, unknown>;
}) => {
  const { taskTypes } = useConfigurationContext();
  return (
    <div className="flex flex-col gap-4">
      <TextInput
        autoFocus
        source="text"
        label="Description"
        validate={required()}
        multiline
        className="m-0"
        helperText={false}
      />
      {selectContact && (
        <ReferenceInput
          source="contact_id"
          reference="contacts_summary"
          filter={contactFilter}
        >
          <AutocompleteInput
            label="Contact"
            optionText={contactOptionText}
            helperText={false}
            validate={contactRequired ? required() : undefined}
            modal
          />
        </ReferenceInput>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DateTimeInput
          source="due_date"
          helperText={false}
          validate={required()}
        />
        <SelectInput
          source="type"
          validate={required()}
          choices={taskTypes}
          optionText="label"
          optionValue="value"
          defaultValue="none"
          helperText={false}
        />
      </div>
    </div>
  );
};
