import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { ShowBase, useRecordContext } from "ra-core";
import { EditButton } from "@/components/admin/edit-button";
import { ReferenceField } from "@/components/admin/reference-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { CompanyAvatar } from "../../companies/CompanyAvatar";
import type { Deal } from "../../types";
import { GenerateProposalAction } from "../GenerateProposalAction";
import { ContractAction } from "../../contracts/ContractAction";
import { ContractsBlock } from "../../contracts/ContractsBlock";
import { DealPriorityField } from "../DealPriorityField";
import { DealStageBadge, DealProductBadges } from "../shared/DealBadges";
import { DealActivityTimeline } from "./DealActivityTimeline";
import { DealArchiveButton, DealUnarchiveButton } from "./DealArchiveButtons";
import { DealCompanyGroup } from "./DealCompanyGroup";
import { DealCreateTaskButton } from "./DealCreateTaskButton";
import { DealEmailHistory } from "./DealEmailHistory";
import { DealKeyContacts } from "./DealKeyContacts";
import { DealNextTaskBlock } from "./DealNextTaskBlock";
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
 *     Header → Prochaine tâche → Tâches → Synthèse → Société & Groupe
 *            → Contacts clés → Activité
 *
 * "Tâches" sits directly under "Prochaine tâche" (issue #114) so everything the
 * opportunity owes is in one place rather than split across the page.
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
      <div className="flex items-center gap-3 flex-wrap [&>span]:text-sm [&>span>span]:text-sm">
        <DealStageBadge stage={record.stage} />
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
 */
const DealActions = () => {
  const record = useRecordContext<Deal>();
  if (!record) return null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {record.archived_at ? (
        <DealUnarchiveButton record={record} />
      ) : (
        <>
          <DealCreateTaskButton />
          <EditButton />
          <GenerateProposalAction />
          <ContractAction />
          <DealArchiveButton record={record} />
        </>
      )}
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
        <DealNextTaskBlock />
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
