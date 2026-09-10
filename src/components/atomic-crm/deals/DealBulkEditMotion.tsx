import { useState } from "react";
import { Check, Layers } from "lucide-react";
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

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Deal } from "../types";
import { pluralize } from "./cockpit/dealFormat";

/**
 * Sentinelle de « remettre à vide ».
 *
 * `null` ne peut pas servir d'état de sélection : il est indistinguable de
 * « rien de choisi », qui doit garder le bouton désactivé. Une chaîne
 * impossible comme valeur de motion sert donc de troisième état.
 */
const AUCUN = "__aucun__";

/**
 * ---------------------------------------------------------------------------
 * Qualifier plusieurs opportunités en une fois (NOS-1515)
 * ---------------------------------------------------------------------------
 * Simon, le 10/09/2026 : « depuis la page opportunité il faut pouvoir modifier
 * aussi le Motion en masse ».
 *
 * La demande suit d'un jour la livraison du champ (NOS-1485), et elle est
 * mécanique : la spec interdisait toute reprise de données, donc **les 263
 * opportunités de production sont nées sans motion**. Personne n'ouvrira 263
 * formulaires pour les qualifier une par une.
 *
 * Même patron que `DealBulkEditCategory`, y compris l'absence de garde-fou :
 * changer d'étape peut heurter le contrôle SIRET, réassigner peut déplacer des
 * tâches ; Motion ne fait que qualifier l'affaire et se corrige d'un second
 * passage.
 *
 * ## Ce dialogue-ci sait remettre à vide
 *
 * C'est sa seule différence avec celui des catégories, et elle vient de l'état
 * initial : la première passe de qualification se fera sur des lots, au
 * jugé, et se trompera. Sans retour possible, corriger un lot mal classé
 * demanderait d'ouvrir les fiches une par une — précisément ce que l'action de
 * masse existe pour éviter.
 *
 * « Vide » est d'ailleurs un état légitime ici, pas une absence de saisie : il
 * dit « pas encore tranché », et c'est ce que la colonne affiche par un tiret.
 *
 * ## Pas de champ de recherche
 *
 * Trois valeurs. Le dialogue des catégories en cherche seize, ce qui justifie
 * son `Command` ; ici une barre de recherche coûterait un champ à ignorer.
 */
export const DealBulkEditMotion = () => {
  const { selectedIds } = useListContext<Deal>();
  const { dealMotions } = useConfigurationContext();
  const [updateMany, { isPending }] = useUpdateMany();
  const unselectAll = useUnselectAll("deals");
  const notify = useNotify();
  const refresh = useRefresh();

  const [open, setOpen] = useState(false);
  const [choix, setChoix] = useState<string>("");

  const count = selectedIds.length;

  const apply = () => {
    if (!choix) return;
    const motion = choix === AUCUN ? null : choix;

    updateMany(
      "deals",
      { ids: selectedIds, data: { motion } },
      {
        /*
         * Pessimiste, comme les trois autres actions de masse : une écriture
         * sur des dizaines de lignes ne doit pas s'afficher comme faite avant
         * que le serveur l'ait acceptée, et `log_deal_change` journalise
         * chaque ligne séparément.
         */
        mutationMode: "pessimistic",
        onSuccess: () => {
          const libelle =
            choix === AUCUN
              ? null
              : (dealMotions.find((m) => m.value === choix)?.label ?? choix);
          notify(
            libelle
              ? `${pluralize(count, "opportunité qualifiée", "opportunités qualifiées")} en « ${libelle} »`
              : `Motion retiré sur ${pluralize(count, "opportunité", "opportunités")}`,
            { type: "info" },
          );
          unselectAll();
          setOpen(false);
          setChoix("");
          refresh();
        },
        onError: () =>
          notify("Le changement de Motion a échoué", { type: "error" }),
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
        <Layers className="w-4 h-4" aria-hidden />
        Changer le Motion
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Changer le Motion</DialogTitle>
            <DialogDescription>
              {pluralize(
                count,
                "opportunité sélectionnée",
                "opportunités sélectionnées",
              )}
              . Leur Motion actuel sera remplacé.
            </DialogDescription>
          </DialogHeader>

          <div
            className="flex flex-col gap-1"
            role="radiogroup"
            aria-label="Motion à appliquer"
          >
            {dealMotions.map((choice) => (
              <Button
                key={choice.value}
                type="button"
                variant={choix === choice.value ? "secondary" : "ghost"}
                role="radio"
                aria-checked={choix === choice.value}
                className="justify-start"
                onClick={() => setChoix(choice.value)}
              >
                <Check
                  className={`w-4 h-4 ${
                    choix === choice.value ? "opacity-100" : "opacity-0"
                  }`}
                  aria-hidden
                />
                {choice.label}
              </Button>
            ))}

            {/*
              Séparé des trois valeurs par un filet : effacer n'est pas une
              quatrième segmentation, c'est l'action inverse.
            */}
            <Button
              type="button"
              variant={choix === AUCUN ? "secondary" : "ghost"}
              role="radio"
              aria-checked={choix === AUCUN}
              className="justify-start mt-1 border-t rounded-t-none text-muted-foreground"
              onClick={() => setChoix(AUCUN)}
            >
              <Check
                className={`w-4 h-4 ${
                  choix === AUCUN ? "opacity-100" : "opacity-0"
                }`}
                aria-hidden
              />
              Aucun — remettre à vide
            </Button>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Annuler
            </Button>
            <Button type="button" onClick={apply} disabled={!choix || isPending}>
              {isPending ? "Application…" : "Appliquer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
