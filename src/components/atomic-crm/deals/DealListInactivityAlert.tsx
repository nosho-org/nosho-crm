import { useListContext } from "ra-core";
import { useMemo } from "react";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Deal } from "../types";
import { startOfToday } from "./cockpit/dealDates";
import { DormantAlert } from "./cockpit/DealInactivityAlert";

/**
 * ---------------------------------------------------------------------------
 * L'alerte « opportunités en sommeil », sur l'écran Opportunités (NOS-1013)
 * ---------------------------------------------------------------------------
 * Demandée par Marc-Henri (#94), qui a répondu deux fois « sur l'écran
 * opportunité » quand on lui a proposé le dashboard. NOS-955 l'a pourtant
 * déplacée là-bas, et `/deals` n'a plus gardé que du signalement ligne à ligne :
 * badge « Dormante » sur les cartes, cellule « Dernière activité » colorée. Le
 * compte agrégé — celui qui fait lever les yeux — avait disparu de l'écran où
 * l'on travaille.
 *
 * Ce conteneur relit ce que le cockpit calculait, mais depuis le contexte de
 * liste : `deals` vient de `useListContext`, et `activityOptions` se réduit à
 * trois valeurs de configuration. Monter `DealCockpitProvider` sur `/deals`
 * pour la seule alerte aurait amené avec lui la bannière de revenus, la table
 * de prévisions et son propre jeu de filtres — soit précisément ce que NOS-955
 * avait retiré de cet écran, et à raison.
 *
 * Conséquence assumée : l'alerte ne parle que des opportunités **chargées par
 * la liste**, donc filtrées comme elle. C'est cohérent avec l'écran — filtrer
 * sur un responsable et voir les dormantes de tout le monde serait plus
 * troublant qu'utile — mais ce n'est pas le même périmètre que le compteur du
 * dashboard, qui lui regarde tout.
 */
export const DealListInactivityAlert = () => {
  const { data, isPending } = useListContext<Deal>();
  const { dealPipelineStatuses, dealInactivityAlertDays } =
    useConfigurationContext();
  const today = startOfToday();

  const activityOptions = useMemo(
    () => ({
      pipelineStatuses: dealPipelineStatuses,
      thresholdDays: dealInactivityAlertDays,
      today,
    }),
    // `today` est un nouvel objet à chaque rendu ; on le stabilise par sa
    // valeur, sinon le mémo se recalculerait sans fin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dealPipelineStatuses, dealInactivityAlertDays, today.getTime()],
  );

  if (isPending || !data?.length) return null;

  return (
    <DormantAlert
      deals={data}
      activityOptions={activityOptions}
      thresholdDays={dealInactivityAlertDays}
    />
  );
};
