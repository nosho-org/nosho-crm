import { useQueryClient } from "@tanstack/react-query";
import { MoreVertical, User } from "lucide-react";
import {
  type Identifier,
  useDeleteWithUndoController,
  useGetList,
  useNotify,
  useUpdate,
} from "ra-core";
import { useEffect, useState, type MouseEvent } from "react";
import { Link } from "react-router";
import { ReferenceField } from "@/components/admin/reference-field";
import { DateField } from "@/components/admin/date-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Contact, Deal, Task as TData } from "../types";
import { TaskEdit } from "./TaskEdit";
import { TaskEditSheet } from "./TaskEditSheet";
import { useIsMobile } from "@/hooks/use-mobile";

export const Task = ({
  task,
  showContact,
  showTime = true,
}: {
  task: TData;
  showContact?: boolean;
  showTime?: boolean;
}) => {
  const isMobile = useIsMobile();
  const { taskTypes } = useConfigurationContext();
  const notify = useNotify();

  /*
   * « None » s'affichait comme un type de tâche (NOS-1172).
   *
   * Le garde-fou existait — `task.type !== "none"` — mais il était sensible à
   * la casse, et la production porte six tâches typées `"None"` avec une
   * majuscule, laissées par un import. Le mot s'imprimait donc en gras devant
   * l'intitulé, comme une catégorie.
   *
   * Corrigé ici plutôt qu'en base : une migration nettoierait les six lignes
   * d'aujourd'hui et pas la prochaine importation. Les deux valent la peine,
   * mais c'est l'affichage qui doit être robuste.
   */
  const normalizedType = (task.type ?? "").trim().toLowerCase();
  const hasType = normalizedType !== "" && normalizedType !== "none";
  const queryClient = useQueryClient();

  const [openEdit, setOpenEdit] = useState(false);

  const handleCloseEdit = () => {
    setOpenEdit(false);
  };

  const [update, { isPending: isUpdatePending, isSuccess, variables }] =
    useUpdate();
  const { handleDelete } = useDeleteWithUndoController({
    record: task,
    redirect: false,
    mutationOptions: {
      onSuccess() {
        notify("Tâche supprimée", { undoable: true });
      },
    },
  });

  const handleEdit = () => {
    setOpenEdit(true);
  };

  const handleCheck = () => () => {
    update("tasks", {
      id: task.id,
      data: {
        done_date: task.done_date ? null : new Date().toISOString(),
      },
      previousData: task,
    });
  };

  useEffect(() => {
    // We do not want to invalidate the query when a tack is checked or unchecked
    if (
      isUpdatePending ||
      !isSuccess ||
      variables?.data?.done_date != undefined
    ) {
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["tasks", "getList"] });
  }, [queryClient, isUpdatePending, isSuccess, variables]);

  const labelId = `checkbox-list-label-${task.id}`;

  return (
    <>
      <div className="flex items-start justify-between">
        <div
          className="flex items-start gap-2 flex-1"
          onClick={isMobile ? handleCheck() : undefined}
        >
          <Checkbox
            id={labelId}
            checked={!!task.done_date}
            onCheckedChange={handleCheck()}
            disabled={isUpdatePending}
            className="mt-1"
          />
          <div className={`flex-grow ${task.done_date ? "line-through" : ""}`}>
            <div className="text-sm">
              {hasType && (
                <>
                  <span className="font-semibold text-sm">
                    {taskTypes.find((t) => t.value === task.type)?.label ??
                      task.type}
                  </span>
                  &nbsp;
                </>
              )}
              {task.text}
            </div>
            <div className="text-sm text-muted-foreground">
              due&nbsp;
              <DateField
                source="due_date"
                record={task}
                showDate
                showTime={showTime}
              />
              {/* `contact_id` is nullable since 20260823140000: a task created
                  from an opportunity has a `deal_id` and no contact. Rendering
                  the reference anyway asked the provider for id `undefined`,
                  which surfaced as "No item with identifier undefined". */}
              {showContact && task.contact_id != null && (
                <>
                  {" · "}
                  <ReferenceField<TData, Contact>
                    source="contact_id"
                    reference="contacts"
                    record={task}
                    link="show"
                    className="inline text-sm [&_a]:text-foreground [&_a]:hover:underline"
                    render={({ referenceRecord }) => {
                      if (!referenceRecord) return null;
                      return (
                        <>
                          {/* Le segment suivant compte des opportunités ; sans
                              ce pictogramme, les deux se lisent d'un bloc et le
                              contact passe pour l'une d'elles. */}
                          <User
                            className="inline w-3 h-3 mr-0.5 -mt-0.5"
                            aria-hidden
                          />
                          {referenceRecord?.first_name}{" "}
                          {referenceRecord?.last_name}
                        </>
                      );
                    }}
                  />
                  <TaskDealLink contactId={task.contact_id} />
                </>
              )}
            </div>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 pr-0! size-8 cursor-pointer"
              aria-label="task actions"
            >
              <MoreVertical className="size-5 md:size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="cursor-pointer h-12 md:h-8 px-4 md:px-2 text-base md:text-sm"
              onClick={() => {
                update("tasks", {
                  id: task.id,
                  data: {
                    due_date: new Date(Date.now() + 24 * 60 * 60 * 1000)
                      .toISOString()
                      .slice(0, 10),
                  },
                  previousData: task,
                });
              }}
            >
              Postpone to tomorrow
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer h-12 md:h-8 px-4 md:px-2 text-base md:text-sm"
              onClick={() => {
                update("tasks", {
                  id: task.id,
                  data: {
                    due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                      .toISOString()
                      .slice(0, 10),
                  },
                  previousData: task,
                });
              }}
            >
              Postpone to next week
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer h-12 md:h-8 px-4 md:px-2 text-base md:text-sm"
              onClick={handleEdit}
            >
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer h-12 md:h-8 px-4 md:px-2 text-base md:text-sm"
              onClick={handleDelete}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isMobile ? (
        <TaskEditSheet
          taskId={task.id}
          open={openEdit}
          onOpenChange={setOpenEdit}
        />
      ) : (
        <TaskEdit taskId={task.id} open={openEdit} close={handleCloseEdit} />
      )}
    </>
  );
};

const stopPropagation = (e: MouseEvent) => e.stopPropagation();

/**
 * L'opportunité derrière une tâche de contact — ou leur nombre.
 *
 * Simon, le 24/09/2026, devant « Francis ROTH · 3 opportunités » : « pourquoi
 * Francis ROTH remonte comme une opportunité ? » Il ne remontait pas comme
 * telle — c'est le contact de la tâche, et le segment suivant compte ses
 * affaires. Deux séparateurs identiques, et la ligne se lit d'un bloc.
 *
 * Deux corrections, donc, dont une vraie panne :
 *
 * 1. **Le nombre était faux.** `perPage: 3` bornait la requête, et
 *    `deals.length` comptait ce qui était revenu. Francis ROTH a cinq
 *    opportunités ouvertes ; la ligne en annonçait trois. `total` vient de
 *    l'en-tête `Content-Range` de la même requête : le vrai nombre, sans
 *    seconde requête ni page entière rapatriée.
 * 2. **Le contact porte son icône.** Un pictogramme de personne coûte un
 *    caractère et dit ce que trois mots diraient plus mal.
 */
const TaskDealLink = ({
  contactId,
}: {
  // Null on a task attached to an opportunity rather than to a contact: there
  // is no contact to walk back from, so there is no deal to guess.
  contactId?: Identifier | null;
}) => {
  const {
    data: deals,
    total,
    isPending,
  } = useGetList<Deal>(
    "deals",
    {
      // Une seule ligne suffit tant qu'il n'y en a qu'une : au-delà, on
      // n'affiche qu'un décompte, et `total` le donne sans les rapatrier.
      pagination: { page: 1, perPage: 1 },
      sort: { field: "updated_at", order: "DESC" },
      filter: {
        "contact_ids@cs": `{${contactId}}`,
        "archived_at@is": null,
      },
    },
    { enabled: contactId != null },
  );

  if (isPending || !deals || deals.length === 0) return null;

  if (total === 1) {
    const deal = deals[0];
    return (
      <>
        {" · "}
        <Link
          to={`/deals/${deal.id}/show`}
          onClick={stopPropagation}
          className="text-foreground hover:underline"
        >
          {deal.name}
        </Link>
      </>
    );
  }

  return (
    <>
      {" · "}
      <Link
        to={`/contacts/${contactId}/show`}
        onClick={stopPropagation}
        className="text-foreground hover:underline"
      >
        {total} opportunités
      </Link>
    </>
  );
};
