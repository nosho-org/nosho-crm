import { useGetList } from "ra-core";

import type { Contact, ContactNote } from "../types";
import { useGoogleConnectionStatus } from "../google/useGoogleConnectionStatus";
import { DashboardProvider } from "./DashboardContext";
import { DashboardFilters } from "./DashboardFilters";
import { DashboardKpiBanner } from "./DashboardKpiBanner";
import { DashboardStepper } from "./DashboardStepper";
import { BlurFade } from "@/components/ui/motion";
import { CockpitDayBar } from "./CockpitDayBar";
import { CockpitFocus } from "./CockpitFocus";
import { CockpitQueue } from "./CockpitQueue";
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
 * instruments de pilotage ensuite.
 *
 * Les KPI, eux, restent en haut mais **flottent** (NOS-1170, demandé par
 * Simon) : collés sous l'en-tête, ils suivent le défilement. Ils ne prennent
 * donc plus le meilleur emplacement de façon permanente — ils restent
 * consultables à tout moment sans qu'on ait à remonter, ce qui est le vrai
 * besoin qu'ils servaient.
 *
 * Les filtres restent en tête de tout : ils s'appliquent aux deux moitiés.
 *
 * ## L'ordre d'apparition dit l'ordre de lecture
 *
 * `BlurFade` échelonne les trois blocs du cockpit de 60 ms. Le décalage n'est
 * pas décoratif : il masque le temps de requête et guide l'œil de haut en bas,
 * dans l'ordre où l'écran doit être lu. Il joue une fois, jamais au re-render.
 */
const Cockpit = () => (
  <div className="flex flex-col gap-4">
    <BlurFade>
      <CockpitDayBar />
    </BlurFade>
    <BlurFade delayMs={60}>
      <CockpitFocus />
    </BlurFade>

    <BlurFade delayMs={120}>
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 items-start">
        <CockpitQueue />
        <div className="flex flex-col gap-4">
          <PipelineHealthBanner />
          <TargetsCard />
        </div>
      </div>
    </BlurFade>
  </div>
);

const Reporting = () => (
  <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
    <RevenueForecastChart />
    <PipelineFunnel />
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

        {/*
          Les KPI flottent sous l'en-tête (NOS-1170).

          `top-16` : l'en-tête de l'application est lui-même `sticky top-0`, et
          une bande collée à 0 passerait dessous. `-mx-*` puis `px-*` : la
          bande doit couvrir toute la largeur quand elle se fige, sinon on voit
          le contenu défiler dans ses marges.

          Le fond opaque n'est pas décoratif : sans lui, les cartes du cockpit
          transparaîtraient à travers.
        */}
        <div className="sticky top-16 z-30 -mx-[50px] px-[50px] py-2 bg-background border-b">
          <DashboardKpiBanner />
        </div>

        <Cockpit />

        {/*
          L'agenda seul. « Nosho Assist » n'est plus ici : il ne sert qu'à
          remonter des bugs, et sa place est le widget flottant du Layout,
          présent sur toutes les pages. Un encart de tableau de bord promettant
          des « suggestions intelligentes » désignait une fonction qui n'existe
          pas (NOS-1170).
        */}
        {showCalendar && (
          <section>
            <UpcomingCalendarEvents />
          </section>
        )}

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
