import { useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import {
  useDataProvider,
  useListContext,
  useNotify,
  useRefresh,
  useUnselectAll,
  useUpdateMany,
} from "ra-core";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Deal } from "../types";
import { pluralize } from "./cockpit/dealFormat";
import {
  countDealsMissingSiret,
  siretRequiredMessage,
  stageRequiresSiret,
} from "./dealStageGuard";

/**
 * Move several opportunities to a stage in one go (NOS-956 §6).
 *
 * "On peut cocher 15 opportunités → Changer l'étape → Qualifié. Ça peut
 * transformer le nettoyage d'une demi-journée en 20 min." This is the tool that
 * empties the "À reclasser" queue the migration filled.
 *
 * `index` is deliberately left alone. It orders cards *within* a kanban column,
 * and recomputing it for a bulk move would mean reading and rewriting both
 * columns entirely — for an ordering the next drag resets anyway. The moved
 * deals land at their existing index in the target column, which the board
 * renders fine.
 */
export const DealBulkEditStage = () => {
  const { selectedIds, data } = useListContext<Deal>();
  const dataProvider = useDataProvider();
  const { dealStages } = useConfigurationContext();
  const [updateMany, { isPending }] = useUpdateMany();
  const unselectAll = useUnselectAll("deals");
  const notify = useNotify();
  const refresh = useRefresh();

  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<string>("");

  const count = selectedIds?.length ?? 0;
  if (count === 0) return null;

  const apply = async () => {
    if (!stage) return;

    /*
     * Contrôle SIRET avant l'écriture en lot (NOS-1150).
     *
     * Tout ou rien, délibérément : `updateMany` n'a pas de demi-mesure, et
     * appliquer sur la moitié de la sélection laisserait l'utilisateur devant
     * un écran dont il ne saurait pas dire ce qui est passé. Mieux vaut refuser
     * en nommant le nombre d'opportunités en cause.
     */
    if (stageRequiresSiret(stage)) {
      const deals = selectedIds.map((id) => {
        const record = data?.find((deal) => String(deal.id) === String(id));
        return { id, company_id: record?.company_id ?? null };
      });
      let blocked = 0;
      try {
        blocked = await countDealsMissingSiret(dataProvider, deals, stage);
      } catch {
        // Contrôle indisponible : on laisse passer plutôt que de bloquer une
        // opération légitime sur une panne de lecture.
        blocked = 0;
      }
      if (blocked > 0) {
        const label = dealStages.find((s) => s.value === stage)?.label ?? stage;
        notify(siretRequiredMessage(label, blocked), {
          type: "warning",
          autoHideDuration: 8000,
        });
        return;
      }
    }

    updateMany(
      "deals",
      { ids: selectedIds, data: { stage } },
      {
        mutationMode: "pessimistic",
        onSuccess: () => {
          const label =
            dealStages.find((s) => s.value === stage)?.label ?? stage;
          notify(
            `${pluralize(count, "opportunité déplacée", "opportunités déplacées")} vers « ${label} »`,
            { type: "info" },
          );
          unselectAll();
          setOpen(false);
          setStage("");
          refresh();
        },
        onError: () =>
          notify("Le changement d'étape a échoué", { type: "error" }),
      },
    );
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <ArrowRightLeft className="w-4 h-4" aria-hidden />
        Changer l'étape
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Changer l'étape</DialogTitle>
            <DialogDescription>
              {pluralize(
                count,
                "opportunité sélectionnée",
                "opportunités sélectionnées",
              )}
              . Leur étape actuelle sera remplacée.
            </DialogDescription>
          </DialogHeader>

          <Select value={stage} onValueChange={setStage}>
            <SelectTrigger aria-label="Nouvelle étape">
              <SelectValue placeholder="Choisir une étape" />
            </SelectTrigger>
            <SelectContent>
              {dealStages.map((choice) => (
                <SelectItem key={choice.value} value={choice.value}>
                  {choice.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Annuler
            </Button>
            {/* Pessimistic: a bulk move is not something to show as done before
                the server agrees, and the queue it empties is audited. */}
            <Button
              type="button"
              onClick={apply}
              disabled={!stage || isPending}
            >
              {isPending ? "Déplacement…" : "Déplacer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
