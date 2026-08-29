import { AlertTriangle, CalendarClock } from "lucide-react";

import { useConfigurationContext } from "../../root/ConfigurationContext";
import type { DealRecord } from "../cockpit/dealFields";
import { getDealNextAction } from "../cockpit/dealFields";
import { useDealFieldOptions } from "../cockpit/DealCockpitContext";
import { formatDate } from "../cockpit/dealFormat";
import type { DealTaskStatus } from "../show/useDealTasks";

/**
 * ---------------------------------------------------------------------------
 * Deal badges shared by the board, the list and the deal page
 * ---------------------------------------------------------------------------
 * NOS-957 is explicit: "un deal P0 doit avoir le même badge rouge partout dans
 * le CRM". These are the atoms that make that true — one implementation per
 * visual token, consumed by three workstreams building in parallel.
 *
 * Frozen after the socle. Consumers compose them; nobody edits them, because an
 * edit here changes three screens at once.
 *
 * `DealPriorityBadge` is not redefined here: `cockpit/DealFieldBadges.tsx`
 * already has it, already handles the "Non définie" case, and already works
 * outside a cockpit context. It is re-exported below so callers have a single
 * import site.
 */

export { DealPriorityBadge, DealOwner } from "../cockpit/DealFieldBadges";

/* -------------------------------------------------------------------------- */
/* Stage                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * One hue per stage, from the NOS-956 mockup: lead and qualified in blues,
 * demo/POC violet, proposal orange, negotiation amber, then the two terminal
 * stages in the permanent green/red of the charter.
 *
 * Retired stages are not listed — they resolve to the neutral style, which is
 * the right treatment for a value only ever seen in `legacy_stage` or in a
 * custom view.
 */
const STAGE_STYLES: Record<string, string> = {
  "a-reclasser": "bg-muted text-muted-foreground border-border",
  /*
   * Un dégradé monochrome, et non six teintes (NOS-1178).
   *
   * L'audit du 29 août : « Bleu, violet, vert, rouge, orange et jaune
   * coexistent au même niveau sur les étapes, les produits, les statuts, les
   * priorités et le graphique. Sans couleur d'accent réservée, plus rien ne
   * dit "c'est ici qu'il faut agir". »
   *
   * Les étapes sont un **rang**, pas des catégories : lead vient avant
   * qualifié, qui vient avant démo. Six teintes traitaient cet ordre comme six
   * familles sans lien, et obligeaient à apprendre un code. Une seule teinte
   * qui fonce à mesure qu'on avance se lit d'un coup d'œil, y compris de loin
   * sur un kanban.
   *
   * Le bleu est choisi parce qu'il ne veut rien dire d'autre. L'orange est
   * désormais réservé à l'action à faire ; le vert et le rouge restent aux
   * deux issues, ci-dessous, où ils portent une sémantique stricte —
   * acquis / perdu.
   */
  lead: "bg-sky-50 text-sky-700 border-sky-200",
  qualified: "bg-sky-100 text-sky-800 border-sky-300",
  "demo-poc": "bg-blue-100 text-blue-800 border-blue-300",
  proposal: "bg-blue-200 text-blue-900 border-blue-400",
  negociation: "bg-indigo-200 text-indigo-900 border-indigo-400",
  // Les deux issues gardent leur sémantique : vert = acquis, rouge = perdu.
  "closed-won":
    "bg-[color-mix(in_oklch,var(--deal-status-won)_12%,transparent)] text-[var(--deal-status-won)] border-[color-mix(in_oklch,var(--deal-status-won)_35%,transparent)]",
  lost: "bg-[color-mix(in_oklch,var(--deal-status-lost)_12%,transparent)] text-[var(--deal-status-lost)] border-[color-mix(in_oklch,var(--deal-status-lost)_35%,transparent)]",
  // Churn est une perte, mais une perte après signature : neutre plutôt que
  // rouge, pour ne pas la confondre avec une affaire jamais gagnée.
  churn: "bg-muted text-muted-foreground border-border",
};

const NEUTRAL_STAGE = "bg-muted text-muted-foreground border-border";

/**
 * Stage pill.
 *
 * Resolves the label through `dealStages` then `archivedDealStages`, so a deal
 * still carrying a retired slug — or a custom view column — shows its real name
 * instead of a raw slug like `d-mo-rdv`.
 */
export const DealStageBadge = ({
  stage,
  className = "",
}: {
  stage: string | null | undefined;
  className?: string;
}) => {
  const { dealStages, archivedDealStages } = useConfigurationContext();

  if (!stage) {
    return (
      <span
        className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs ${NEUTRAL_STAGE} ${className}`}
      >
        Sans étape
      </span>
    );
  }

  const choice =
    dealStages.find((s) => s.value === stage) ??
    archivedDealStages?.find((s) => s.value === stage);

  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium ${
        STAGE_STYLES[stage] ?? NEUTRAL_STAGE
      } ${className}`}
    >
      {choice?.label || stage}
    </span>
  );
};

/* -------------------------------------------------------------------------- */
/* Products                                                                    */
/* -------------------------------------------------------------------------- */

/** Green / blue / violet, imposed by the mockups. */
const PRODUCT_STYLES: Record<string, string> = {
  "no-show":
    "bg-[color-mix(in_oklch,var(--deal-status-won)_12%,transparent)] text-[var(--deal-status-won)] border-[color-mix(in_oklch,var(--deal-status-won)_35%,transparent)]",
  entrant:
    "bg-[color-mix(in_oklch,var(--deal-series-potential)_12%,transparent)] text-[var(--deal-series-potential)] border-[color-mix(in_oklch,var(--deal-series-potential)_35%,transparent)]",
  data: "bg-[color-mix(in_oklch,var(--deal-series-weighted)_12%,transparent)] text-[var(--deal-series-weighted)] border-[color-mix(in_oklch,var(--deal-series-weighted)_35%,transparent)]",
};

/**
 * The products a deal covers.
 *
 * Renders nothing when there are none — a deal without a product is a normal
 * state, not an anomaly worth an empty-state badge, and the board card is
 * already dense.
 */
export const DealProductBadges = ({
  products,
  className = "",
  wrap = true,
}: {
  products: string[] | null | undefined;
  className?: string;
  /**
   * Wrapping is right everywhere the badges own their vertical space. It is
   * wrong in a fixed-width table cell, where a three-product deal doubles its
   * row height (issue #124) — hence the opt-out rather than a `flex-nowrap`
   * passed through `className`, which loses the cascade coin-flip against the
   * `flex-wrap` below.
   */
  wrap?: boolean;
}) => {
  const { dealProducts } = useConfigurationContext();
  if (!products?.length) return null;

  return (
    <span
      className={`inline-flex ${wrap ? "flex-wrap" : "flex-nowrap"} items-center gap-1 ${className}`}
    >
      {products.map((product) => (
        <span
          key={product}
          className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs ${
            PRODUCT_STYLES[product] ?? NEUTRAL_STAGE
          }`}
        >
          {dealProducts.find((p) => p.value === product)?.label ?? product}
        </span>
      ))}
    </span>
  );
};

/* -------------------------------------------------------------------------- */
/* Next action date                                                            */
/* -------------------------------------------------------------------------- */

const DATE_STYLES: Record<string, string> = {
  overdue: "text-[var(--deal-status-critical)] font-medium",
  today: "text-[var(--deal-status-serious)] font-medium",
  upcoming: "text-foreground",
  undated: "text-muted-foreground",
  missing: "text-muted-foreground",
  "not-expected": "text-muted-foreground",
};

/**
 * The next-action date on its own, colour-coded red / orange / neutral.
 *
 * Deliberately just the date: NOS-956 gives it a dedicated list column, next to
 * a separate "Prochaine action" column. `DealNextActionCell` remains the right
 * component when action, date and owner belong together in one cell.
 *
 * The colour goes on this element and nothing else. Marc-Henri: "ne pas colorer
 * toute la ligne ou toute la carte […] sans transformer le CRM en arc en ciel."
 * Callers must not lift these classes onto the row.
 */
export const DealNextActionDate = ({
  deal,
  className = "",
}: {
  deal: DealRecord;
  className?: string;
}) => {
  const { nextActionOptions } = useDealFieldOptions();
  const action = getDealNextAction(deal, nextActionOptions);

  if (action.status === "missing" || action.status === "undated") {
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs text-[var(--deal-status-warning)] ${className}`}
        title="Aucune date de prochaine action"
      >
        <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden />
        Non définie
      </span>
    );
  }

  if (action.status === "not-expected") {
    return (
      <span className={`text-xs text-muted-foreground/70 ${className}`}>
        Pas encore requise
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${
        DATE_STYLES[action.status] ?? "text-foreground"
      } ${className}`}
    >
      <CalendarClock className="w-3 h-3 shrink-0" aria-hidden />
      {action.date ? formatDate(action.date) : "Sans date"}
    </span>
  );
};

/* -------------------------------------------------------------------------- */
/* Task due date                                                               */
/* -------------------------------------------------------------------------- */

const STATUS_LABELS: Record<DealTaskStatus, string> = {
  overdue: "En retard",
  today: "Aujourd'hui",
  upcoming: "",
  undated: "Sans date",
};

/**
 * A task's due date, colour-coded on the same scale as `DealNextActionDate`.
 *
 * Same visual token, different subject: this one reads a `tasks` row, which is
 * what the deal page has and what it can act on, where `DealNextActionDate`
 * reads the denormalised columns the list and the board get from
 * `deals_summary`. Reusing `DATE_STYLES` is the point — there were already
 * three disagreeing copies of this palette in the deals folder, and #114 must
 * not add a fourth.
 */
export const TaskDueDate = ({
  dueDate,
  status,
  className = "",
}: {
  dueDate: string | null | undefined;
  status: DealTaskStatus;
  className?: string;
}) => {
  const label = STATUS_LABELS[status];

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${
        DATE_STYLES[status] ?? "text-foreground"
      } ${className}`}
    >
      <CalendarClock className="w-3 h-3 shrink-0" aria-hidden />
      {dueDate ? formatDate(dueDate) : "Sans date"}
      {label && status !== "undated" && ` — ${label}`}
    </span>
  );
};

/* -------------------------------------------------------------------------- */
/* Opportunity type                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Un emoji par type d'opportunité (NOS-1094).
 *
 * Dans le code et non dans la configuration, comme `STAGE_COLORS` du funnel et
 * les icônes du bandeau de KPI : c'est de la présentation attachée à un slug.
 * Deux raisons de plus ici — les migrations de ce dépôt doivent rester en ASCII
 * pur, `supabase-push.sh` détruisant tout caractère non-ASCII sous Git Bash, et
 * un emoji stocké en base serait invisible à la relecture du code.
 *
 * Le choix des quatre : une pousse pour l'affaire qui démarre, une courbe qui
 * monte pour l'extension d'un compte existant, une boucle pour l'échéance qui
 * revient, une poignée de main pour le partenariat. Les silhouettes sont
 * volontairement distinctes — dans une colonne dense, c'est la forme générale
 * qu'on lit, pas le détail.
 *
 * Un type sans emoji configuré ne casse rien : seul le libellé s'affiche.
 */
const OPPORTUNITY_TYPE_EMOJI: Record<string, string> = {
  "nouveau-client": "🌱",
  // Le slug dit « extension », le libellé dit « Upsell » — même chose.
  extension: "📈",
  renouvellement: "🔄",
  partenariat: "🤝",
};

/**
 * Type d'opportunité, précédé de son emoji.
 *
 * L'emoji accompagne le libellé, il ne le remplace pas : un pictogramme seul
 * demande d'apprendre un code, et n'est rien pour un lecteur d'écran. Il est
 * donc marqué `aria-hidden` — c'est le mot qui porte le sens, l'image ne fait
 * que le rendre repérable en balayant la colonne.
 */
export const DealOpportunityTypeBadge = ({
  type,
  label,
  className = "",
}: {
  type: string | null | undefined;
  label: string;
  className?: string;
}) => {
  const emoji = type ? OPPORTUNITY_TYPE_EMOJI[type] : undefined;
  return (
    <span className={`inline-flex items-center gap-1 min-w-0 ${className}`}>
      {emoji && (
        <span aria-hidden="true" className="shrink-0">
          {emoji}
        </span>
      )}
      <span className="truncate">{label}</span>
    </span>
  );
};
