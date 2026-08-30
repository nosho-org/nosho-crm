import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  useCreate,
  useDelete,
  useGetList,
  useNotify,
  useUpdate,
} from "ra-core";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { AnimatedRing } from "@/components/ui/motion";
import { formatCurrency } from "../misc/formatCurrency";
import type { Deal, RevenueActual, Sale, Target } from "../types";
import { type MonthlyRevenue, groupByMonth } from "./revenueActuals";
import {
  TARGET_METRIC_LABELS,
  type TargetMetric,
  computeTargetProgress,
  formatTargetPeriod,
} from "./targets";

/**
 * ---------------------------------------------------------------------------
 * Objectifs (NOS-1173)
 * ---------------------------------------------------------------------------
 * L'audit du 29 août 2026 : « 912 k€ de pipeline, mais contre quel objectif ?
 * Un chiffre sans référentiel n'est pas un instrument de pilotage, c'est une
 * décoration. »
 *
 * Deux natures d'objectif dans la même carte, parce qu'ils se lisent ensemble :
 * celui de l'équipe — « 25 k€ de MRR d'ici la fin de l'année » — et celui de
 * chacun. Le premier est en tête et en grand ; c'est le chiffre qui engage
 * l'entreprise, les autres sont sa décomposition.
 *
 * ## La saisie vit ici, et pas dans les paramètres
 *
 * Demandé ainsi, et c'est le bon endroit : un objectif se révise en regardant
 * où l'on en est, pas dans un écran d'administration qu'on ouvre deux fois par
 * an. Le prix à payer est une carte qui n'est pas en lecture seule — d'où la
 * confirmation avant suppression.
 */

/**
 * Une ligne par titulaire, ses metriques cote a cote (NOS-1183).
 *
 * Avant : une ligne par objectif. Simon ayant un MRR et un ARR, l'equipe
 * occupait deux lignes qui disaient la meme chose dans deux unites, chacune
 * repetant la periode. La carte faisait quatre lignes pour deux titulaires.
 *
 * La periode est remontee en chapeau de la carte -- elle est commune, et
 * repetee quatre fois elle ne renseignait plus rien.
 */
const TargetRow = ({
  targets,
  deals,
  actuals,
  owner,
  onEdit,
  emphasis = false,
}: {
  /** Les objectifs d'un meme titulaire, une metrique chacun. */
  targets: Target[];
  deals: Deal[];
  /** Encaisse reelle. Seul l'objectif d'equipe s'en sert. */
  actuals: MonthlyRevenue[];
  owner?: string;
  onEdit: (target: Target) => void;
  emphasis?: boolean;
}) => {
  const isTeam = targets[0]?.sales_id == null;

  /*
   * L'objectif d'EQUIPE se mesure sur l'encaisse reelle, le personnel sur les
   * affaires signees du CRM.
   *
   * Un virement bancaire ne porte pas de commercial : un objectif personnel
   * ne peut pas s'y mesurer.
   */
  const measured = targets
    .map((target) => ({
      target,
      metric: (target.metric ?? "mrr") as TargetMetric,
      progress: computeTargetProgress(
        target,
        deals,
        undefined,
        isTeam ? actuals : undefined,
      ),
    }))
    // Le MRR d'abord : c'est la metrique de pilotage, l'ARR en est la
    // projection.
    .sort((a, b) => (a.metric === "mrr" ? -1 : b.metric === "mrr" ? 1 : 0));

  if (measured.length === 0) return null;

  // L'anneau suit le MRR, ou la premiere metrique disponible : un seul
  // anneau pour deux chiffres doit suivre celui qu'on pilote.
  const primary = measured[0];

  return (
    <div
      className={`flex items-center gap-3 ${emphasis ? "" : "border-t pt-3"}`}
    >
      <AnimatedRing ratio={primary.progress.ratio} />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span
            className={
              emphasis ? "text-base font-semibold" : "text-sm font-medium"
            }
          >
            {owner ?? "Équipe"}
          </span>
          {!isTeam && (
            <span className="text-xs text-muted-foreground">
              signé dans le CRM
            </span>
          )}
        </div>

        {/* Les metriques sur une seule ligne, qui se replie sur mobile. */}
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-0.5">
          {measured.map(({ target, metric, progress }) => (
            <span
              key={target.id}
              className="inline-flex items-baseline gap-1.5 group"
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {TARGET_METRIC_LABELS[metric]}
              </span>
              <span
                className={`${emphasis ? "text-lg" : "text-sm"} font-medium tabular-nums`}
              >
                {formatCurrency(progress.achieved)}
                <span className="text-muted-foreground font-normal">
                  {" "}
                  / {formatCurrency(Number(target.amount))} ·{" "}
                  {Math.round(progress.ratio * 100)} %
                </span>
              </span>
              <button
                type="button"
                onClick={() => onEdit(target)}
                aria-label={`Modifier l'objectif ${TARGET_METRIC_LABELS[metric]} ${owner ?? "de l'équipe"}`}
                title="Modifier"
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <Pencil className="w-3 h-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>

        {/*
          Un seul reste-a-faire, celui du MRR : les deux metriques mesurent le
          meme argent, et afficher deux manques ferait croire a deux dettes.
        */}
        <p className="text-xs text-muted-foreground">
          {primary.progress.isOver ? (
            primary.progress.remaining > 0 ? (
              <>
                Période terminée — {formatCurrency(primary.progress.remaining)}{" "}
                manquants en {TARGET_METRIC_LABELS[primary.metric]}.
              </>
            ) : (
              <>Période terminée — objectif atteint.</>
            )
          ) : primary.progress.remaining > 0 ? (
            <>
              Il manque{" "}
              <b className="text-[var(--deal-status-serious)] font-medium">
                {formatCurrency(primary.progress.remaining)}
              </b>{" "}
              de {TARGET_METRIC_LABELS[primary.metric]} et il reste{" "}
              {primary.progress.daysLeft} jour
              {primary.progress.daysLeft > 1 ? "s" : ""}.
            </>
          ) : (
            <span className="text-[var(--deal-status-won)]">
              Objectif atteint, {primary.progress.daysLeft} jour
              {primary.progress.daysLeft > 1 ? "s" : ""} avant la fin.
            </span>
          )}
        </p>
      </div>
    </div>
  );
};

/** Le 31 décembre de l'année en cours — l'échéance que Simon a nommée. */
const endOfYear = () => `${new Date().getFullYear()}-12-31`;
const startOfYear = () => `${new Date().getFullYear()}-01-01`;

const TargetDialog = ({
  target,
  sales,
  open,
  onClose,
}: {
  /** Absent = création. */
  target?: Target;
  sales: Sale[];
  open: boolean;
  onClose: () => void;
}) => {
  const [create, { isPending: isCreating }] = useCreate();
  const [update, { isPending: isUpdating }] = useUpdate();
  const [remove] = useDelete();
  const notify = useNotify();

  // « equipe » plutôt qu'une chaîne vide : un `SelectItem` de valeur vide est
  // interdit par Radix, et le sentinelle rend l'intention lisible.
  const [salesId, setSalesId] = useState(
    target?.sales_id != null ? String(target.sales_id) : "equipe",
  );
  const [metric, setMetric] = useState(target?.metric ?? "mrr");
  const [amount, setAmount] = useState(
    target?.amount != null ? String(target.amount) : "",
  );
  const [start, setStart] = useState(target?.period_start ?? startOfYear());
  const [end, setEnd] = useState(target?.period_end ?? endOfYear());
  const [confirmDelete, setConfirmDelete] = useState(false);

  const parsedAmount = Number(amount.replace(",", ".").replace(/\s/g, ""));
  const isValid =
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0 &&
    !!start &&
    !!end &&
    end >= start;

  const handleSubmit = () => {
    const data = {
      sales_id: salesId === "equipe" ? null : Number(salesId),
      metric,
      amount: parsedAmount,
      period_start: start,
      period_end: end,
    };

    const onSuccess = () => {
      notify("Objectif enregistré", { type: "success" });
      onClose();
    };
    const onError = (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      notify(
        // L'index unique est la cause la plus probable, et son message brut
        // ne dit rien à qui ne connaît pas le schéma.
        /duplicate key|unique/i.test(message)
          ? "Un objectif existe déjà pour cette personne, cette métrique et cette période."
          : `Enregistrement impossible : ${message}`,
        { type: "error" },
      );
    };

    if (target) {
      update(
        "targets",
        { id: target.id, data, previousData: target },
        { onSuccess, onError },
      );
      return;
    }
    create("targets", { data }, { onSuccess, onError });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {target ? "Modifier l'objectif" : "Nouvel objectif"}
          </DialogTitle>
          <DialogDescription>
            Un objectif sans titulaire est celui de l'équipe. Il se compare aux
            affaires signées sur la période, jamais au pipeline.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Titulaire</Label>
            <Select value={salesId} onValueChange={setSalesId}>
              <SelectTrigger aria-label="Titulaire">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="equipe">Équipe (objectif commun)</SelectItem>
                {sales.map((sale) => (
                  <SelectItem key={sale.id} value={String(sale.id)}>
                    {sale.first_name} {sale.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Mesure</Label>
              <Select value={metric} onValueChange={setMetric}>
                <SelectTrigger aria-label="Mesure">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mrr">MRR — mensuel récurrent</SelectItem>
                  <SelectItem value="arr">ARR — annuel récurrent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Montant (€)</Label>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="25000"
                inputMode="decimal"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Début</Label>
              <Input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Fin (incluse)</Label>
              <Input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          {target ? (
            <Button
              type="button"
              variant={confirmDelete ? "destructive" : "ghost"}
              size="sm"
              onClick={() => {
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  return;
                }
                remove(
                  "targets",
                  { id: target.id, previousData: target },
                  {
                    onSuccess: () => {
                      notify("Objectif supprimé", { type: "info" });
                      onClose();
                    },
                  },
                );
              }}
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden />
              {confirmDelete ? "Confirmer la suppression" : "Supprimer"}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Annuler
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!isValid || isCreating || isUpdating}
              title={
                isValid
                  ? undefined
                  : "Montant positif et période ordonnée requis"
              }
            >
              Enregistrer
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const TargetsCard = () => {
  const [editing, setEditing] = useState<Target | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: targets, isPending } = useGetList<Target>("targets", {
    pagination: { page: 1, perPage: 50 },
    sort: { field: "period_end", order: "ASC" },
  });

  const { data: sales } = useGetList<Sale>("sales", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "last_name", order: "ASC" },
    filter: { "disabled@neq": true },
  });

  // L'encaisse reelle, pour l'objectif d'equipe (NOS-1181).
  const { data: revenueRows } = useGetList<RevenueActual>("revenue_actuals", {
    pagination: { page: 1, perPage: 60 },
    sort: { field: "month", order: "DESC" },
  });
  const actuals = groupByMonth(revenueRows ?? []);

  /*
   * Toutes les affaires signées, pas seulement celles de la période affichée.
   *
   * Le filtrage par période se fait dans `countsTowardTarget`, objectif par
   * objectif : deux objectifs peuvent couvrir des périodes différentes, et
   * une requête par objectif serait une requête par ligne de la carte.
   */
  const { data: wonDeals } = useGetList<Deal>("deals", {
    pagination: { page: 1, perPage: 500 },
    sort: { field: "won_at", order: "DESC" },
    filter: { "stage@eq": "closed-won" },
  });

  const deals = wonDeals ?? [];
  const all = targets ?? [];
  const team = all.filter((t) => t.sales_id == null);
  const personal = all.filter((t) => t.sales_id != null);

  const ownerName = (salesId: Target["sales_id"]) => {
    const sale = (sales ?? []).find((s) => String(s.id) === String(salesId));
    return sale
      ? `${sale.first_name} ${sale.last_name}`
      : "Responsable inconnu";
  };

  // Un titulaire, ses metriques. `Map` et non un objet : elle preserve
  // l'ordre d'insertion, donc l'ordre de tri des commerciaux.
  const byOwner = new Map<string, Target[]>();
  for (const target of personal) {
    const key = String(target.sales_id);
    byOwner.set(key, [...(byOwner.get(key) ?? []), target]);
  }

  /*
   * La periode en chapeau, si elle est commune (NOS-1183).
   *
   * Elle etait repetee sur chaque ligne, ou elle ne renseignait plus rien.
   * Mais on ne la remonte QUE si tous les objectifs la partagent : affichee
   * en tete alors que deux objectifs courent sur des periodes differentes,
   * elle mentirait sur la moitie de la carte. Sinon, chaque ligne la reprend.
   */
  const periods = new Set(
    all.map((t) => `${t.period_start.slice(0, 10)}|${t.period_end.slice(0, 10)}`),
  );
  const commonPeriod = periods.size === 1 && all[0] ? all[0] : null;

  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          {/*
            L'emoji plutot que le pictogramme monochrome : demande par Simon,
            et c'est le seul endroit de la carte qui porte de la couleur.

            `aria-hidden` parce que le mot « Objectifs » suit immediatement :
            un lecteur d'ecran annoncerait sinon « cible directe, Objectifs ».
          */}
          <span aria-hidden className="text-sm leading-none">
            🎯
          </span>
          Objectifs
          {commonPeriod && (
            <span className="font-normal normal-case tracking-normal">
              · {formatTargetPeriod(commonPeriod)}
            </span>
          )}
        </span>
        <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
          <Plus className="w-3.5 h-3.5" aria-hidden />
          Définir un objectif
        </Button>
      </div>

      {isPending ? null : all.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun objectif défini. Le pipeline s'affiche alors sans référentiel :
          un montant seul ne dit pas si l'on est en avance ou en retard.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {/*
            L'objectif d'équipe d'abord et en grand : c'est celui qui engage
            l'entreprise, les objectifs personnels en sont la décomposition.
            Sans intitulé, un commercial qui n'a pas d'objectif personnel
            lisait celui de l'équipe comme le sien.
          */}
          {team.length > 0 && (
            <>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Équipe
              </span>
              <TargetRow
                targets={team}
                deals={deals}
                actuals={actuals}
                onEdit={setEditing}
                emphasis
              />
            </>
          )}

          {byOwner.size > 0 && (
            <>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-t pt-3">
                Par commercial
              </span>
              {[...byOwner.entries()].map(([salesId, owned]) => (
                <TargetRow
                  key={salesId}
                  targets={owned}
                  deals={deals}
                  actuals={actuals}
                  owner={ownerName(owned[0].sales_id)}
                  onEdit={setEditing}
                />
              ))}
            </>
          )}

          {/* Une moitié absente se dit, plutôt que de laisser croire qu'elle
              n'existe pas dans le produit. */}
          {team.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Aucun objectif d'équipe. C'est celui qui engage l'entreprise.
            </p>
          )}
          {byOwner.size === 0 && (
            <p className="text-xs text-muted-foreground border-t pt-3">
              Aucun objectif individuel défini.
            </p>
          )}
        </div>
      )}

      {(creating || editing) && (
        <TargetDialog
          // Remonte la fenêtre à chaque cible : son état interne est initialisé
          // au montage, et sans clé l'édition d'un second objectif rouvrirait
          // les valeurs du premier.
          key={editing ? String(editing.id) : "nouveau"}
          target={editing ?? undefined}
          sales={sales ?? []}
          open
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </Card>
  );
};
