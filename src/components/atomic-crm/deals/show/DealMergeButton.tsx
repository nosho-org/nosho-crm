import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowDown, Merge } from "lucide-react";
import {
  Form,
  required,
  useDataProvider,
  useGetList,
  useGetOne,
  useNotify,
  useRedirect,
  type Identifier,
} from "ra-core";
import { AutocompleteInput } from "@/components/admin/autocomplete-input";
import { ReferenceInput } from "@/components/admin/reference-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { CrmDataProvider } from "../../providers/types";
import type { Deal } from "../../types";

/**
 * ---------------------------------------------------------------------------
 * « Fusionner avec une autre opportunité »
 * ---------------------------------------------------------------------------
 * Simon, le 24/09/2026, en donnant deux fiches : l'AP-HM et l'Hôpital Nord
 * (AP-HM). Un seul établissement, deux opportunités, la matière commerciale
 * répartie entre les deux.
 *
 * ## La fiche affichée est celle qui est absorbée
 *
 * Même sens que la fusion de contacts et celle de sociétés : on part de la
 * fiche en trop et on désigne celle qu'on garde. Le dialogue le dit en toutes
 * lettres plutôt que de le laisser deviner, parce que le sens inverse est tout
 * aussi plausible et que l'opération n'est pas symétrique.
 *
 * Elle n'est pas supprimée pour autant — archivée. Une fusion faite à
 * l'envers se rattrape en la remettant dans le board.
 *
 * ## Ce que le dialogue annonce avant le clic
 *
 * Le décompte de ce qui va bouger, et les deux surprises possibles : l'ARR
 * n'est pas additionné, et les deux fiches peuvent porter des sociétés
 * différentes. Les annoncer après coup dans une note ne sert qu'à celui qui
 * relit ; les annoncer avant sert à celui qui décide.
 */
/** Une seule ligne : on ne veut que le `total`, jamais les enregistrements. */
const PREMIÈRE = { page: 1, perPage: 1 };

export const DealMergeButton = ({ record }: { record: Deal }) => {
  const [ouvert, setOuvert] = useState(false);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOuvert(true)}
      >
        <Merge className="w-4 h-4" aria-hidden />
        Fusionner
      </Button>
      {ouvert && (
        <DealMergeDialog perdante={record} onClose={() => setOuvert(false)} />
      )}
    </>
  );
};

const DealMergeDialog = ({
  perdante,
  onClose,
}: {
  perdante: Deal;
  onClose: () => void;
}) => {
  const [gagnanteId, setGagnanteId] = useState<Identifier | null>(null);
  const dataProvider = useDataProvider<CrmDataProvider>();
  const queryClient = useQueryClient();
  const notify = useNotify();
  const redirect = useRedirect();

  const { data: gagnante } = useGetOne<Deal>(
    "deals",
    { id: gagnanteId as Identifier },
    { enabled: gagnanteId != null },
  );

  // Les décomptes de ce qui sera déplacé. `perPage: 1` suffit : `total` vient
  // de l'en-tête `Content-Range`, donc rien n'est rapatrié pour compter.
  const compte = { filter: { deal_id: perdante.id }, pagination: PREMIÈRE };
  const { total: notes } = useGetList("deal_notes", compte);
  const { total: taches } = useGetList("tasks", compte);
  const { total: contrats } = useGetList("contracts", compte);

  const { mutateAsync, isPending } = useMutation({
    mutationFn: () => dataProvider.mergeDeals(perdante.id, gagnanteId!),
  });

  const fusionner = async () => {
    if (gagnanteId == null) return;
    try {
      await mutateAsync();
      // Les deux fiches, leurs notes et leurs tâches ont changé : on invalide
      // large plutôt que d'énumérer des clés et d'en oublier une.
      await queryClient.invalidateQueries();
      notify("Opportunités fusionnées", { type: "success", undoable: false });
      onClose();
      redirect(`/deals/${gagnanteId}/show`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "La fusion a échoué", {
        type: "error",
      });
    }
  };

  const societesDifferentes =
    gagnante != null && gagnante.company_id !== perdante.company_id;

  const ligne = (n: number | undefined, un: string, plusieurs: string) =>
    n != null && n > 0 ? (
      <li>
        • {n} {n === 1 ? un : plusieurs}
      </li>
    ) : null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="md:min-w-lg max-w-2xl">
        <DialogHeader>
          <DialogTitle>Fusionner cette opportunité</DialogTitle>
          <DialogDescription>
            Tout ce qui est rattaché à cette fiche part sur celle que vous
            choisissez, puis celle-ci est archivée.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
            <p className="font-medium text-sm">
              Cette opportunité (sera archivée)
            </p>
            <p className="text-sm mt-1 text-muted-foreground">
              {perdante.name}
            </p>

            <div className="flex justify-center my-4">
              <ArrowDown
                className="h-5 w-5 text-muted-foreground"
                aria-hidden
              />
            </div>

            <p className="font-medium text-sm mb-2">Opportunité conservée</p>
            <Form>
              <ReferenceInput
                source="gagnante_id"
                reference="deals"
                filter={{
                  "id@neq": perdante.id,
                  "archived_at@is": null,
                }}
              >
                <AutocompleteInput
                  label=""
                  optionText="name"
                  validate={required()}
                  onChange={setGagnanteId}
                  helperText={false}
                />
              </ReferenceInput>
            </Form>
          </div>

          {gagnanteId != null && (
            <>
              <div className="space-y-2">
                <p className="font-medium text-sm">Ce qui sera déplacé :</p>
                <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                  {ligne(notes, "note", "notes")}
                  {ligne(taches, "tâche", "tâches")}
                  {ligne(contrats, "contrat", "contrats")}
                  <li>
                    • Les contacts, leurs rôles et les produits sont réunis ; la
                    description est reprise à la suite.
                  </li>
                  <li>• Les appels rattachés suivent également.</li>
                </ul>
              </div>

              <div className="space-y-2">
                <p className="font-medium text-sm">Ce qui ne bouge pas :</p>
                <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                  <li>
                    {/* La surprise la plus coûteuse : un ARR additionné
                        doublerait le pipeline sur un clic présenté comme un
                        rangement. */}
                    • L'ARR n'est pas additionné — celui de la fiche conservée
                    est gardé tel quel.
                  </li>
                  <li>
                    • L'étape, la priorité et les dates de la fiche conservée.
                  </li>
                  <li>
                    • L'historique des changements reste sur la fiche archivée.
                  </li>
                </ul>
              </div>

              {societesDifferentes && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" aria-hidden />
                  <AlertTitle>Deux sociétés différentes</AlertTitle>
                  <AlertDescription>
                    Ces opportunités ne portent pas la même société. C'est celle
                    de la fiche conservée qui restera.
                  </AlertDescription>
                </Alert>
              )}

              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" aria-hidden />
                <AlertTitle>Opération à vérifier avant de valider</AlertTitle>
                <AlertDescription>
                  Aucune donnée n'est supprimée : la fiche absorbée est archivée
                  et peut être remise dans le board. Les rattachements, eux, ne
                  reviennent pas tout seuls.
                </AlertDescription>
              </Alert>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Annuler
          </Button>
          <Button
            onClick={fusionner}
            disabled={gagnanteId == null || isPending}
          >
            <Merge className="w-4 h-4" aria-hidden />
            {isPending ? "Fusion en cours…" : "Fusionner"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
