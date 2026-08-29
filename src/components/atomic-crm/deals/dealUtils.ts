import { toSlug } from "@/lib/toSlug";

import { formatDate, formatDateTime } from "../misc/formatDate";

import type { ConfigurationContextValue } from "../root/ConfigurationContext";
import type { CustomView } from "../root/ConfigurationContext";
import type {
  CompanyType,
  Deal,
  DealPriority,
  DealPriorityValue,
  EstablishmentType,
} from "../types";
import { defaultDealPriorities } from "../root/defaultConfiguration";

export function getDefaultDealStage(
  dealStages: ConfigurationContextValue["dealStages"],
  visibleStages?: string[],
) {
  return (
    visibleStages?.find((stage) =>
      dealStages.some((dealStage) => dealStage.value === stage),
    ) ?? dealStages[0]?.value
  );
}

/**
 * Choices for the "Vue" menu (NOS-801).
 *
 * Two custom views that resolve to the same company type — or a view whose
 * label matches a configured company type — used to produce visually identical
 * entries, because only the company types were deduplicated and only by value.
 * Entries are now unique on both their value and their normalised label, with
 * the custom views taking precedence since they carry the wording the user chose.
 */
export function getCompanyTypeChoices(
  companyTypes: ConfigurationContextValue["companyTypes"],
  customViews: ConfigurationContextValue["customViews"],
) {
  const choices: { value: string; label: string }[] = [];
  const seenValues = new Set<string>();
  const seenLabels = new Set<string>();

  const push = (value: string, label: string) => {
    const labelKey = toSlug(label);
    if (!value || seenValues.has(value) || seenLabels.has(labelKey)) return;
    choices.push({ value, label });
    seenValues.add(value);
    seenLabels.add(labelKey);
  };

  customViews.forEach((view) => {
    push(
      getCustomViewCompanyType(view, customViews),
      view.label || view.companyType,
    );
  });
  companyTypes.forEach((type) => push(type.value, type.label));

  return choices;
}

export function getCustomViewCompanyType(
  view: CustomView,
  customViews: ConfigurationContextValue["customViews"],
) {
  const labelSlug = toSlug(view.label);
  const duplicateCompanyType =
    customViews.filter(
      (candidate) => candidate.companyType === view.companyType,
    ).length > 1;
  const needsDedicatedLeadView =
    /^leads?-/.test(labelSlug) ||
    labelSlug === "lead" ||
    labelSlug === "referral" ||
    labelSlug === "refferal";

  if (labelSlug && (duplicateCompanyType || needsDedicatedLeadView)) {
    return labelSlug;
  }

  return view.companyType;
}

/**
 * Slugs that are known to designate non-commercial objects (NOS-797).
 *
 * The authoritative source is the `commercial` flag on the configured company
 * types. This list is only a safety net for custom views created before that
 * flag existed, whose slug was derived from a free-text label — so the spelling
 * variants that exist in production are all covered.
 */
const NON_COMMERCIAL_SLUGS = new Set([
  "investisseur",
  "investisseurs",
  "partenaire",
  "partenaires",
  "partenariat",
  "partenariats",
  "ressource",
  "ressources",
  "presse",
  "leads-santexpo",
  "lead-santexpo",
  "santexpo",
  "logiciels-brique",
  "logiciel-brique",
  "logiciels-briques",
  "logiciel-briques",
]);

/**
 * True when a company type designates a non-commercial object: investors,
 * partnerships, resources, press, Santexpo leads and software bricks.
 *
 * These keep their own views and their data, but they never show up in the
 * Opportunités board/list, nor in any ARR aggregate.
 */
export function isNonCommercialCompanyType(
  companyType: string | null | undefined,
  companyTypes: CompanyType[],
): boolean {
  if (!companyType) return false; // untyped deals are plain opportunities
  const configured = companyTypes.find((type) => type.value === companyType);
  if (configured?.commercial === false) return true;
  // An explicit `commercial: true` overrides the built-in list, so an admin can
  // reclaim a slug without renaming the view.
  if (configured?.commercial === true) return false;
  return NON_COMMERCIAL_SLUGS.has(companyType);
}

/** Every non-commercial slug currently in play, from the config and the views. */
export function getNonCommercialCompanyTypes(
  companyTypes: CompanyType[],
  customViews: CustomView[],
): string[] {
  const candidates = new Set<string>([
    ...companyTypes.map((type) => type.value),
    ...customViews.map((view) => getCustomViewCompanyType(view, customViews)),
  ]);
  return [...candidates].filter((value) =>
    isNonCommercialCompanyType(value, companyTypes),
  );
}

/**
 * PostgREST filter restricting a deal list to the commercial pipeline.
 *
 * Deals with no company type are plain opportunities and always belong here;
 * the others are kept unless their type is flagged non-commercial.
 *
 * Filtering happens on `deals_summary.company_type_key`, which is
 * `coalesce(company_type, '')`. Filtering the raw column would silently drop
 * every untyped deal, because PostgREST evaluates `not.in.(…)` as NULL — and
 * therefore false — when the column itself is NULL.
 */
export function getCommercialDealsFilter(
  companyTypes: CompanyType[],
  customViews: CustomView[],
): Record<string, string> {
  const excluded = getNonCommercialCompanyTypes(companyTypes, customViews);
  if (excluded.length === 0) return {};
  return {
    "company_type_key@not.in": `(${excluded.join(",")})`,
  };
}

/**
 * Resolve a stored priority slug to its configured choice.
 *
 * Returns `null` when the value is missing or unknown — the "Priorité à
 * définir" case the spec asks for. It used to fall back to `list[0]`, which was
 * survivable while the list started at "Normal" but became actively wrong once
 * P0/P1/P2 reordered it most-urgent-first: every unset deal would have been
 * displayed as P0 Critique.
 */
export function getDealPriority(
  value: string | null | undefined,
  priorities: DealPriority[] = defaultDealPriorities,
): DealPriority | null {
  if (!value) return null;
  const list = priorities.length ? priorities : defaultDealPriorities;
  return list.find((priority) => priority.value === value) ?? null;
}

/**
 * Sort comparator, most urgent first. An unset priority weighs less than any
 * configured one, so undefined deals sink to the bottom rather than posing as
 * the highest priority.
 */
export function compareDealPriority(
  a: string | null | undefined,
  b: string | null | undefined,
  priorities: DealPriority[] = defaultDealPriorities,
): number {
  return (
    (getDealPriority(b, priorities)?.weight ?? -1) -
    (getDealPriority(a, priorities)?.weight ?? -1)
  );
}

export function isDealPriorityValue(
  value: unknown,
): value is DealPriorityValue {
  return value === "normal" || value === "important" || value === "urgent";
}

/**
 * ARR suggested by an establishment type (NOS-810), or null when the type is
 * unknown or has no tier configured.
 */
export function getSuggestedArr(
  establishmentType: string | null | undefined,
  establishmentTypes: EstablishmentType[],
): number | null {
  if (!establishmentType) return null;
  const tier = establishmentTypes.find(
    (type) => type.value === establishmentType,
  );
  return typeof tier?.arr === "number" ? tier.arr : null;
}

/**
 * Decide what a deal's ARR should become when the establishment type changes
 * (NOS-811/812).
 *
 * The prefill is a suggestion, never a correction: as soon as a value was typed
 * by hand — or simply is a non-zero amount that predates the flag — it wins and
 * is returned untouched.
 */
export function resolvePrefilledArr({
  currentArr,
  isManual,
  suggestedArr,
}: {
  currentArr: number | null | undefined;
  isManual: boolean | undefined;
  suggestedArr: number | null;
}): { arr: number | null | undefined; changed: boolean } {
  if (isManual) return { arr: currentArr, changed: false };
  if (currentArr != null && currentArr !== 0) {
    return { arr: currentArr, changed: false };
  }
  if (suggestedArr == null) return { arr: currentArr, changed: false };
  return { arr: suggestedArr, changed: true };
}

/** The stage that means "the contract is signed". */
export const SIGNED_DEAL_STAGE = "closed-won";

/**
 * Le type d'opportunité « Partenariat » et la catégorie qu'il implique
 * (NOS-1093).
 *
 * Les deux constantes vivent côte à côte parce que le lien entre elles est une
 * règle métier, pas une coïncidence : choisir ce type range l'opportunité dans
 * cette catégorie. Éparpiller les deux chaînes dans un `useEffect` rendrait la
 * règle invisible au grep le jour où l'un des deux slugs bouge.
 */
export const PARTNERSHIP_OPPORTUNITY_TYPE = "partenariat";
export const PARTNER_DEAL_CATEGORY = "partenaire";

/** Today, in the `YYYY-MM-DD` form the date columns expect. */
export function todayISODate(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Pipeline dates set when a deal is created (NOS-805).
 *
 * A deal entering the board today entered the pipeline today, and one created
 * directly in the signed stage was signed today.
 */
export function withDealCreateDates<T extends Record<string, any>>(
  data: T,
  today: string = todayISODate(),
): T {
  const next: Record<string, any> = { ...data };
  if (next.entered_at == null) next.entered_at = today;
  if (next.stage === SIGNED_DEAL_STAGE && next.won_at == null) {
    next.won_at = today;
  }
  return next as T;
}

/**
 * Pipeline dates maintained on update (NOS-805).
 *
 * Reaching the signed stage stamps the signature date, unless one is already
 * recorded. Leaving that stage never clears it: an existing date is a fact, and
 * this migration is not in the business of erasing history. Dragging a card on
 * the Kanban board goes through here too, since it issues a plain update.
 */
export function withDealUpdateDates<T extends Record<string, any>>(
  data: T,
  previousData?: Record<string, any>,
  today: string = todayISODate(),
): T {
  const nextStage = data.stage ?? previousData?.stage;
  if (nextStage !== SIGNED_DEAL_STAGE) return data;
  if (previousData?.stage === SIGNED_DEAL_STAGE) return data;
  if (data.won_at != null || previousData?.won_at != null) return data;
  return { ...data, won_at: today };
}

/**
 * Patch the deals a creation has just re-indexed into a cached list page.
 *
 * Applied through `setQueriesData({ queryKey: ["deals"] })`, which matches by
 * *prefix*: besides the `getList` pages this is meant for, `["deals"]` also
 * covers `getOne` — which caches a bare record — and `getMany` — a bare array.
 * Neither has a `data` array to walk, so anything that is not a list page comes
 * back untouched.
 *
 * Without that guard the updater called `res.data.map(...)` on a record and
 * threw a TypeError, which aborted the creation's `onSuccess` before it could
 * invalidate the cache and redirect: the dialog stayed open, the board never
 * refreshed, and the opportunity was inserted all the same (issue #115).
 */
export function applyDealIndexShift<T>(
  cached: T,
  dealsById: Record<string, Deal>,
): T {
  const page = cached as unknown as { data?: unknown } | null | undefined;
  if (page == null || typeof page !== "object" || !Array.isArray(page.data)) {
    return cached;
  }
  return {
    ...page,
    data: (page.data as Deal[]).map((deal) => dealsById[deal.id] ?? deal),
  } as T;
}

export function getRelativeTimeString(dateString: string): string {
  const date = new Date(dateString);
  date.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diff = date.getTime() - today.getTime();
  const unitDiff = Math.round(diff / (1000 * 60 * 60 * 24));

  // Check if the date is more than one week old
  if (Math.abs(unitDiff) > 7) {
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "long",
    }).format(date);
  }

  // Intl.RelativeTimeFormat for dates within the last week
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  return ucFirst(rtf.format(unitDiff, "day"));
}

function ucFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Une date de calendrier, sans heure.
 *
 * Ne fait plus que déléguer à `misc/formatDate` (NOS-1165). Elle portait sa
 * propre logique de fuseau — construire un `Date` local depuis les composants
 * — qui donnait le bon jour à Paris comme à New York, mais le jour précédent à
 * Tokyo. Le module central ancre les dates nues à midi UTC, où aucun fuseau
 * réel ne franchit de frontière de jour.
 *
 * Elle levait aussi sur un format inattendu. Une exception pour une date mal
 * formée fait tomber la page entière : le module rend un tiret.
 */
export function formatISODateString(dateString: string | null | undefined) {
  return formatDate(dateString);
}

/**
 * L'échéance d'une tâche, avec son heure quand elle en a une.
 *
 * Les échéances arrivent sous deux formes : un `timestamptz` complet quand la
 * tâche a été créée avec une heure, et un `YYYY-MM-DD` nu quand elle a été
 * reportée depuis la liste. `formatDateTime` distingue les deux — et reconnaît
 * aussi le troisième cas, celui que l'audit a relevé : un horodatage à minuit
 * UTC, écrit par un sélecteur de jour, qui s'affichait « 2:00 AM » à Paris.
 */
export function formatDealMeetingDate(
  dueDate: string | null | undefined,
): string {
  return formatDateTime(dueDate);
}

/**
 * Date de clôture prévue proposée à la création : six semaines (NOS-1014).
 *
 * Le formulaire proposait « aujourd'hui », soit la même valeur que la date
 * d'entrée en pipeline — donc une opportunité créée et close le jour même. Il
 * fallait la corriger à chaque saisie, et l'oublier faussait les prévisions.
 *
 * Six semaines est le délai demandé par Simon, pas une constante déduite des
 * données : c'est une valeur de départ, pas une prédiction.
 *
 * Rendue par une fonction et non par une constante de module : figée à
 * l'import, elle vieillirait d'un jour à chaque jour d'onglet ouvert.
 */
export const DEAL_DEFAULT_CLOSING_WEEKS = 6;

export function getDefaultExpectedClosingDate(
  today: Date = new Date(),
): string {
  const target = new Date(today);
  target.setDate(target.getDate() + DEAL_DEFAULT_CLOSING_WEEKS * 7);
  // Champs de calendrier locaux, comme partout ailleurs : `toISOString()` lit
  // en UTC et décale d'un jour pour tout le monde à l'est de Greenwich.
  const month = String(target.getMonth() + 1).padStart(2, "0");
  const day = String(target.getDate()).padStart(2, "0");
  return `${target.getFullYear()}-${month}-${day}`;
}

/**
 * Étape temporaire, hors du travail commercial courant : une opportunité y est
 * parquée en attendant qu'un humain décide, pas travaillée.
 */
export const UNCLASSIFIED_DEAL_STAGE = "a-reclasser";

/**
 * Les étapes présélectionnées à l'ouverture de l'écran Opportunités (NOS-1062).
 *
 * Dérivées de la configuration plutôt qu'écrites en dur : le pipeline a déjà
 * changé deux fois cette année, et une liste figée ici aurait masqué en silence
 * toute étape ajoutée depuis.
 *
 * Sont exclues les étapes terminales — `dealPipelineStatuses`, soit Close Won,
 * Lost et Churn — et « À reclasser ». Restent donc les étapes où une affaire se
 * travaille. Les opportunités à reclasser ne disparaissent pas pour autant :
 * `ReclassifyNotice` continue de les compter et d'ouvrir leur filtre.
 */
export function getDefaultOpenStages(
  dealStages: { value: string }[],
  pipelineStatuses: string[],
): string[] {
  return dealStages
    .map((stage) => stage.value)
    .filter(
      (value) =>
        value !== UNCLASSIFIED_DEAL_STAGE && !pipelineStatuses.includes(value),
    );
}
