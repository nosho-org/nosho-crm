import { useGetIdentity, useGetList } from "ra-core";
import { Card } from "@/components/ui/card";

import { formatCurrency } from "../misc/formatCurrency";
import { formatDateLong } from "../misc/formatDate";
import type { Deal, Sale, Target, Task } from "../types";
import { useDashboard } from "./DashboardContext";
import { bucketFor } from "./actionQueue";
import { computeTargetProgress, findActiveTarget } from "./targets";

/**
 * ---------------------------------------------------------------------------
 * « Ma journée » (NOS-1167)
 * ---------------------------------------------------------------------------
 * L'audit du 29 août 2026 : « Un commercial qui ouvre le tableau de bord voit
 * six chiffres de même poids […] Il ne voit nulle part ce qu'il doit faire
 * dans les dix prochaines minutes. »
 *
 * Cette bande répond à trois questions, dans cet ordre : quel jour on est, ce
 * qui reste à faire aujourd'hui, et où l'on en est de l'objectif.
 *
 * L'anneau est ce que l'audit réclamait sous le nom de « taux de couverture » :
 * il donne enfin un référentiel aux 912 k€. Il lit l'objectif du responsable
 * sélectionné, et retombe sur celui de l'équipe quand la personne n'en a pas —
 * un commercial sans objectif personnel n'est pas hors sujet, il partage celui
 * de tout le monde.
 */

const Ring = ({ ratio }: { ratio: number }) => {
  const CIRCUMFERENCE = 132;
  const filled = Math.min(1, Math.max(0, ratio));
  return (
    <svg width="48" height="48" viewBox="0 0 52 52" aria-hidden>
      <circle
        cx="26"
        cy="26"
        r="21"
        fill="none"
        stroke="var(--muted)"
        strokeWidth="6"
      />
      <circle
        cx="26"
        cy="26"
        r="21"
        fill="none"
        stroke={
          ratio >= 1 ? "var(--deal-status-won)" : "var(--deal-series-potential)"
        }
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - filled)}
        transform="rotate(-90 26 26)"
      />
    </svg>
  );
};

export const CockpitDayBar = () => {
  const { selection, today } = useDashboard();
  const { identity } = useGetIdentity();

  const owner = selection.salesId ?? identity?.id;

  const { data: tasks } = useGetList<Task>(
    "tasks",
    {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "due_date", order: "ASC" },
      filter: {
        "done_date@is": null,
        ...(owner != null ? { sales_id: owner } : {}),
      },
    },
    { enabled: selection.salesId != null || !!identity },
  );

  const { data: targets } = useGetList<Target>("targets", {
    pagination: { page: 1, perPage: 50 },
    sort: { field: "period_end", order: "ASC" },
  });

  const { data: sales } = useGetList<Sale>("sales", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "last_name", order: "ASC" },
  });

  /*
   * Les affaires signées, pour l'avancement de l'objectif.
   *
   * Requête à part et non `deals` du contexte : celui-ci est filtré sur la
   * période choisie en haut de l'écran, alors que l'objectif a sa propre
   * période. Les faire coïncider ferait varier l'avancement d'un objectif
   * annuel selon le filtre du tableau de bord — un chiffre qui bouge sans
   * raison visible.
   */
  const { data: wonDeals } = useGetList<Deal>("deals", {
    pagination: { page: 1, perPage: 500 },
    sort: { field: "won_at", order: "DESC" },
    filter: { "stage@eq": "closed-won" },
  });

  // Ce qui reste à traiter aujourd'hui : le retard compte dedans, puisqu'il
  // faudra bien le rattraper aujourd'hui ou jamais.
  const due = (tasks ?? []).filter((task) => {
    const { bucket } = bucketFor(task.due_date, today);
    return bucket === "overdue" || bucket === "today";
  }).length;

  const personal = findActiveTarget(targets ?? [], owner ?? null, today);
  const team = findActiveTarget(targets ?? [], null, today);
  const target = personal ?? team;

  const progress = target
    ? computeTargetProgress(target, wonDeals ?? [], today)
    : null;

  const ownerName = (sales ?? []).find(
    (sale) => String(sale.id) === String(owner),
  );

  return (
    <Card className="p-4 flex items-center gap-6 flex-wrap">
      <div className="min-w-0">
        <div className="text-base font-semibold">{formatDateLong(today)}</div>
        <p className="text-sm text-muted-foreground">
          {due > 0 ? (
            <>
              <b className="text-foreground font-medium">{due}</b> action
              {due > 1 ? "s" : ""} à traiter aujourd'hui
            </>
          ) : (
            "Rien à traiter aujourd'hui."
          )}
          {ownerName && ` · ${ownerName.first_name} ${ownerName.last_name}`}
        </p>
      </div>

      {progress && target && (
        <div className="flex items-center gap-3 ml-auto">
          <Ring ratio={progress.ratio} />
          <div>
            <div className="text-sm font-semibold tabular-nums">
              {Math.round(progress.ratio * 100)} %
            </div>
            <div className="text-xs text-muted-foreground">
              {/* Nommer l'objectif suivi : sans cela, un commercial sans
                  objectif personnel croirait lire le sien. */}
              {target.sales_id == null ? "objectif d'équipe" : "objectif perso"}
              {progress.isOver
                ? " · période terminée"
                : progress.remaining > 0
                  ? ` · ${formatCurrency(progress.remaining)} en ${progress.daysLeft} j`
                  : " · atteint"}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};
