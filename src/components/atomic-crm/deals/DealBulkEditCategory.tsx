import { useState } from "react";
import { Check, Tags } from "lucide-react";
import {
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Deal } from "../types";
import { pluralize } from "./cockpit/dealFormat";

/**
 * Reclasser plusieurs opportunités en une fois (NOS-1399).
 *
 * Simon, le 08/09/2026 : « je veux aussi qu'il soit possible de changer la
 * catégorie en masse depuis la page opportunité, et donc de pouvoir modifier
 * la catégorie sans avoir besoin de rentrer dans la page d'édition ».
 *
 * Le besoin est né le jour même : trois catégories venaient d'être ajoutées —
 * Clinique vétérinaire, Institution, Éditeur / plateforme — et quinze
 * opportunités attendaient d'y être rangées. Les reprendre une par une, c'est
 * quinze ouvertures de formulaire pour changer un seul champ.
 *
 * Même patron que `DealBulkEditStage` et `DealBulkEditOwner`, à une différence
 * près : **aucun garde-fou**. Changer d'étape peut heurter le contrôle SIRET,
 * réassigner peut déplacer des tâches ; une catégorie ne fait que qualifier
 * l'affaire, et se corrige d'un second passage. Rien à vérifier avant
 * d'écrire.
 */
export const DealBulkEditCategory = () => {
  const { selectedIds } = useListContext<Deal>();
  const { dealCategories } = useConfigurationContext();
  const [updateMany, { isPending }] = useUpdateMany();
  const unselectAll = useUnselectAll("deals");
  const notify = useNotify();
  const refresh = useRefresh();

  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>("");

  const count = selectedIds.length;

  const apply = () => {
    if (!category) return;

    updateMany(
      "deals",
      { ids: selectedIds, data: { category } },
      {
        /*
         * Pessimiste, comme le changement d'étape : une écriture sur quinze
         * lignes ne s'affiche pas comme faite avant que le serveur l'ait
         * acceptée, et `deal_change_log` la journalise ligne par ligne.
         */
        mutationMode: "pessimistic",
        onSuccess: () => {
          const label =
            dealCategories.find((c) => c.value === category)?.label ?? category;
          notify(
            `${pluralize(count, "opportunité reclassée", "opportunités reclassées")} en « ${label} »`,
            { type: "info" },
          );
          unselectAll();
          setOpen(false);
          setCategory("");
          refresh();
        },
        onError: () =>
          notify("Le changement de catégorie a échoué", { type: "error" }),
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
        <Tags className="w-4 h-4" aria-hidden />
        Changer la catégorie
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Changer la catégorie</DialogTitle>
            <DialogDescription>
              {pluralize(
                count,
                "opportunité sélectionnée",
                "opportunités sélectionnées",
              )}
              . Leur catégorie actuelle sera remplacée.
            </DialogDescription>
          </DialogHeader>

          {/*
            Cherchable, comme le champ du formulaire (NOS-1400) : la liste
            compte seize entrées, et ce dialogue sert précisément à ranger des
            lots d'opportunités — dérouler seize lignes à chaque passage
            annulerait le temps que l'action de masse fait gagner.
          */}
          <Command className="border rounded-md">
            <CommandInput placeholder="Chercher une catégorie…" />
            <CommandList>
              <CommandEmpty>Aucune catégorie de ce nom.</CommandEmpty>
              <CommandGroup>
                {dealCategories.map((choice) => (
                  <CommandItem
                    key={choice.value}
                    value={choice.label}
                    onSelect={() => setCategory(choice.value)}
                  >
                    <Check
                      className={`w-4 h-4 ${
                        category === choice.value ? "opacity-100" : "opacity-0"
                      }`}
                      aria-hidden
                    />
                    {choice.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>

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
              disabled={!category || isPending}
            >
              {isPending ? "Reclassement…" : "Reclasser"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
