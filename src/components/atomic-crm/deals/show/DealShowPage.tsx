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
import { DealPriorityField } from "../DealPriorityField";
import { DealStageBadge, DealProductBadges } from "../shared/DealBadges";
import { DealActivityTimeline } from "./DealActivityTimeline";
import { DealArchiveButton, DealUnarchiveButton } from "./DealArchiveButtons";
import { DealCompanyGroup } from "./DealCompanyGroup";
import { DealCreateTaskButton } from "./DealCreateTaskButton";
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

const DealHeader = () => {
  const record = useRecordContext<Deal>();
  if (!record) return null;

  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Button asChild size="sm" variant="ghost" className="shrink-0">
            <Link to="/deals" aria-label="Retour aux opportunités">
              <ArrowLeft className="w-4 h-4" aria-hidden />
            </Link>
          </Button>
          <ReferenceField source="company_id" reference="companies" link="show">
            <CompanyAvatar width={40} height={40} />
          </ReferenceField>
          <h1 className="text-xl font-semibold min-w-0 truncate">
            {record.name}
            {record.company_id != null && (
              <>
                <span className="text-muted-foreground font-normal"> — </span>
                <ReferenceField
                  source="company_id"
                  reference="companies"
                  link={false}
                />
              </>
            )}
          </h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {record.archived_at ? (
            <DealUnarchiveButton record={record} />
          ) : (
            <>
              <DealCreateTaskButton />
              <EditButton />
              <GenerateProposalAction />
              <DealArchiveButton record={record} />
            </>
          )}
        </div>
      </div>

      {record.archived_at && (
        <Badge
          variant="outline"
          className="self-start text-[var(--deal-status-warning)] border-[var(--deal-status-warning)]"
        >
          Opportunité archivée
        </Badge>
      )}

      {/* Étape | Priorité | Produit(s) — the three badges the spec names. */}
      <div className="flex items-center gap-2 flex-wrap">
        <DealStageBadge stage={record.stage} />
        <DealPriorityField />
        <DealProductBadges products={record.products} />
      </div>
    </header>
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
        <DealCompanyGroup />
        <DealKeyContacts />
        <DealActivityTimeline />
      </div>

      <DealSidePanel />
    </div>
  </div>
);

export const DealShowPage = () => (
  <ShowBase>
    <DealShowLayout />
  </ShowBase>
);

export default DealShowPage;
