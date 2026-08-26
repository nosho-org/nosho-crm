import { AutocompleteInput } from "@/components/admin/autocomplete-input";
import { ReferenceInput } from "@/components/admin/reference-input";
import { SelectInput } from "@/components/admin/select-input";
import { TextInput } from "@/components/admin/text-input";
import { required } from "ra-core";
import { DateTimeInput } from "@/components/admin";

import { contactOptionText } from "../misc/ContactOption";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Sale } from "../types";

const saleOptionRenderer = (choice: Sale) =>
  `${choice.first_name} ${choice.last_name}`;

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
        {/*
         * Responsable de la tâche (NOS-1038).
         *
         * Jusqu'ici `tasks.sales_id` était un tampon de créateur : rempli par
         * `set_sales_id_default` à l'insert, jamais choisi. Ce champ en fait une
         * assignation délibérée — et c'est ce qui oblige à restreindre le
         * trigger `deal_tasks_follow_owner` (migration NOS-1038), sans quoi
         * réaffecter une opportunité retirerait sa tâche au collègue à qui on
         * vient de la confier.
         *
         * Pas de `required()` : les appelants seedent déjà `sales_id` avec
         * l'identité courante, et `set_sales_id_default` rattrape une insertion
         * qui n'en porterait pas. Le rendre obligatoire ne protégerait de rien
         * et bloquerait l'édition d'une tâche historique sans responsable.
         *
         * Même filtre que le sélecteur de responsable d'opportunité : un compte
         * désactivé ne doit plus recevoir de travail (cf. DealInputs.tsx).
         */}
        <ReferenceInput
          source="sales_id"
          reference="sales"
          filter={{ "disabled@neq": true }}
        >
          <SelectInput
            label="Responsable"
            helperText={false}
            optionText={saleOptionRenderer}
          />
        </ReferenceInput>
      </div>
    </div>
  );
};
