import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateSuggestionContext,
  useGetIdentity,
  useNotify,
} from "ra-core";

import { CreateSheet } from "../misc/CreateSheet";
import type { Contact } from "../types";
import { ContactInputs } from "./ContactInputs";

/**
 * ---------------------------------------------------------------------------
 * Créer un contact sans quitter le formulaire d'opportunité (NOS-1048)
 * ---------------------------------------------------------------------------
 * Passé en prop `create` à un `AutocompleteArrayInput`, ce composant est monté
 * par `useSupportCreateSuggestion` (ra-core) dans un `CreateSuggestionContext`
 * qui expose `{ filter, onCancel, onCreate }`. Appeler `onCreate(record)`
 * ajoute l'id au tableau et referme la suggestion : c'est ce qui évite de
 * redemander à l'utilisateur de rechercher le contact qu'il vient de créer.
 *
 * `useCreateSuggestionContext` vient de `ra-core` et non du
 * `src/hooks/useSupportCreateSuggestion.tsx` local : ce dernier est marqué
 * `@deprecated`, n'est importé par personne, et son contexte ne correspondrait
 * pas à celui du provider monté par le hook de ra-core.
 *
 * La ressource écrite est `contacts`, la table — surtout pas
 * `contacts_summary`, qui est la vue interrogée par le picker et qui n'est pas
 * insérable. Le record renvoyé n'a donc pas de `company_name` (colonne calculée
 * par la vue), d'où l'invalidation ci-dessous : sans elle la puce du contact
 * s'afficherait sans sa société jusqu'au prochain refetch.
 */
export const ContactCreateSuggestion = ({
  companyId,
}: {
  /** Société déjà choisie sur l'opportunité, préremplie sur le contact. */
  companyId?: number | string | null;
}) => {
  const { filter, onCancel, onCreate } = useCreateSuggestionContext();
  const { identity } = useGetIdentity();
  const notify = useNotify();
  const queryClient = useQueryClient();

  if (!identity) return null;

  // Ce que l'utilisateur avait tapé dans le picker sert d'amorce. Un seul mot
  // va dans le prénom ; au-delà, le premier mot est le prénom et le reste le
  // nom — les deux champs sont `required()`, donc mieux vaut en préremplir un
  // approximativement que laisser le formulaire vide.
  const typed = (filter ?? "").trim();
  const [firstWord, ...rest] = typed.split(/\s+/).filter(Boolean);

  const handleSuccess = (data: Contact) => {
    notify("Contact créé");
    // La vue recalcule `company_name` et les compteurs : sans invalidation, le
    // picker et les listes de contacts restent sur leur ancien jeu.
    queryClient.invalidateQueries({ queryKey: ["contacts"] });
    queryClient.invalidateQueries({ queryKey: ["contacts_summary"] });
    // Rend la main à l'autocomplete, qui sélectionne le contact et referme.
    onCreate(data);
  };

  return (
    <CreateSheet
      resource="contacts"
      title={
        <span className="text-xl font-semibold truncate pr-10">
          Créer un contact
        </span>
      }
      redirect={false}
      record={{
        first_name: firstWord ?? "",
        last_name: rest.join(" "),
        company_id: companyId ?? undefined,
        sales_id: identity.id,
      }}
      transform={(data: Contact) => ({
        ...data,
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        tags: [],
      })}
      mutationOptions={{ onSuccess: handleSuccess }}
      open
      onOpenChange={(next) => {
        // La feuille ne se referme jamais toute seule ici : `onCancel` démonte
        // la suggestion côté autocomplete, ce que `onOpenChange(false)` seul ne
        // ferait pas — le create resterait « ouvert » sans UI.
        if (!next) onCancel();
      }}
    >
      <ContactInputs />
    </CreateSheet>
  );
};
