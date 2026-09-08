import { ChevronDown } from "lucide-react";
import { useRecordContext, useNotify, useRefresh, useUpdate } from "ra-core";
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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

/**
 * La catégorie, modifiable depuis la liste (NOS-1429).
 *
 * Simon, le 08/09/2026 : « depuis la page opportunité, permet aussi de pouvoir
 * changer la catégorie en masse ou par ligne ».
 *
 * Le lot existait déjà — `DealBulkEditCategory`, livré la veille. Manquait le
 * cas d'une seule ligne, où cocher, ouvrir un dialogue et le valider coûte
 * plus cher que le changement lui-même.
 *
 * ## Optimiste, contrairement au lot
 *
 * Une écriture d'un champ sur une ligne se corrige d'un clic si elle échoue,
 * et l'attente d'un aller-retour serveur sur un geste aussi petit se remarque.
 * Le lot, lui, reste pessimiste : quinze lignes affichées comme changées avant
 * l'accord du serveur seraient quinze mensonges à défaire.
 *
 * ## Cherchable, comme partout ailleurs
 *
 * Seize catégories : dérouler la liste entière pour en changer une seule
 * annulerait le temps gagné à ne pas ouvrir la fiche.
 */
export const DealCategoryCell = () => {
  const record = useRecordContext<Deal>();
  const { dealCategories, archivedDealCategories } = useConfigurationContext();
  const [update, { isPending }] = useUpdate();
  const notify = useNotify();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);

  if (!record) return null;

  /*
   * Le libellé se résout d'abord dans les catégories actives, puis dans les
   * archivées : une opportunité qui porte encore « Dentiste » ou « Groupement »
   * doit afficher son nom, pas son slug. Elle n'est pas re-sélectionnable pour
   * autant — la liste proposée ne contient que les catégories vivantes.
   */
  const libelle =
    dealCategories.find((c) => c.value === record.category)?.label ??
    archivedDealCategories?.find((c) => c.value === record.category)?.label ??
    record.category;

  const choisir = (value: string) => {
    setOpen(false);
    if (value === record.category) return;

    update(
      "deals",
      { id: record.id, data: { category: value }, previousData: record },
      {
        mutationMode: "optimistic",
        onSuccess: () => {
          const label =
            dealCategories.find((c) => c.value === value)?.label ?? value;
          notify(`Catégorie : « ${label} »`, { type: "info" });
          refresh();
        },
        onError: () => {
          notify("Le changement de catégorie a échoué", { type: "error" });
          refresh();
        },
      },
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/*
          Un bouton discret : la colonne reste lisible comme du texte, et
          n'annonce sa modifiabilité qu'au survol. Une liste de cent lignes où
          chaque cellule ressemble à un champ de formulaire se lit mal.
        */}
        <button
          type="button"
          disabled={isPending}
          onClick={(event) => event.stopPropagation()}
          className="group w-full text-left truncate inline-flex items-center gap-1 rounded px-1 -mx-1 hover:bg-muted disabled:opacity-50"
          aria-label={`Catégorie : ${libelle || "non renseignée"}. Modifier`}
        >
          <span className="truncate">
            {libelle || <span className="text-muted-foreground">—</span>}
          </span>
          <ChevronDown
            className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity"
            aria-hidden
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-56 p-0"
        onClick={(event) => event.stopPropagation()}
      >
        <Command>
          <CommandInput placeholder="Chercher une catégorie…" />
          <CommandList>
            <CommandEmpty>Aucune catégorie de ce nom.</CommandEmpty>
            <CommandGroup>
              {dealCategories.map((choice) => (
                <CommandItem
                  key={choice.value}
                  value={choice.label}
                  onSelect={() => choisir(choice.value)}
                >
                  <span className="w-3 shrink-0">
                    {record.category === choice.value ? "✓" : ""}
                  </span>
                  {choice.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
