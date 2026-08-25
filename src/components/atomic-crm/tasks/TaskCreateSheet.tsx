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
   * Attaches the task to an opportunity. When set, the contact becomes optional
   * — `tasks_owner_check` accepts a task owned by a deal alone — and the picker
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

  const selectContact = seededContactId == null;
  const { data: contact } = useGetOne(
    "contacts",
    { id: seededContactId! },
    { enabled: !selectContact },
  );
  const [update] = useUpdate();
  const dataProvider = useDataProvider();
  const notify = useNotify();

  if (!identity) return null;

  const handleSuccess = async (data: any) => {
    // Close first. Refreshing the contact's `last_seen` below is a courtesy;
    // on a task owned by an opportunity there is no contact to touch, and the
    // early return used to leave the sheet open forever.
    onOpenChange(false);
    notify("Tâche ajoutée");
    onCreated?.(data);

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
        <h1 className="text-xl font-semibold truncate pr-10">
          {forDeal
            ? `Nouvelle tâche${dealName ? ` — ${dealName}` : ""}`
            : selectContact
              ? "Créer une tâche"
              : "Créer une tâche pour "}
          {!forDeal && !selectContact && (
            <RecordRepresentation record={contact} resource="contacts" />
          )}
        </h1>
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
