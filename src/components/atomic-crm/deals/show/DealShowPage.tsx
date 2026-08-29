import { ArrowLeft, MoreHorizontal } from "lucide-react";
import { Link } from "react-router-dom";
import { ShowBase, useRecordContext } from "ra-core";
import { EditButton } from "@/components/admin/edit-button";
import { ReferenceField } from "@/components/admin/reference-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { CompanyAvatar } from "../../companies/CompanyAvatar";
import type { Deal } from "../../types";
import { GenerateProposalAction } from "../GenerateProposalAction";
import { ContractAction } from "../../contracts/ContractAction";
import { ContractsBlock } from "../../contracts/ContractsBlock";
import { DealPriorityField } from "../DealPriorityField";
import { DealProductBadges } from "../shared/DealBadges";
import { DealActivityTimeline } from "./DealActivityTimeline";
import { DealArchiveButton, DealUnarchiveButton } from "./DealArchiveButtons";
import { DealCompanyGroup } from "./DealCompanyGroup";
import { DealCreateTaskButton } from "./DealCreateTaskButton";
import { DealStageStepper, useCelebrateWin } from "./DealStageStepper";
import { getDealPrimaryAction } from "./dealPrimaryAction";
import { DealEmailHistory } from "./DealEmailHistory";
import { DealKeyContacts } from "./DealKeyContacts";
import { DealSidePanel } from "./DealSidePanel";
import { DealSynthesis } from "./DealSynthesis";
import { DealTasksBlock } from "./DealTasksBlock";

/**
 * ---------------------------------------------------------------------------
 * Fiche opportunité (NOS-957 / NOS-958)
 * ---------------------------------------------------------------------------
 * A page, not the modal it used to be. The 25 % side column and the imposed
 * vertical order are impossible inside a `Dialog lg:max-w-4xl`.
 *
 * The order is prescriptive, and a test asserts it on the DOM:
 *
 *     Header → Prochaine action → Synthèse → Société & Groupe
 *            → Contacts clés → Activité
 *
 * « Prochaine action » et « Tâches » ne font plus qu'un bloc (NOS-1164) : la
 * première carte répétait mot pour mot la première ligne de la seconde, la
 * prochaine action étant littéralement la première tâche.
 *
 * "La colonne droite commence au niveau de Prochaine action" — hence the grid
 * starting below the header rather than wrapping it.
 */

/**
 * Titre : le nom de la société, encadré, et rien d'autre.
 *
 * L'intitulé de l'opportunité le doublait presque toujours — « Clinique
 * Bonneveine (consultation, radio etc..) — Hôpital — clinique de Bonneveine
 * (Saint Joseph) » est une seule et même information écrite deux fois. Il n'est
 * pas perdu pour autant : la Synthèse le porte désormais sous « Intitulé », là
 * où vivent les autres champs du deal.
 *
 * Repli sur `record.name` quand la société manque : une page sans titre est
 * pire qu'un titre redondant.
 */
const DealHeader = () => {
  const record = useRecordContext<Deal>();
  /*
   * Les confettis suivent l'étape d'où qu'elle change : le stepper, le
   * formulaire d'édition, ou un glissement de carte dans un autre onglet.
   *
   * Appelé avant le `return null`, comme tout hook : le sortir sous la garde
   * le ferait disparaître pendant le chargement, et React refuserait le rendu
   * suivant.
   */
  useCelebrateWin(record?.stage);
  if (!record) return null;

  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <Button asChild size="sm" variant="ghost" className="shrink-0">
          <Link to="/deals" aria-label="Retour aux opportunités">
            <ArrowLeft className="w-4 h-4" aria-hidden />
          </Link>
        </Button>
        <ReferenceField source="company_id" reference="companies" link="show">
          <CompanyAvatar width={40} height={40} />
        </ReferenceField>
        <h1 className="min-w-0">
          <span className="inline-flex max-w-full items-center truncate rounded-lg border bg-card px-4 py-2 text-xl font-bold text-foreground">
            {record.company_id != null ? (
              <ReferenceField
                source="company_id"
                reference="companies"
                link={false}
              />
            ) : (
              record.name
            )}
          </span>
        </h1>
      </div>

      {record.archived_at && (
        <Badge
          variant="outline"
          className="self-start text-[var(--deal-status-warning)] border-[var(--deal-status-warning)]"
        >
          Opportunité archivée
        </Badge>
      )}

      {/*
        Étape | Priorité | Produit(s) — les trois badges que la spec nomme,
        agrandis et laissés à gauche.

        La taille est imposée ici par sélecteur descendant, et non par une prop
        passée aux badges : `shared/DealBadges.tsx` porte la mention « Frozen
        after the socle. Consumers compose them; nobody edits them », parce
        qu'une retouche là-bas change trois écrans d'un coup. `[&>span>span]`
        l'emporte sur le `text-xs` interne par spécificité, sans toucher au
        composant partagé.
      */}
      {/*
        L'étape n'est plus un badge mais un rail cliquable (NOS-1168).

        Elle était en lecture seule ici, et la seule façon de faire avancer une
        opportunité était de retourner au Kanban glisser sa carte — depuis la
        page où l'on vient précisément de lire de quoi décider.
      */}
      <DealStageStepper />

      <div className="flex items-center gap-3 flex-wrap [&>span]:text-sm [&>span>span]:text-sm">
        <DealPriorityField />
        <DealProductBadges products={record.products} />
      </div>
    </header>
  );
};

/**
 * Les actions, en haut de la colonne droite plutôt qu'en face du titre.
 *
 * Elles partageaient la ligne du titre, qui devait donc composer avec sept
 * boutons et se faisait tronquer. Ici elles s'empilent au-dessus de la carte
 * client, dans la colonne qui a la place de les recevoir.
 *
 * ---------------------------------------------------------------------------
 * Une seule action pleine, et « Archiver » n'en est jamais une (NOS-1165)
 * ---------------------------------------------------------------------------
 * L'audit du 29 août 2026 : « Cinq boutons de même poids, aucun principal.
 * L'action qui fait avancer le deal et celle qui l'enterre ont la même
 * apparence. » C'était vrai — cinq contours identiques, à lire un par un.
 *
 * Désormais : une action pleine choisie d'après l'étape
 * (`getDealPrimaryAction`), les autres en contour, et « Archiver » dans un menu
 * ⋯. Archiver n'est pas une action rare — c'est une action *terminale*, et une
 * action terminale ne se met pas à portée de clic distrait à côté de celle
 * qu'on vient faire.
 *
 * Sur une opportunité close — gagnée, perdue, churn — il n'y a pas d'action
 * pleine du tout. Tout reste accessible, rien n'est mis en avant : il n'y a
 * plus rien à faire avancer.
 */
const DealActions = () => {
  const record = useRecordContext<Deal>();
  if (!record) return null;

  if (record.archived_at) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <DealUnarchiveButton record={record} />
      </div>
    );
  }

  const primary = getDealPrimaryAction(record.stage, {
    hasCompany: record.company_id != null,
  });

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <DealCreateTaskButton
        variant={primary === "task" ? "default" : "outline"}
      />
      <EditButton />
      <GenerateProposalAction
        variant={primary === "proposal" ? "default" : "outline"}
      />
      <ContractAction
        variant={primary === "contract" ? "default" : "outline"}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="Autres actions"
          >
            <MoreHorizontal className="w-4 h-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/*
            `DealArchiveButton` porte sa propre confirmation et son propre
            appel : on l'enveloppe plutôt que de le réécrire en élément de
            menu. `onSelect` est neutralisé pour que le menu ne se ferme pas
            sous la boîte de dialogue qu'il ouvre.
          */}
          <DropdownMenuItem
            onSelect={(event) => event.preventDefault()}
            className="p-0 focus:bg-transparent"
          >
            <DealArchiveButton record={record} />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

const DealShowLayout = () => (
  <div className="flex flex-col gap-4 pb-8">
    <DealHeader />

    {/*
      Desktop-first, 75 / 25. The side column starts here, level with
      "Prochaine action", not at the top of the page.
    */}
    <div className="grid grid-cols-1 lg:grid-cols-[3fr_1fr] gap-4 items-start">
      <div className="flex flex-col gap-4 min-w-0">
        <DealTasksBlock />
        <DealSynthesis />
        <ContractsBlock />
        <DealCompanyGroup />
        <DealKeyContacts />
        <DealEmailHistory />
        <DealActivityTimeline />
      </div>

      <div className="flex flex-col gap-4">
        <DealActions />
        <DealSidePanel />
      </div>
    </div>
  </div>
);

export const DealShowPage = () => (
  <ShowBase>
    <DealShowLayout />
  </ShowBase>
);

export default DealShowPage;
