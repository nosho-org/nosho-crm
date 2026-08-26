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
   * Attaches the task to an opportunity (`tasks.deal_id`). The column has
   * existed since 20260823140000; this is the first UI that writes it
   * (#112, #114). When set the contact becomes optional —
   * `tasks_owner_check` accepts a task owned by a deal alone — and the picker
   * is narrowed to that opportunity's contacts.
   */
  deal_id?: Identifier;
  /** The opportunity's contacts: the only ones the picker offers. */
  dealContactIds?: Identifier[];
  /** The opportunity's name, for the sheet header. */
  dealName?: string;
  /** Called once the task exists, so the caller can refresh. */
  onCreated?: (task: Record<string, unknown>) => void;
}

export const TaskCreateSheet = ({
  open,
  onOpenChange,
  contact_id,
  deal_id,
  dealContactIds,
  dealName,
  onCreated,
}: TaskCreateSheetProps) => {
  const { identity } = useGetIdentity();

  const forDeal = deal_id != null;
  const contactIds = dealContactIds ?? [];
  // With exactly one contact there is no ambiguity. With several, preselecting
  // one designates somebody arbitrarily and nobody ever corrects it.
  const seededContactId =
    contact_id ??
    (forDeal && contactIds.length === 1 ? contactIds[0] : undefined);

  /**
   * On an opportunity the contact is a refinement, never a requirement — the
   * task already has a legitimate owner. So the picker only appears when there
   * is a real choice to make: several contacts on the deal. With none it would
   * offer the entire address book on a task that does not need one, and with
   * exactly one there is nothing to choose.
   */
  const selectContact =
    seededContactId == null && (!forDeal || contactIds.length > 1);
  const { data: contact } = useGetOne(
    "contacts",
    { id: seededContactId! },
    { enabled: !selectContact },
  );
  const [update] = useUpdate();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const queryClient = useQueryClient();

  if (!identity) return null;

  const handleSuccess = async (data: any) => {
    // Close and notify first, unconditionally. The contact lookup below used to
    // sit in front of them behind an early return, so a task with no contact —
    // which is exactly what an opportunity task is — left the sheet open with
    // no sign anything had happened.
    onOpenChange(false);
    notify("Tâche ajoutée");

    // Invalidated here rather than left to the caller: this sheet is mounted
    // from several places, and a forgotten refresh shows a stale list.
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    if (forDeal) {
      // An opportunity's next action is derived from its task backlog by
      // `deals_summary`, which feeds `getOne("deals")` — invalidating the list
      // alone would leave the page it was created from stale.
      queryClient.invalidateQueries({ queryKey: ["deals"] });
    }
    onCreated?.(data);

    // Refreshing the contact's `last_seen` is a courtesy; a task owned by an
    // opportunity has no contact to touch.
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
          {forDeal ? (
            `Nouvelle tâche${dealName ? ` — ${dealName}` : ""}`
          ) : selectContact ? (
            "Créer une tâche"
          ) : (
            <>
              {"Créer une tâche pour "}
              <RecordRepresentation record={contact} resource="contacts" />
            </>
          )}
        </span>
      }
      redirect={false}
      record={{
        // Lowercase: `defaultTaskTypes` has "none", and the "None" this used to
        // seed was not one of the SelectInput's choices — the field rendered
        // empty and the required rule blocked saving until it was touched.
        type: "none",
        contact_id: seededContactId,
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
      <TaskFormContent
        selectContact={selectContact}
        contactRequired={!forDeal}
        contactFilter={
          // Omitted when the opportunity has no contact: `id=in.()` is a 400,
          // and an unfiltered picker beats a broken one.
          forDeal && contactIds.length
            ? { "id@in": `(${contactIds.join(",")})` }
            : undefined
        }
      />
    </CreateSheet>
  );
};
