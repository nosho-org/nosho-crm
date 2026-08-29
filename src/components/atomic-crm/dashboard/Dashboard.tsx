import { useGetList } from "ra-core";

import type { Contact, ContactNote } from "../types";
import { useGoogleConnectionStatus } from "../google/useGoogleConnectionStatus";
import { DashboardProvider } from "./DashboardContext";
import { DashboardFilters } from "./DashboardFilters";
import { DashboardKpiBanner } from "./DashboardKpiBanner";
import { DashboardStepper } from "./DashboardStepper";
import { CockpitDayBar } from "./CockpitDayBar";
import { CockpitFocus } from "./CockpitFocus";
import { CockpitQueue } from "./CockpitQueue";
import { NoshoAIAssist } from "./NoshoAIAssist";
import { PipelineFunnel } from "./PipelineFunnel";
import { PipelineHealthBanner } from "./PipelineHealthBanner";
import { RevenueForecastChart } from "./RevenueForecastChart";
import { TargetsCard } from "./TargetsCard";
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

/**
 * ---------------------------------------------------------------------------
 * Cockpit avant reporting (NOS-1167)
 * ---------------------------------------------------------------------------
 * L'audit du 29 août 2026 : « Le tableau de bord est un reporting de
 * direction, pas un cockpit. Les six cartes du haut sont toutes des montants
 * de pipeline, toutes au même poids typographique. […] Aucune ne répond à
 * "qu'est-ce que je fais maintenant". »
 *
 * La hiérarchie est donc inversée : ce qu'on a à faire d'abord, les
 * instruments de pilotage ensuite. Rien n'est supprimé — les six KPI, la
 * prévision et le funnel restent, plus bas, sous leur propre titre. Ils
 * servent une question réelle, simplement pas celle qu'on se pose en ouvrant
 * l'écran le matin.
 *
 * Les filtres restent en tête des deux : ils s'appliquent à tout.
 */
const Cockpit = () => (
  <div className="flex flex-col gap-4">
    <CockpitDayBar />
    <CockpitFocus />

    <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 items-start">
      <CockpitQueue />
      <div className="flex flex-col gap-4">
        <PipelineHealthBanner />
        <TargetsCard />
      </div>
    </div>
  </div>
);

const Reporting = () => (
  <div className="flex flex-col gap-5">
    <DashboardKpiBanner />

    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      <RevenueForecastChart />
      <PipelineFunnel />
    </div>
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

        <DashboardFilters />

        <Cockpit />

        {/*
          L'agenda et l'assistant restent, à côté de la file d'actions plutôt
          qu'en dessous d'elle : ce sont les deux compléments qu'on consulte en
          traitant sa journée. « Tâches à venir » a disparu — la file les porte
          désormais, groupées et chiffrées.
        */}
        <section
          className={`grid grid-cols-1 gap-5 ${showCalendar ? "lg:grid-cols-2" : ""}`}
        >
          {showCalendar && <UpcomingCalendarEvents />}
          <NoshoAIAssist />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-muted-foreground">
            Pilotage
          </h2>
          <Reporting />
        </section>
      </div>
    </DashboardProvider>
  );
};
