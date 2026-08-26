import {
  type Identifier,
  ListContextProvider,
  ResourceContextProvider,
  useGetIdentity,
  useGetList,
  useList,
} from "ra-core";

import { TasksIterator } from "../tasks/TasksIterator";
import { useIsMobile } from "@/hooks/use-mobile";

export const TasksListFilter = ({
  title,
  filter,
  filterByContact,
  salesId,
}: {
  title: string;
  filter: any;
  filterByContact?: Identifier;
  /**
   * Responsable dont on veut les tâches (NOS-1064).
   *
   * En prop et non lue depuis le contexte du tableau de bord : ce composant
   * sert aussi la fiche contact, qui n'a pas ce contexte. Absente, on retombe
   * sur l'utilisateur connecté — le comportement d'avant.
   *
   * `null` est une valeur, pas une absence : il veut dire « tous les
   * responsables », et c'est ce que le tableau de bord envoie quand on choisit
   * « Tous ». D'où le `undefined` comme seul déclencheur du repli.
   */
  salesId?: Identifier | null;
}) => {
  const { identity } = useGetIdentity();
  const isMobile = useIsMobile();

  const owner = salesId === undefined ? identity?.id : salesId;

  const {
    data: tasks,
    total,
    isPending,
  } = useGetList(
    "tasks",
    {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "due_date", order: "ASC" },
      filter: {
        ...filter,
        ...(filterByContact != null
          ? { contact_id: filterByContact }
          : // `owner` nul = « Tous » : on n'écrit alors aucune clé, sinon
            // `sales_id: null` demanderait les tâches sans responsable.
            owner != null
            ? { sales_id: owner }
            : {}),
      },
    },
    // On n'attend l'identité que si c'est elle qu'on va utiliser.
    {
      enabled:
        filterByContact != null || salesId !== undefined ? true : !!identity,
    },
  );

  const listContext = useList({
    data: tasks,
    isPending,
    resource: "tasks",
    perPage: isMobile ? 10 : 5,
  });

  if (isPending || !tasks || !total) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
        {title}
      </p>
      <ResourceContextProvider value="tasks">
        <ListContextProvider value={listContext}>
          <TasksIterator showContact={filterByContact == null} />
        </ListContextProvider>
      </ResourceContextProvider>
      {total > listContext.perPage && (
        <div className="flex justify-center">
          <a
            href="#"
            onClick={(e) => {
              listContext.setPerPage(listContext.perPage + 10);
              e.preventDefault();
            }}
            className="text-sm underline hover:no-underline"
          >
            Charger plus
          </a>
        </div>
      )}
    </div>
  );
};
