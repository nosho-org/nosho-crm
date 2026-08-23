import { useGetList } from "ra-core";

import type { Contact, ContactNote } from "../types";
import { useGoogleConnectionStatus } from "../google/useGoogleConnectionStatus";
import { DashboardProvider } from "./DashboardContext";
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
  <DashboardProvider>
    <div className="flex flex-col gap-5">
      <DashboardFilters />
      <DashboardKpiBanner />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <RevenueForecastChart />
        <PipelineFunnel />
      </div>

      <PipelineHealthBanner />
    </div>
  </DashboardProvider>
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
    <div className="flex flex-col gap-6 mt-1 pb-6">
      {import.meta.env.VITE_IS_DEMO === "true" ? <Welcome /> : null}

      <Reporting />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Mon activité
        </h2>
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
  );
};
