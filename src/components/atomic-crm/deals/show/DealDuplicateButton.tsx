import { Copy } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

import type { Deal } from "../../types";
import { brouillonDuplique } from "../dupliquerOpportunite";

/**
 * « Dupliquer » — ouvre une création préremplie depuis cette affaire.
 *
 * Simon, le 24/09/2026 : « quand un client redemande un autre produit, si la
 * carte est en Close Won on est obligé d'en refaire une manuellement du
 * début. »
 *
 * ## Un formulaire, pas une création immédiate
 *
 * Le bouton n'écrit rien. Il emmène sur `/deals/create` avec le brouillon dans
 * l'état de navigation, et `ra-core` le fusionne par-dessus les défauts de
 * création (`useRecordFromLocation`). L'utilisateur voit ce qui a été repris,
 * corrige le produit et le montant — qui changent presque toujours, puisque
 * c'est le motif même de la duplication — puis enregistre.
 *
 * Créer directement aurait fait un clic de moins et une opportunité fausse de
 * plus dans le pipeline : un ARR recopié tel quel compte dans les chiffres dès
 * la seconde qui suit, et personne ne revient corriger ce qui s'affiche déjà.
 *
 * ## Pourquoi `/deals/create` et pas la vue courante
 *
 * `/views/:id/create` existe aussi, mais la vue impose son `company_type` aux
 * créations qu'elle ouvre. Le brouillon porte déjà celui de l'affaire
 * d'origine ; passer par la route générale évite qu'une vue le remplace.
 *
 * ## Disponible même archivée
 *
 * Rien n'est modifié sur l'affaire d'origine, et une affaire archivée est
 * justement celle qu'on a le plus de raisons de reprendre.
 */
export const DealDuplicateButton = ({ record }: { record: Deal }) => {
  const navigate = useNavigate();

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() =>
        navigate("/deals/create", {
          state: { record: brouillonDuplique(record) },
        })
      }
    >
      <Copy className="w-4 h-4" aria-hidden />
      Dupliquer
    </Button>
  );
};
