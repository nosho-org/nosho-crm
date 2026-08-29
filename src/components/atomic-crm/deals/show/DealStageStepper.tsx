import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useGetOne, useNotify, useRecordContext, useUpdate } from "ra-core";
import { Button } from "@/components/ui/button";

import { useConfigurationContext } from "../../root/ConfigurationContext";
import type { Company, Deal } from "../../types";
import { isClosedStage } from "../cockpit/dealFields";
import {
  companyIsIdentified,
  siretRequiredMessage,
  stageRequiresSiret,
} from "../dealStageGuard";
import { celebrateWin } from "./celebrateWin";

/**
 * ---------------------------------------------------------------------------
 * Faire avancer l'opportunité depuis sa fiche (NOS-1168)
 * ---------------------------------------------------------------------------
 * L'audit du 29 août 2026 : « l'étape ne peut pas être changée depuis la
 * fiche : il faut retourner sur le Kanban et glisser la carte. »
 *
 * C'est le geste le plus fréquent du métier, et il demandait de quitter la
 * page où l'on vient précisément de lire de quoi décider.
 *
 * ## Ce que le stepper n'autorise pas
 *
 * **Les étapes terminales ne sont pas cliquables** — signé, perdu, churn.
 * Elles ne sont pas des étapes d'avancement mais des issues, et deux d'entre
 * elles demandent un motif que ce composant ne recueille pas. Elles restent
 * accessibles par « Éditer », où le formulaire les porte avec leur contexte.
 *
 * **Le garde-fou SIRET s'applique**, exactement comme sur le changement en
 * masse : un contrat identifie une personne morale, et une opportunité qui
 * passe en Qualifié sans SIRET produit plus tard un contrat troué.
 *
 * ## Le retour en arrière est permis
 *
 * On peut cliquer une étape déjà franchie. Un deal qui recule est une
 * information réelle — la démo a échoué, le dossier repart en qualification —
 * et l'interdire obligerait à passer par le formulaire pour dire la vérité.
 */
export const DealStageStepper = () => {
  const record = useRecordContext<Deal>();
  const { dealStages, dealPipelineStatuses } = useConfigurationContext();
  const [update, { isPending }] = useUpdate();
  const notify = useNotify();
  const [pendingStage, setPendingStage] = useState<string | null>(null);

  const { data: company } = useGetOne<Company>(
    "companies",
    { id: record?.company_id },
    { enabled: record?.company_id != null },
  );

  if (!record) return null;

  // Les étapes d'avancement, dans l'ordre : les issues sont retirées du rail.
  const steps = dealStages.filter(
    (stage) => !isClosedStage(stage.value, dealPipelineStatuses),
  );

  const currentIndex = steps.findIndex((step) => step.value === record.stage);
  const isClosed = isClosedStage(record.stage, dealPipelineStatuses);

  const move = (stage: string, label: string) => {
    if (stage === record.stage) return;

    if (stageRequiresSiret(stage) && !companyIsIdentified(company)) {
      notify(siretRequiredMessage(label), { type: "warning" });
      return;
    }

    setPendingStage(stage);
    update(
      "deals",
      { id: record.id, data: { stage }, previousData: record },
      {
        onSuccess: () => {
          notify(`Étape : ${label}`, { type: "info" });
          setPendingStage(null);
        },
        onError: (error) => {
          notify(
            `Changement d'étape impossible : ${
              error instanceof Error ? error.message : String(error)
            }`,
            { type: "error" },
          );
          setPendingStage(null);
        },
      },
    );
  };

  return (
    <nav
      aria-label="Étape de l'opportunité"
      className="flex items-center gap-1 flex-wrap"
    >
      {steps.map((step, index) => {
        const isCurrent = step.value === record.stage;
        // « Franchie » n'a de sens que si l'étape courante est sur le rail :
        // sur une affaire close, aucune ne l'est.
        const isPassed = !isClosed && currentIndex >= 0 && index < currentIndex;
        const isMoving = pendingStage === step.value;

        return (
          <Button
            key={step.value}
            type="button"
            size="sm"
            variant={isCurrent ? "default" : isPassed ? "secondary" : "ghost"}
            disabled={isPending}
            onClick={() => move(step.value, step.label)}
            aria-current={isCurrent ? "step" : undefined}
            className="h-7 px-2.5 text-xs"
          >
            {isMoving ? (
              <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
            ) : isPassed ? (
              <Check className="w-3 h-3" aria-hidden />
            ) : null}
            {step.label}
          </Button>
        );
      })}

      {/* Une affaire close le dit, plutôt que de laisser le rail sans repère
          courant — ce qui se lirait comme « aucune étape ». */}
      {isClosed && (
        <span className="ml-1 text-xs text-muted-foreground">
          Affaire close — l'issue se change depuis « Éditer ».
        </span>
      )}
    </nav>
  );
};

/**
 * Fête le passage en signé.
 *
 * Séparé du stepper parce que le passage en « signé » ne s'y fait pas : les
 * issues passent par le formulaire. Ce hook est appelé par la fiche, qui voit
 * l'étape changer d'où qu'elle vienne.
 *
 * `useRef` et non `useState` pour la mémoire : on veut savoir si l'effet a
 * déjà été joué sans provoquer de rendu supplémentaire, et surtout sans que la
 * question « faut-il fêter ? » dépende d'un état qui se met à jour en retard.
 *
 * Le repli sur `false` à la sortie de « signé » est délibéré : un deal
 * repassé en négociation puis re-signé mérite d'être fêté à nouveau.
 */
export const useCelebrateWin = (stage: string | null | undefined) => {
  const celebrated = useRef(false);

  useEffect(() => {
    if (stage === "closed-won") {
      if (!celebrated.current) {
        celebrated.current = true;
        celebrateWin();
      }
      return;
    }
    celebrated.current = false;
  }, [stage]);
};
