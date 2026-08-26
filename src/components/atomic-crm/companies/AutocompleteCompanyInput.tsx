import { useCreate, useGetIdentity, useNotify } from "ra-core";
import { AutocompleteInput } from "@/components/admin/autocomplete-input";
import type { InputProps } from "ra-core";
import { useIsMobile } from "@/hooks/use-mobile";
import { CompanyCreateSuggestion } from "./CompanyCreateSuggestion";

/**
 * `richCreate` (NOS-1047) échange la création « nom seul » contre une feuille
 * demandant catégorie et groupe parent. Opt-in plutôt que défaut, pour deux
 * raisons : le formulaire de contact utilise le même input et n'a pas besoin de
 * ce détour, et surtout il peut lui-même être monté dans une feuille de
 * création de contact — empiler une troisième surface Radix par-dessus le
 * dialogue d'opportunité serait un piège à focus.
 */
export const AutocompleteCompanyInput = ({
  validate,
  defaultType,
  richCreate = false,
}: Pick<InputProps, "validate"> & {
  defaultType?: string;
  richCreate?: boolean;
}) => {
  const [create] = useCreate();
  const { identity } = useGetIdentity();
  const notify = useNotify();
  const handleCreateCompany = async (name?: string) => {
    if (!name) return;
    try {
      const newCompany = await create(
        "companies",
        {
          data: {
            name,
            sales_id: identity?.id,
            created_at: new Date().toISOString(),
            ...(defaultType ? { type: defaultType } : {}),
          },
        },
        { returnPromise: true },
      );
      return newCompany;
    } catch {
      notify("Erreur lors de la création de la société", {
        type: "error",
      });
    }
  };
  const isMobile = useIsMobile();

  return (
    <AutocompleteInput
      optionText="name"
      helperText={false}
      // Les deux modes de `useSupportCreateSuggestion` s'excluent : `onCreate`
      // crée sans UI, `create` monte un élément. On passe l'un ou l'autre.
      {...(richCreate
        ? { create: <CompanyCreateSuggestion defaultType={defaultType} /> }
        : { onCreate: handleCreateCompany })}
      createItemLabel="Créer %{item}"
      createLabel="Tapez pour créer une nouvelle société"
      validate={validate}
      modal={isMobile}
    />
  );
};
