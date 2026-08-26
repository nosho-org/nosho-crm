import { useGetIdentity, useGetList } from "ra-core";

import type { Contact, ContactNote, Sale } from "../types";
import { useGoogleConnectionStatus } from "../google/useGoogleConnectionStatus";
import { DashboardProvider, useDashboard } from "./DashboardContext";
import { DashboardFilters } from "./DashboardFilters";
import { DashboardKpiBanner } from "./DashboardKpiBanner";
import { DashboardStepper } from "./DashboardStepper";
import { NoshoAIAssist } from "./NoshoAIAssist";
import { PipelineFunnel } from "./PipelineFunnel";
import { PipelineHealthBanner } from "./PipelineHealthBanner";
import { RevenueForecastChart } from "./RevenueForecastChart";
import { TasksList } from "./TasksList";
import { UpcomingCalendarEvents } from "./UpcomingCalendarEvents";
import { Welcome } from "./Welcome";

/**
 * ---------------------------------------------------------------------------
 * Tableau de bord (NOS-955)
 * ---------------------------------------------------------------------------
 * "Séparer clairement le pilotage business du pilotage opérationnel." The
 * reporting section answers, in order: where is the business, what have we
 * signed, what is in the pipeline, when could it land, and what needs attention?
 *
 *     Filtres → KPI → Prévision → Funnel → Santé du pipeline
 *
 * Gone with this redesign, as the spec asks: Contacts chauds, Opportunités
 * actives, Activité récente, and the deal preview. Anything that requires
 * working a deal now links through to Opportunités instead of expanding here.
 *
 * Tasks, agenda and the assistant are kept below, under their own heading: they
 * are personal operational tools, not business reporting, and the spec never
 * asked for them to go. Worth confirming with Marc-Henri.
 */

const Reporting = () => (
  <div className="flex flex-col gap-5">
    <DashboardFilters />
    <DashboardKpiBanner />

    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      <RevenueForecastChart />
      <PipelineFunnel />
    </div>

    <PipelineHealthBanner />
  </div>
);

export const Dashboard = () => {
  const {
    data: dataContact,
    total: totalContact,
    isPending: isPendingContact,
  } = useGetList<Contact>("contacts", {
    pagination: { page: 1, perPage: 1 },
  });

  const { total: totalContactNotes, isPending: isPendingContactNotes } =
    useGetList<ContactNote>("contact_notes", {
      pagination: { page: 1, perPage: 1 },
    });

  // Must be called before any early return (React hooks rules)
  const { data: googleStatus } = useGoogleConnectionStatus();
  const showCalendar =
    googleStatus?.connected &&
    googleStatus.preferences?.showCalendarOnDashboard;

  const isPending = isPendingContact || isPendingContactNotes;

  if (isPending) {
    return null;
  }

  if (!totalContact) {
    return <DashboardStepper step={1} />;
  }

  if (!totalContactNotes) {
    return <DashboardStepper step={2} contactId={dataContact?.[0]?.id} />;
  }

  return (
    /*
     * Le provider enveloppe désormais « Mon activité » aussi (NOS-1064).
     *
     * Il ne couvrait que le bloc de reporting, si bien que la liste de tâches
     * ne pouvait pas savoir quel responsable était sélectionné : changer de
     * responsable recalculait tous les chiffres au-dessus et laissait les
     * tâches inchangées. Deux périmètres sur un même écran, sans rien pour le
     * dire.
     */
    <DashboardProvider>
      <div className="flex flex-col gap-6 mt-1 pb-6">
        {import.meta.env.VITE_IS_DEMO === "true" ? <Welcome /> : null}

        <Reporting />

        <section className="flex flex-col gap-3">
          <ActivityHeading />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className={showCalendar ? "lg:col-span-5" : "lg:col-span-8"}>
              <TasksList />
            </div>
            {showCalendar && (
              <div className="lg:col-span-4">
                <UpcomingCalendarEvents />
              </div>
            )}
            <div className={showCalendar ? "lg:col-span-3" : "lg:col-span-4"}>
              <NoshoAIAssist />
            </div>
          </div>
        </section>
      </div>
    </DashboardProvider>
  );
};

/**
 * « Mon activité » ne dit plus la vérité dès qu'on regarde quelqu'un d'autre
 * (NOS-1064). Le titre suit donc le responsable sélectionné, plutôt que de
 * laisser croire que ces tâches sont les siennes.
 */
const ActivityHeading = () => {
  const { selection } = useDashboard();
  const { identity } = useGetIdentity();
  const { data: sales } = useGetList<Sale>("sales", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "last_name", order: "ASC" },
  });

  const isMine =
    selection.salesId != null &&
    identity?.id != null &&
    selection.salesId === identity.id.toString();

  const owner = (sales ?? []).find(
    (sale) => sale.id.toString() === selection.salesId,
  );

  const label =
    selection.salesId === null
      ? "Activité de l'équipe"
      : isMine || !owner
        ? "Mon activité"
        : `Activité de ${owner.first_name} ${owner.last_name}`.trim();

  return (
    <h2 className="text-sm font-semibold text-muted-foreground">{label}</h2>
  );
};
