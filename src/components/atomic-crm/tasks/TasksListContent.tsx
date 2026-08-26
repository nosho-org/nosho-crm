import type { Identifier } from "ra-core";

import { taskFilters, isBeforeFriday } from "./taskFilters";
import { TasksListEmpty } from "../dashboard/TasksListEmpty";
import { TasksListFilter } from "../dashboard/TasksListFilter";

export const TasksListContent = ({
  salesId,
}: {
  /**
   * Responsable dont on affiche les tâches (NOS-1064). Absent, on retombe sur
   * l'utilisateur connecté — ce que fait la liste mobile. `null` veut dire
   * « tous les responsables ».
   */
  salesId?: Identifier | null;
}) => {
  return (
    <div className="flex flex-col gap-4">
      <TasksListEmpty />
      <TasksListFilter
        title="En retard"
        filter={taskFilters.overdue}
        salesId={salesId}
      />
      <TasksListFilter
        title="Aujourd'hui"
        filter={taskFilters.today}
        salesId={salesId}
      />
      <TasksListFilter
        title="Demain"
        filter={taskFilters.tomorrow}
        salesId={salesId}
      />
      {isBeforeFriday && (
        <TasksListFilter
          title="Cette semaine"
          filter={taskFilters.thisWeek}
          salesId={salesId}
        />
      )}
      <TasksListFilter
        title="Plus tard"
        filter={taskFilters.later}
        salesId={salesId}
      />
    </div>
  );
};
