import {
  CreateBase,
  Form,
  useGetIdentity,
  useListContextWithProps,
  useNotify,
  useRecordContext,
  useUpdate,
  type Identifier,
  type RaRecord,
} from "ra-core";
import { useFormContext } from "react-hook-form";
import { SaveButton } from "@/components/admin/form";
import { cn } from "@/lib/utils";

import { NoteInputs } from "./NoteInputs";
import { getCurrentDate } from "./utils";
import { foreignKeyMapping, noteResourceMapping } from "./foreignKeyMapping";

export const NoteCreate = ({
  reference,
  showStatus,
  showType,
  className,
  onSuccess,
}: {
  reference: "contacts" | "deals";
  showStatus?: boolean;
  showType?: boolean;
  className?: string;
  /** Called after a note is created, for callers that own their own query. */
  onSuccess?: () => void;
}) => {
  const record = useRecordContext();
  const { identity } = useGetIdentity();

  if (!record || !identity) return null;

  return (
    <CreateBase resource={noteResourceMapping[reference]} redirect={false}>
      <Form>
        <div className={cn("space-y-3", className)}>
          <NoteInputs showStatus={showStatus} showType={showType} />
          <NoteCreateButton
            reference={reference}
            record={record}
            onSuccess={onSuccess}
          />
        </div>
      </Form>
    </CreateBase>
  );
};

const NoteCreateButton = ({
  reference,
  record,
  onSuccess,
}: {
  reference: "contacts" | "deals";
  record: RaRecord<Identifier>;
  onSuccess?: () => void;
}) => {
  const [update] = useUpdate();
  const notify = useNotify();
  const { identity } = useGetIdentity();
  const { reset } = useFormContext();
  // Not `useListContext()`: that one throws outside a <ListContextProvider>,
  // which is exactly what blanked the deal page (#109). The deal timeline owns
  // its queries and refreshes through `onSuccess` instead.
  const { refetch } = useListContextWithProps();

  if (!record || !identity) return null;

  const resetValues: {
    date: string;
    text: null;
    attachments: null;
    status?: string;
  } = {
    date: getCurrentDate(),
    text: null,
    attachments: null,
  };

  if (reference === "contacts") {
    resetValues.status = "warm";
  }

  const handleSuccess = (data: any) => {
    reset(resetValues, { keepValues: false });
    refetch?.();
    onSuccess?.();
    // Only contacts carry these two columns. Deals have neither, so the call
    // used to PATCH `{last_seen: undefined, status: undefined}` on every save.
    if (reference === "contacts") {
      update(reference, {
        id: record.id,
        data: { last_seen: new Date().toISOString(), status: data.status },
        previousData: record,
      });
    }
    notify("Note ajoutée");
  };

  return (
    <div className="flex justify-end">
      <SaveButton
        type="button"
        label="Ajouter cette note"
        transform={(data) => ({
          ...data,
          [foreignKeyMapping[reference]]: record.id,
          sales_id: identity.id,
          date: new Date(data.date || getCurrentDate()).toISOString(),
        })}
        mutationOptions={{
          onSuccess: handleSuccess,
        }}
      >
        Ajouter cette note
      </SaveButton>
    </div>
  );
};
