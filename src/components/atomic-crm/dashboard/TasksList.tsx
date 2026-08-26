import { CheckSquare } from "lucide-react";
import { Card } from "@/components/ui/card";

import { AddTask } from "../tasks/AddTask";
import { TasksListContent } from "../tasks/TasksListContent";
import { useDashboard } from "./DashboardContext";

export const TasksList = () => {
  // Les tâches suivent le responsable choisi en haut de l'écran (NOS-1064).
  // Elles restaient sur l'utilisateur connecté quoi qu'on sélectionne, si bien
  // que le haut et le bas du tableau de bord parlaient de deux personnes
  // différentes sans que rien ne le signale.
  const { selection } = useDashboard();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center">
        <div className="mr-3 flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--nosho-green)]/10">
          <CheckSquare className="text-[var(--nosho-green-dark)] w-4 h-4" />
        </div>
        <h2 className="text-base font-semibold text-muted-foreground flex-1">
          Tâches à venir
        </h2>
        <AddTask display="icon" selectContact />
      </div>
      <Card className="p-4 mb-2 shadow-sm border-border/50">
        <TasksListContent salesId={selection.salesId} />
      </Card>
    </div>
  );
};
