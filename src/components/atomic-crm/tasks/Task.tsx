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

/** Au-delà, la file redeviendrait une liste : le reste tient dans un lien. */
const OPPORTUNITES_AFFICHEES = 10;

/**
 * Les opportunités derrière une tâche de contact, nommées une par une.
 *
 * Simon, le 24/09/2026, devant « Francis ROTH · 3 opportunités » : d'abord
 * « pourquoi Francis ROTH remonte comme une opportunité ? », puis, une fois
 * le décompte corrigé, « c'est mal fait, moi je veux une ligne par
 * opportunité ».
 *
 * Il a raison, et la tâche qu'il regardait le prouve toute seule : elle
 * s'intitule « point 30 min sur les mises en relation SIMSE et AMIM ». Le
 * texte nomme deux affaires ; la ligne d'en dessous répondait « 5
 * opportunités ». Un décompte dit qu'il y a quelque chose à aller voir —
 * ailleurs, plus tard, en cliquant. Passer l'appel demande de savoir
 * lesquelles, maintenant.
 *
 * ## Une seule affaire reste en ligne
 *
 * Elle était déjà nommée, sur la même ligne que l'échéance : lui donner une
 * ligne à elle n'apprendrait rien et allongerait la file partout. Mesure en
 * production : 68 des 79 tâches ouvertes rattachées à un contact n'ont qu'une
 * affaire, 4 en ont plusieurs. Le déploiement en ligne ne coûte donc que
 * quatre endroits, et c'est exactement là qu'il sert.
 *
 * ## Le décompte disparaît, mais la panne qu'il cachait mérite mémoire
 *
 * Il affichait `deals.length` sur une requête bornée à `perPage: 3` : quel que
 * soit le nombre réel, il annonçait trois au maximum. Francis ROTH en a cinq.
 * D'où `total`, l'en-tête `Content-Range`, pour le lien de débordement qui
 * subsiste au-delà de dix.
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
      pagination: { page: 1, perPage: OPPORTUNITES_AFFICHEES },
      sort: { field: "updated_at", order: "DESC" },
      filter: {
        "contact_ids@cs": `{${contactId}}`,
        "archived_at@is": null,
      },
    },
    { enabled: contactId != null },
  );

  if (isPending || !deals || deals.length === 0) return null;

  const lien = (deal: Deal) => (
    <Link
      to={`/deals/${deal.id}/show`}
      onClick={stopPropagation}
      className="text-foreground hover:underline"
    >
      {deal.name}
    </Link>
  );

  if (deals.length === 1) {
    return (
      <>
        {" · "}
        {lien(deals[0])}
      </>
    );
  }

  const reste = (total ?? deals.length) - deals.length;

  return (
    /*
     * Un `ul` dans le `div` de l'échéance : la liste appartient à la ligne du
     * dessus, et l'aligner sous le pictogramme du contact dit de qui elle
     * relève sans avoir à l'écrire.
     */
    <ul className="mt-0.5 ml-4 flex flex-col">
      {deals.map((deal) => (
        <li key={deal.id} className="leading-5">
          <span aria-hidden className="mr-1 opacity-60">
            ↳
          </span>
          {lien(deal)}
        </li>
      ))}
      {reste > 0 && (
        <li className="leading-5">
          <span aria-hidden className="mr-1 opacity-60">
            ↳
          </span>
          <Link
            to={`/contacts/${contactId}/show`}
            onClick={stopPropagation}
            className="text-foreground hover:underline"
          >
            et {reste} autre{reste > 1 ? "s" : ""}
          </Link>
        </li>
      )}
    </ul>
  );
};
