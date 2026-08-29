import { useState } from "react";
import { ChevronDown, FileSignature } from "lucide-react";
import { useRecordContext } from "ra-core";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { Deal } from "../types";
import { ContractDialog } from "./ContractDialog";

/**
 * « Éditer un contrat » sur la fiche opportunité (NOS-1156).
 *
 * Un menu à deux entrées plutôt que deux boutons : le contrat cadre et le POC
 * s'excluent dans le temps — on fait l'essai, puis on engage — et deux boutons
 * côte à côte donneraient à croire qu'on peut, ou doit, faire les deux.
 *
 * Le bouton n'apparaît pas sans société : le contrat identifie une personne
 * morale, et un contrat sans client n'a pas de sens. Mieux vaut ne rien
 * proposer que d'ouvrir une fenêtre qui refusera d'aboutir.
 */
export const ContractAction = ({
  variant = "outline",
}: {
  /** `default` quand c'est l'action principale de l'etape (NOS-1165). */
  variant?: "outline" | "default";
} = {}) => {
  const record = useRecordContext<Deal>();
  const [kind, setKind] = useState<"poc" | "cadre" | null>(null);

  if (!record?.company_id) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant={variant} size="sm">
            <FileSignature className="w-4 h-4" aria-hidden />
            Éditer un contrat
            <ChevronDown className="w-3.5 h-3.5 opacity-50" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setKind("poc")}>
            Contrat POC
            <span className="ml-2 text-xs text-muted-foreground">
              deux semaines, gratuit
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setKind("cadre")}>
            Contrat cadre
            <span className="ml-2 text-xs text-muted-foreground">
              12 mois + mandat SEPA
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {kind && (
        <ContractDialog
          deal={record}
          kind={kind}
          open
          onClose={() => setKind(null)}
        />
      )}
    </>
  );
};
