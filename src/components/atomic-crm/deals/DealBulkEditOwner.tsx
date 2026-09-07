import { useState } from "react";
import { UserRoundCog } from "lucide-react";
import {
  useGetList,
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

import type { Deal, Sale } from "../types";
import { pluralize } from "./cockpit/dealFormat";

/**
 * Réassigner plusieurs opportunités en une fois (NOS-1384).
 *
 * Simon : « quand j'ai toute la liste, que je puisse sélectionner plusieurs
 * opportunités et modifier en masse à qui elles sont assignées ». Le pendant
 * du changement d'étape en lot, pour l'autre colonne qu'on reprend par
 * paquets : un départ, une arrivée, une redistribution de secteur.
 *
 * ## Les comptes désactivés sont écartés
 *
 * Même filtre que le formulaire d'opportunité (`disabled@neq`). Réassigner
 * cinquante affaires à quelqu'un qui n'a plus accès au CRM les rendrait
 * invisibles à celui qui devait les traiter, sans que rien ne le signale.
 *
 * ## Ce que la réassignation entraîne, et qu'il faut dire
 *
 * Le trigger `deal_tasks_follow_owner` déplace aussi les tâches ouvertes de
 * chaque opportunité vers le nouveau responsable — mais seulement celles que
 * portait l'ANCIEN responsable, ou qui n'étaient assignées à personne. Une
 * tâche confiée à un tiers reste chez lui (NOS-1038).
 *
 * C'est le bon comportement, et c'est précisément pour ça qu'il doit être
 * annoncé : sur une seule opportunité l'effet se voit, sur cinquante il passe
 * inaperçu jusqu'au jour où quelqu'un cherche ses tâches.
 */
export const DealBulkEditOwner = () => {
  const { selectedIds } = useListContext<Deal>();
  const [updateMany, { isPending }] = useUpdateMany();
  const unselectAll = useUnselectAll("deals");
  const notify = useNotify();
  const refresh = useRefresh();

  const [open, setOpen] = useState(false);
  const [salesId, setSalesId] = useState<string>("");

  /*
   * La liste est chargée ici plutôt que par un `ReferenceInput` : celui-ci
   * exige un contexte de formulaire, et cette boîte de dialogue n'en a pas.
   */
  const { data: sales, isPending: chargement } = useGetList<Sale>("sales", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "first_name", order: "ASC" },
    filter: { "disabled@neq": true },
  });

  const count = selectedIds?.length ?? 0;
  if (count === 0) return null;

  const nomDe = (id: string) => {
    const sale = sales?.find((s) => String(s.id) === id);
    return sale ? `${sale.first_name} ${sale.last_name}` : id;
  };

  const apply = () => {
    if (!salesId) return;

    updateMany(
      "deals",
      { ids: selectedIds, data: { sales_id: Number(salesId) } },
      {
        /*
         * Pessimiste, comme le changement d'étape en lot : une réassignation
         * déplace aussi des tâches côté base. L'afficher comme faite avant que
         * le serveur n'ait répondu montrerait un état que personne n'a encore.
         */
        mutationMode: "pessimistic",
        onSuccess: () => {
          notify(
            `${pluralize(count, "opportunité réassignée", "opportunités réassignées")} à ${nomDe(salesId)}`,
            { type: "info" },
          );
          unselectAll();
          setOpen(false);
          setSalesId("");
          refresh();
        },
        onError: () =>
          notify("La réassignation a échoué", { type: "error" }),
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
        <UserRoundCog className="w-4 h-4" aria-hidden />
        Changer le responsable
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Changer le responsable</DialogTitle>
            <DialogDescription>
              {pluralize(
                count,
                "opportunité sélectionnée",
                "opportunités sélectionnées",
              )}
              . Les tâches ouvertes de l'ancien responsable le suivront ; celles
              confiées à quelqu'un d'autre ne bougeront pas.
            </DialogDescription>
          </DialogHeader>

          <Select value={salesId} onValueChange={setSalesId}>
            <SelectTrigger aria-label="Nouveau responsable">
              <SelectValue
                placeholder={
                  chargement ? "Chargement…" : "Choisir un responsable"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {(sales ?? []).map((sale) => (
                <SelectItem key={sale.id} value={String(sale.id)}>
                  {sale.first_name} {sale.last_name}
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
            <Button
              type="button"
              onClick={apply}
              disabled={!salesId || isPending}
            >
              {isPending ? "Réassignation…" : "Réassigner"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
