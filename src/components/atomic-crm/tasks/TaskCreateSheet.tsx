import { useQueryClient } from "@tanstack/react-query";
import {
  type Identifier,
  RecordRepresentation,
  useDataProvider,
  useGetIdentity,
  useGetOne,
  useNotify,
  useUpdate,
} from "ra-core";
import { CreateSheet } from "../misc/CreateSheet";
import { foreignKeyMapping } from "../notes/foreignKeyMapping";
import { TaskFormContent } from "./TaskFormContent";

export interface TaskCreateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact_id?: Identifier;
  /**
   * Creates the task on an opportunity (`tasks.deal_id`) rather than on a
   * contact. The column has existed since migration 20260823140000; this is the
   * first UI that writes it (#112).
   */
  deal_id?: Identifier;
}

export const TaskCreateSheet = ({
  open,
  onOpenChange,
  contact_id,
  deal_id,
}: TaskCreateSheetProps) => {
  const { identity } = useGetIdentity();

  // Asking for a contact on top of an opportunity would be worse than useless:
  // `TaskFormContent`'s autocomplete is `required()`, so it would block the save
  // of a task that already has a legitimate owner.
  const selectContact = contact_id == null && deal_id == null;
  const { data: contact } = useGetOne(
    "contacts",
    { id: contact_id! },
    { enabled: contact_id != null },
  );
  const { data: deal } = useGetOne(
    "deals",
    { id: deal_id! },
    { enabled: deal_id != null },
  );
  const [update] = useUpdate();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const queryClient = useQueryClient();

  if (!identity) return null;

  const handleSuccess = async (data: any) => {
    // Close and notify first, unconditionally. The contact lookup below used to
    // sit in front of them behind an early return, so a task with no contact —
    // which is exactly what an opportunity task is — left the sheet open with no
    // sign anything had happened.
    onOpenChange(false);
    notify("Tâche ajoutée");

    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    if (deal_id != null) {
      // The opportunity's next action is derived from its task backlog by
      // `deals_summary`, which feeds `getOne("deals")` — invalidating the list
      // alone would leave the page it was created from stale.
      queryClient.invalidateQueries({ queryKey: ["deals"] });
    }

    const referenceRecordId = data[foreignKeyMapping["contacts"]];
    if (!referenceRecordId) return;
    const { data: contact } = await dataProvider.getOne("contacts", {
      id: referenceRecordId,
    });
    if (!contact) return;
    update("contacts", {
      id: referenceRecordId as unknown as Identifier,
      data: { last_seen: new Date().toISOString() },
      previousData: contact,
    });
  };

  return (
    <CreateSheet
      resource="tasks"
      title={
        // A span, not an h1: `SheetTitle` already renders the heading, and
        // nesting one inside it is invalid HTML the console has been flagging.
        <span className="text-xl font-semibold truncate pr-10">
          {selectContact ? (
            "Créer une tâche"
          ) : (
            <>
              {"Créer une tâche pour "}
              {deal_id != null ? (
                <RecordRepresentation record={deal} resource="deals" />
              ) : (
                <RecordRepresentation record={contact} resource="contacts" />
              )}
            </>
          )}
        </span>
      }
      redirect={false}
      record={{
        type: "None",
        contact_id,
        deal_id,
        due_date: new Date().toISOString(),
        sales_id: identity.id,
      }}
      mutationOptions={{
        onSuccess: handleSuccess,
      }}
      open={open}
      onOpenChange={onOpenChange}
    >
      <TaskFormContent selectContact={selectContact} />
    </CreateSheet>
  );
};
