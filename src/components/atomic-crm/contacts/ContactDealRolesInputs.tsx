import { useGetList, useNotify, useRecordContext, useUpdate } from "ra-core";
import { Link } from "react-router-dom";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useConfigurationContext } from "../root/ConfigurationContext";
import {
  getContactRole,
  setContactRole,
} from "../deals/dealContactRoles";
import type { Contact, Deal } from "../types";

const AUCUN_ROLE = "__none__";

/**
 * ---------------------------------------------------------------------------
 * Le rôle décisionnel, éditable depuis le contact (NOS-1223)
 * ---------------------------------------------------------------------------
 * Simon : « impossible de modifier le rôle décisionnel sur la fiche du
 * contact, l'option n'est pas proposée, il faut aller dans la fiche complète
 * de l'opportunité. Peut-on ajouter cela sur "modifier le contact" ? »
 *
 * ## Pourquoi c'était absent, et pourquoi l'ajouter reste correct
 *
 * Le rôle n'appartient pas au contact : il qualifie la RELATION entre un
 * contact et une opportunité, et vit dans `deals.contact_roles`. Le même
 * médecin peut être décideur sur une affaire et simple prescripteur sur une
 * autre. C'est pourquoi il ne se trouvait que dans le formulaire
 * d'opportunité.
 *
 * Mais on ne rencontre pas les rôles par opportunité : on les rencontre en
 * parlant à quelqu'un. « Untel, c'est bien lui qui décide ? » se pose devant
 * sa fiche, pas devant une liste d'affaires. Le placer ici ne nie donc pas la
 * nature de la donnée — à condition de la montrer telle qu'elle est, soit une
 * ligne PAR opportunité, jamais un rôle unique attaché à la personne.
 *
 * ## Ces champs s'enregistrent seuls
 *
 * Le reste du formulaire écrit sur `contacts` et attend « Enregistrer ». Ces
 * sélecteurs-là écrivent sur `deals` : les rattacher au bouton du formulaire
 * demanderait de porter des modifications d'une autre ressource jusqu'à la
 * soumission, et un échec sur l'une laisserait l'autre à moitié écrite.
 *
 * Ils sauvegardent donc au changement, et le disent. Un contrôle qui se
 * comporte autrement que ses voisins doit l'annoncer, sinon il surprend.
 */
export const ContactDealRolesInputs = () => {
  const contact = useRecordContext<Contact>();
  const { dealContactRoles, archivedDealContactRoles } =
    useConfigurationContext();
  const [update, { isPending }] = useUpdate();
  const notify = useNotify();

  const { data: deals, refetch } = useGetList<Deal>(
    "deals",
    {
      pagination: { page: 1, perPage: 50 },
      sort: { field: "name", order: "ASC" },
      filter: { "contact_ids@cs": `{${contact?.id}}` },
    },
    { enabled: contact?.id != null },
  );

  // Une création n'a pas encore d'opportunité, et un contact peut n'être
  // rattaché à aucune : dans les deux cas la section n'aurait rien à dire.
  if (!contact?.id || !deals?.length) return null;

  const libelle = (slug: string | null) => {
    if (!slug) return "Non défini";
    return (
      dealContactRoles.find((r) => r.value === slug)?.label ??
      archivedDealContactRoles?.find((r) => r.value === slug)?.label ??
      slug
    );
  };

  const changer = (deal: Deal, valeur: string) => {
    const role = valeur === AUCUN_ROLE ? null : valeur;
    update(
      "deals",
      {
        id: deal.id,
        data: {
          contact_roles: setContactRole(
            deal.contact_roles ?? {},
            contact.id,
            role,
          ),
        },
        previousData: deal,
      },
      {
        onSuccess: () => {
          notify(
            role
              ? `Rôle « ${libelle(role)} » enregistré sur ${deal.name}`
              : `Rôle retiré sur ${deal.name}`,
            { type: "info" },
          );
          refetch();
        },
        onError: () => notify("Enregistrement impossible", { type: "error" }),
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h6 className="text-lg font-semibold">Rôles décisionnels</h6>
        {/*
          Dire les deux choses que ces champs ont de particulier : ils portent
          sur les opportunités, et ils n'attendent pas « Enregistrer ».
        */}
        <p className="text-sm text-muted-foreground">
          Le rôle dépend de l'opportunité : le même contact peut décider sur
          l'une et seulement prescrire sur l'autre. Ces choix s'enregistrent
          immédiatement.
        </p>
      </div>

      {deals.map((deal) => (
        <div key={deal.id} className="flex flex-col gap-1">
          <label className="text-sm font-medium">
            <Link
              to={`/deals/${deal.id}/show`}
              className="hover:underline underline-offset-4"
            >
              {deal.name}
            </Link>
          </label>
          <Select
            value={getContactRole(deal.contact_roles, contact.id) ?? AUCUN_ROLE}
            onValueChange={(valeur) => changer(deal, valeur)}
            disabled={isPending}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AUCUN_ROLE}>Non défini</SelectItem>
              {dealContactRoles.map((role) => (
                <SelectItem key={role.value} value={role.value}>
                  {role.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
};
