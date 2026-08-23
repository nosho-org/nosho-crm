import { useMutation } from "@tanstack/react-query";
import { Archive, ArchiveRestore } from "lucide-react";
import {
  useDataProvider,
  useNotify,
  useRedirect,
  useRefresh,
  useUpdate,
} from "ra-core";
import { Button } from "@/components/ui/button";

import type { Deal } from "../../types";

/**
 * Archive / unarchive, lifted out of the old `DealShow` modal unchanged.
 *
 * "L'archivage ne doit supprimer aucune donnée (car l'opportunité peut revenir
 * plus tard)": it only stamps `archived_at`, and `unarchiveDeal` reinserts the
 * deal at the top of its column.
 */

export const DealArchiveButton = ({ record }: { record: Deal }) => {
  const [update] = useUpdate();
  const redirect = useRedirect();
  const notify = useNotify();
  const refresh = useRefresh();

  const handleClick = () => {
    if (
      !window.confirm(
        "Archiver cette opportunité ? Elle quitte les opportunités actives ; aucune donnée n'est supprimée.",
      )
    ) {
      return;
    }
    update(
      "deals",
      {
        id: record.id,
        data: { archived_at: new Date().toISOString() },
        previousData: record,
      },
      {
        onSuccess: () => {
          redirect("list", "deals");
          notify("Opportunité archivée", { type: "info", undoable: false });
          refresh();
        },
        onError: () =>
          notify("Erreur : opportunité non archivée", { type: "error" }),
      },
    );
  };

  return (
    <Button onClick={handleClick} size="sm" variant="outline">
      <Archive className="w-4 h-4" aria-hidden />
      Archiver
    </Button>
  );
};

export const DealUnarchiveButton = ({ record }: { record: Deal }) => {
  const dataProvider = useDataProvider();
  const redirect = useRedirect();
  const notify = useNotify();
  const refresh = useRefresh();

  const { mutate } = useMutation({
    mutationFn: () => dataProvider.unarchiveDeal(record),
    onSuccess: () => {
      redirect("list", "deals");
      notify("Opportunité désarchivée", { type: "info", undoable: false });
      refresh();
    },
    onError: () =>
      notify("Erreur : opportunité non désarchivée", { type: "error" }),
  });

  return (
    <Button onClick={() => mutate()} size="sm" variant="outline">
      <ArchiveRestore className="w-4 h-4" aria-hidden />
      Remettre dans le board
    </Button>
  );
};
