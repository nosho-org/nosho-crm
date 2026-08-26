import { useQueryClient } from "@tanstack/react-query";
import {
  EditBase,
  Form,
  useNotify,
  useRecordContext,
  useRedirect,
} from "ra-core";
import { Link, matchPath, useLocation } from "react-router";
import { ReferenceField } from "@/components/admin/reference-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

import { FormToolbar } from "../layout/FormToolbar";
import { CompanyAvatar } from "../companies/CompanyAvatar";
import type { Deal } from "../types";
import { DealInputs } from "./DealInputs";

export const DealEdit = ({ open, id }: { open: boolean; id?: string }) => {
  const redirect = useRedirect();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const location = useLocation();
  const viewMatch = matchPath("/views/:viewId/*", location.pathname);
  const basePath = viewMatch ? `/views/${viewMatch.params.viewId}` : "/deals";

  const handleClose = () => {
    redirect(basePath, undefined, undefined, undefined, {
      _scrollToTop: false,
    });
  };

  return (
    <Dialog open={open} onOpenChange={() => handleClose()}>
      <DialogContent className="lg:max-w-4xl p-4 overflow-y-auto max-h-9/10 top-1/20 translate-y-0">
        {id ? (
          <EditBase
            id={id}
            resource="deals"
            mutationMode="pessimistic"
            mutationOptions={{
              onSuccess: () => {
                notify("Opportunité mise à jour");
                queryClient.invalidateQueries({
                  queryKey: ["deals"],
                });
                // Changer le responsable réaffecte ses tâches ouvertes en base
                // (trigger `deal_tasks_follow_owner`, issue #125). C'est une
                // écriture sur `tasks` que le cache ne voit pas passer : sans
                // ceci, « Mes tâches » et l'onglet Tâches de la fiche restent
                // sur l'ancien assigné jusqu'au prochain refetch.
                //
                // Invalidé à chaque save plutôt que seulement quand le
                // responsable a bougé : `onSuccess` n'a pas le record d'avant,
                // donc la condition n'est pas calculable ici, et une
                // invalidation de trop ne coûte qu'un refetch.
                queryClient.invalidateQueries({
                  queryKey: ["tasks"],
                });
                redirect(
                  `${basePath}/${id}/show`,
                  undefined,
                  undefined,
                  undefined,
                  {
                    _scrollToTop: false,
                  },
                );
              },
            }}
          >
            <EditHeader />
            <Form>
              <DealInputs />
              <FormToolbar />
            </Form>
          </EditBase>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

function EditHeader() {
  const deal = useRecordContext<Deal>();
  if (!deal) {
    return null;
  }

  return (
    <DialogTitle className="pb-0">
      <div className="flex justify-between items-start mb-8">
        <div className="flex items-center gap-4">
          <ReferenceField source="company_id" reference="companies" link="show">
            <CompanyAvatar />
          </ReferenceField>
          <h2 className="text-2xl font-semibold">Edit {deal.name} deal</h2>
        </div>
        {/* No delete button. Archiving (`archived_at`) covers the same need,
            is reversible, and is offered on the deal page. A hard delete
            cascades through `deal_notes`, `call_logs`, `tasks` and
            `deal_change_log` — it destroys the commercial history of the
            opportunity along with the opportunity, with no undo. */}
        <div className="flex gap-2 pr-12">
          <Button asChild variant="outline" className="h-9">
            <Link to={`/deals/${deal.id}/show`}>Back to deal</Link>
          </Button>
        </div>
      </div>
    </DialogTitle>
  );
}
