import { useQueryClient } from "@tanstack/react-query";
import {
  required,
  useCreateSuggestionContext,
  useGetIdentity,
  useNotify,
} from "ra-core";
import { ReferenceInput } from "@/components/admin/reference-input";
import { SelectInput } from "@/components/admin/select-input";
import { TextInput } from "@/components/admin/text-input";
import { AutocompleteInput } from "@/components/admin/autocomplete-input";

import { CreateSheet } from "../misc/CreateSheet";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Company } from "../types";

/**
 * ---------------------------------------------------------------------------
 * Créer une société depuis une opportunité, avec ce qui compte (NOS-1047)
 * ---------------------------------------------------------------------------
 * La création à la volée existait déjà, en version « nom seul » : un
 * `onCreate` inline sur l'autocomplete, sans aucune UI. Elle a un défaut
 * mesurable — `DealArrInput` propose un ARR à partir de
 * `company.establishment_type`, qu'une société créée ainsi n'a jamais. Le
 * préremplissage ne se déclenchait donc jamais sur ce chemin.
 *
 * Cette feuille demande les trois champs de la spec, et rien de plus : le
 * formulaire complet reste la page Sociétés. « Catégorie » au sens de la spec
 * (Hôpital, Clinique, Imagerie…) est bien `establishment_type`, pas `type` —
 * ce dernier est la *vue* (client, investisseur, partenaire), déjà choisie sur
 * l'opportunité et donc seedée sans être redemandée.
 *
 * `parent_company_id` n'a d'input nulle part ailleurs dans le CRM : la
 * hiérarchie de sociétés n'était jusqu'ici lisible que sur la fiche
 * opportunité (`DealCompanyGroup`). C'est le premier endroit qui permet de la
 * renseigner.
 */
export const CompanyCreateSuggestion = ({
  defaultType,
}: {
  /** Vue sélectionnée sur l'opportunité — seedée, non redemandée. */
  defaultType?: string;
}) => {
  const { filter, onCancel, onCreate } = useCreateSuggestionContext();
  const { identity } = useGetIdentity();
  const { establishmentTypes } = useConfigurationContext();
  const notify = useNotify();
  const queryClient = useQueryClient();

  if (!identity) return null;

  const handleSuccess = (data: Company) => {
    notify("Société créée");
    // `companies_summary` recalcule le nom du groupe et les compteurs ; sans
    // invalidation le picker reste sur son ancien jeu de choix.
    queryClient.invalidateQueries({ queryKey: ["companies"] });
    queryClient.invalidateQueries({ queryKey: ["companies_summary"] });
    onCreate(data);
  };

  return (
    <CreateSheet
      resource="companies"
      title={
        <span className="text-xl font-semibold truncate pr-10">
          Créer une société
        </span>
      }
      redirect={false}
      record={{
        // Ce que l'utilisateur avait tapé dans le picker.
        name: (filter ?? "").trim(),
        sales_id: identity.id,
        created_at: new Date().toISOString(),
        ...(defaultType ? { type: defaultType } : {}),
      }}
      mutationOptions={{ onSuccess: handleSuccess }}
      open
      onOpenChange={(next) => {
        // `onCancel` démonte la suggestion côté autocomplete ; un simple
        // `onOpenChange(false)` laisserait le create ouvert sans UI.
        if (!next) onCancel();
      }}
    >
      <div className="flex flex-col gap-4">
        <TextInput
          source="name"
          label="Nom de la société"
          validate={required()}
          helperText={false}
        />
        <SelectInput
          source="establishment_type"
          label="Catégorie"
          choices={establishmentTypes}
          optionText="label"
          optionValue="value"
          helperText="Détermine l'ARR proposé sur les opportunités de cette société"
        />
        <ReferenceInput
          source="parent_company_id"
          reference="companies"
          perPage={10}
        >
          <AutocompleteInput
            label="Groupe parent"
            optionText="name"
            helperText={false}
          />
        </ReferenceInput>
      </div>
    </CreateSheet>
  );
};
