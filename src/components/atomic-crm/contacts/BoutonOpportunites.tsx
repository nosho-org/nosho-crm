import { Target } from "lucide-react";
import { useGetList, useRecordContext } from "ra-core";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { findDealLabel } from "../deals/deal";
import { formatCurrencyCompact } from "../misc/formatCurrency";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Contact, Deal } from "../types";
import { opportunitesOuvertes } from "./opportunitesDuContact";

/**
 * ---------------------------------------------------------------------------
 * Remonter du contact à son opportunité (NOS-1483)
 * ---------------------------------------------------------------------------
 * Simon, le 09/09/2026 : « au niveau de la fiche contact, mets un bouton qui
 * permet de remonter directement sur l'opportunité sur laquelle il est
 * associé ».
 *
 * Le chemin existait dans un seul sens. Une opportunité liste ses contacts
 * (`DealKeyContacts`), une société liste ses opportunités — mais depuis la
 * fiche d'une personne, il fallait passer par sa société puis retrouver la
 * bonne affaire. Or c'est en parlant à quelqu'un qu'on a besoin du dossier.
 *
 * ## Les ouvertes seulement
 *
 * Simon, après un premier jet qui listait tout : « mets que les opportunités
 * ouvertes en fait ». Ni les affaires arrivées à leur terme, ni les archivées
 * — {@link opportunitesOuvertes} porte la règle et le prix mesuré du filtre.
 *
 * ## Un bouton, ou une liste, selon ce que le contact porte vraiment
 *
 * Compté en production : sur 516 contacts, **223 ont exactement une
 * opportunité ouverte**, deux en ont plusieurs (l'un en a cinq), et 291 n'en
 * ont aucune.
 *
 * Le cas courant mérite donc un lien direct — un menu à un seul élément serait
 * un clic ajouté pour rien. Les deux autres méritent le menu : afficher
 * « l'opportunité » au singulier en en cachant quatre ferait passer un choix
 * arbitraire pour un fait.
 *
 * Aucun bouton quand il n'y a rien d'ouvert : un bouton désactivé occuperait
 * la même place sans jamais rien faire, et la fiche de la société reste le
 * chemin complet vers les affaires closes.
 */
export const BoutonOpportunites = ({
  className,
}: {
  className?: string;
}) => {
  const contact = useRecordContext<Contact>();
  const { dealStages, dealPipelineStatuses, currency } =
    useConfigurationContext();

  const { data, isPending } = useGetList<Deal>(
    "deals",
    {
      // Le maximum observé est de cinq, toutes étapes confondues ; vingt-cinq
      // laisse de la marge sans jamais paginer. Le tri des ouvertes se fait
      // ensuite côté client, sur si peu de lignes.
      pagination: { page: 1, perPage: 25 },
      sort: { field: "updated_at", order: "DESC" },
      filter: { "contact_ids@cs": `{${contact?.id}}` },
    },
    { enabled: contact?.id != null },
  );

  // Pendant le chargement, rien : un bouton fantôme qui se remplirait ensuite
  // déplacerait l'en-tête sous le curseur.
  if (isPending || !data?.length) return null;

  const opportunites = opportunitesOuvertes(data, dealPipelineStatuses);

  // Le contact a des affaires, mais aucune en cours : 96 contacts sur 516.
  if (!opportunites.length) return null;

  if (opportunites.length === 1) {
    const seule = opportunites[0];
    return (
      <Button asChild variant="outline" className={className}>
        <Link to={`/deals/${seule.id}/show`}>
          <Target className="h-4 w-4" aria-hidden />
          Voir l'opportunité
        </Link>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={className}>
          <Target className="h-4 w-4" aria-hidden />
          {opportunites.length} opportunités
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {opportunites.map((opportunite) => (
          <DropdownMenuItem key={opportunite.id} asChild>
            <Link
              to={`/deals/${opportunite.id}/show`}
              className="flex flex-col items-start gap-0.5"
            >
              <span className="font-medium truncate w-full">
                {opportunite.name}
              </span>
              {/*
                L'étape et le montant, parce que c'est ce qui permet de
                reconnaître la bonne affaire. Un nom seul ne suffit pas quand
                une même société en porte plusieurs.
              */}
              <span className="text-xs text-muted-foreground">
                {findDealLabel(dealStages, opportunite.stage) ??
                  opportunite.stage}
                {opportunite.amount != null
                  ? ` · ${formatCurrencyCompact(opportunite.amount, currency)} ARR`
                  : ""}
              </span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
