import { AlertTriangle, ChevronDown, RotateCcw } from "lucide-react";
import { useGetList, useListFilterContext } from "ra-core";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Sale } from "../types";
import { startOfToday } from "./cockpit/dealDates";
import {
  PERIOD_IDS,
  getPeriodFilter,
  resolvePeriod,
  type PeriodId,
} from "./cockpit/dealPeriods";
import {
  HEALTH_FILTER_KEYS,
  LIST_FILTER_KEYS,
  toListFilter,
} from "./dealFilterContract";

/**
 * ---------------------------------------------------------------------------
 * The six filters of NOS-956 §2
 * ---------------------------------------------------------------------------
 *     Période | Responsable | Priorité | Catégorie | Produit | Étape
 *
 * Always visible, not hidden behind an "Add filter" menu: this bar is how the
 * screen is driven, and the spec caps it at six precisely so it can stay on
 * screen. The same bar serves the list and the kanban — "les filtres
 * fonctionnent de manière identique sur Liste et Kanban" falls out of writing
 * to the shared list filters rather than to local state.
 *
 * Period defaults to "Toutes" here, unlike the dashboard: this is the execution
 * screen, and a deal with no close date in the current quarter is still a deal
 * you have to work.
 */

const ALL = "__all__";

/**
 * Lit une sélection multiple depuis les filtres de liste (NOS-1051).
 *
 * Deux orthographes coexistent, et il faut savoir lire les deux : `field@in`
 * `(a,b)` que produit cette barre, et `field` scalaire que produisent encore
 * les liens du dashboard. Sans ça, arriver depuis « voir les Qualifié »
 * afficherait un filtre Étape vide alors que la liste est bien filtrée.
 */
const readSelection = (
  filterValues: Record<string, unknown> | undefined,
  field: string,
): string[] => {
  const multi = filterValues?.[`${field}@in`];
  if (typeof multi === "string") {
    return multi
      .replace(/^\(|\)$/g, "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  const single = filterValues?.[field];
  return single == null || single === "" ? [] : [String(single)];
};

/** Étiquette compacte demandée par la spec : « Qualifié + Démo/POC +1 ». */
const summarise = (
  selected: string[],
  choices: { value: string; label: string }[],
  allLabel: string,
): string => {
  if (selected.length === 0) return allLabel;
  const labels = selected.map(
    (value) => choices.find((choice) => choice.value === value)?.label ?? value,
  );
  if (labels.length <= 2) return labels.join(" + ");
  return `${labels[0]} + ${labels[1]} +${labels.length - 2}`;
};

/**
 * Un filtre à cocher, pour les axes où « Lead + Qualifié + Démo/POC » a un sens.
 *
 * `DropdownMenuCheckboxItem` plutôt qu'un composant multi-select maison : la
 * brique existe déjà dans `ui/`, elle est accessible au clavier, et elle évite
 * d'introduire un cinquième patron de sélection dans cet écran. Le menu ne se
 * referme pas à chaque clic — `onSelect` annule l'événement — sinon cocher
 * trois étapes demanderait d'ouvrir le menu trois fois.
 */
const FilterMultiSelect = ({
  label,
  selected,
  onToggle,
  onClear,
  allLabel,
  choices,
  className = "w-40",
}: {
  label: string;
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
  allLabel: string;
  choices: { value: string; label: string }[];
  className?: string;
}) => (
  <div className="flex flex-col gap-1 min-w-0">
    <span className="text-xs font-medium text-muted-foreground">
      {label} {selected.length > 1 && `(${selected.length})`}
    </span>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label={label}
          className={`${className} justify-between font-normal`}
        >
          <span className="truncate">
            {summarise(selected, choices, allLabel)}
          </span>
          <ChevronDown className="w-4 h-4 opacity-50 shrink-0" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
        <DropdownMenuCheckboxItem
          checked={selected.length === 0}
          onSelect={(event) => {
            event.preventDefault();
            onClear();
          }}
        >
          {allLabel}
        </DropdownMenuCheckboxItem>
        {choices.map((choice) => (
          <DropdownMenuCheckboxItem
            key={choice.value}
            checked={selected.includes(choice.value)}
            onSelect={(event) => {
              event.preventDefault();
              onToggle(choice.value);
            }}
          >
            {choice.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);

/**
 * Colonne PostgREST → champ du contrat partagé.
 *
 * Le passage par `toListFilter` n'est pas un détour : c'est lui qui décide
 * comment un `@in` s'écrit, et le faire ici à la main rouvrirait exactement la
 * dérive que le contrat existe pour empêcher.
 */
const contractKeyOf = (field: string): "salesId" | "category" | "priority" | "stage" =>
  field === "sales_id"
    ? "salesId"
    : (field as "category" | "priority" | "stage");

const PERIOD_KEYS = [
  "expected_closing_date@gte",
  "expected_closing_date@lte",
] as const;

const FilterSelect = ({
  label,
  value,
  onChange,
  allLabel,
  choices,
  className = "w-40",
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  allLabel: string;
  choices: { value: string; label: string }[];
  className?: string;
}) => (
  <label className="flex flex-col gap-1 min-w-0">
    <span className="text-xs font-medium text-muted-foreground">{label}</span>
    <Select
      value={value ?? ALL}
      onValueChange={(next) => onChange(next === ALL ? null : next)}
    >
      <SelectTrigger className={className} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {choices.map((choice) => (
          <SelectItem key={choice.value} value={choice.value}>
            {choice.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </label>
);

export const DealFilterBar = () => {
  const { dealCategories, dealPriorities, dealProducts, dealStages } =
    useConfigurationContext();
  const { filterValues, displayedFilters, setFilters } = useListFilterContext();
  const today = startOfToday();

  // Deactivated owners are gone from the team, so they have no business in the
  // filter (issue #123). Every other sales picker in the app already filters
  // this way — this bar and the dashboard were the two that did not.
  const { data: sales } = useGetList<Sale>("sales", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "last_name", order: "ASC" },
    filter: { "disabled@neq": true },
  });

  const merge = (changes: Record<string, unknown>) => {
    const next = { ...filterValues, ...changes };
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) delete next[key];
    }
    setFilters(next, displayedFilters);
  };

  /**
   * The period is read back out of the filters rather than held in local state,
   * so the selector stays in sync with the URL after a reload — and so a link
   * arriving from the dashboard shows the period it carried.
   */
  const periodId: PeriodId = (() => {
    const bounds = PERIOD_KEYS.map((key) => filterValues?.[key]);
    if (bounds.every((bound) => bound == null)) return "all";
    return (
      PERIOD_IDS.find((id) => {
        const filter = getPeriodFilter(resolvePeriod(id, today));
        return PERIOD_KEYS.every((key, index) => filter[key] === bounds[index]);
      }) ?? "all"
    );
  })();

  const products: string[] = (() => {
    const raw = filterValues?.["products@ov"];
    if (typeof raw !== "string") return [];
    return raw
      .replace(/^\{|\}$/g, "")
      .split(",")
      .filter(Boolean);
  })();

  const setPeriod = (id: PeriodId) => {
    const filter = getPeriodFilter(resolvePeriod(id, today));
    merge({
      "expected_closing_date@gte": filter["expected_closing_date@gte"],
      "expected_closing_date@lte": filter["expected_closing_date@lte"],
    });
  };

  /**
   * Bascule une valeur dans un filtre multiple (NOS-1051).
   *
   * Écrit toujours les deux clés : `field@in` avec la nouvelle sélection, et
   * `field` à `undefined`. Sans cette remise à zéro, un filtre scalaire hérité
   * d'un lien du dashboard resterait en place à côté du `@in`, et les deux se
   * combineraient en ET — « Qualifié ET (Lead, Qualifié) », qui ne rend jamais
   * ce que l'utilisateur vient de cocher.
   */
  const toggleSelection = (field: string, value: string) => {
    const current = readSelection(filterValues, field);
    const next = current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value];
    merge({
      [field]: undefined,
      [`${field}@in`]: next.length
        ? toListFilter({ [contractKeyOf(field)]: next })[`${field}@in`]
        : undefined,
    });
  };

  const clearSelection = (field: string) =>
    merge({ [field]: undefined, [`${field}@in`]: undefined });

  const toggleProduct = (value: string) => {
    const next = products.includes(value)
      ? products.filter((product) => product !== value)
      : [...products, value];
    // Spelled by the shared contract, so the encoding matches what the
    // dashboard's links produce. An empty selection clears the filter rather
    // than sending `{}`, which would match nothing.
    merge({
      "products@ov": next.length
        ? toListFilter({ products: next })["products@ov"]
        : undefined,
    });
  };

  // La liste vient du contrat, pas d'une énumération locale (NOS-1058) : elle
  // couvre les six axes affichés **et** les quatre alertes du dashboard, que la
  // barre ne montre pas mais que ra-core persiste dans le navigateur.
  const hasFilters = LIST_FILTER_KEYS.some(
    (key) => filterValues?.[key] != null,
  );

  // Un filtre d'alerte est actif mais invisible : il faut le dire, sinon une
  // liste vide passe pour une liste sans données.
  const healthFilterActive = HEALTH_FILTER_KEYS.some(
    (key) => filterValues?.[key] != null,
  );

  return (
    <div className="flex flex-wrap items-end gap-3">
      <FilterSelect
        label="Période (date de clôture prévue)"
        value={periodId === "all" ? null : periodId}
        onChange={(value) => setPeriod((value ?? "all") as PeriodId)}
        allLabel="Toutes périodes"
        choices={PERIOD_IDS.filter((id) => id !== "all").map((id) => ({
          value: id,
          label: resolvePeriod(id, today).label,
        }))}
        className="w-56"
      />

      <FilterMultiSelect
        label="Responsable"
        selected={readSelection(filterValues, "sales_id")}
        onToggle={(value) => toggleSelection("sales_id", value)}
        onClear={() => clearSelection("sales_id")}
        allLabel="Tous"
        choices={(sales ?? []).map((sale) => ({
          value: String(sale.id),
          label: `${sale.first_name} ${sale.last_name}`.trim(),
        }))}
      />

      {/*
        Priority is pills, not a dropdown. The mockup shows the four levels side
        by side, and the spec asks to "garder visuellement que P0 — plus visuel
        et plus rapide": one click to isolate the critical deals.

        Additives depuis NOS-1051 : cliquer P1 après P0 ajoute au lieu de
        remplacer, pour que « P0 + P1 » soit possible comme le demande la spec.
        Les pastilles restent le bon support — elles montrent honnêtement deux
        valeurs actives à la fois, ce qu'un `Select` ne sait pas faire.
      */}
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          Priorité{" "}
          {readSelection(filterValues, "priority").length > 1 &&
            `(${readSelection(filterValues, "priority").length})`}
        </span>
        <div
          className="flex items-center gap-1"
          role="group"
          aria-label="Priorité"
        >
          {dealPriorities.map((priority) => {
            const active = readSelection(filterValues, "priority").includes(
              priority.value,
            );
            return (
              <Button
                key={priority.value}
                type="button"
                size="sm"
                variant={active ? "default" : "outline"}
                aria-pressed={active}
                title={priority.label}
                onClick={() => toggleSelection("priority", priority.value)}
              >
                <span
                  className={`w-2 h-2 rounded-full ${priority.dotClassName}`}
                  aria-hidden
                />
                {priority.label.split(" ")[0]}
              </Button>
            );
          })}
        </div>
      </div>

      <FilterMultiSelect
        label="Catégorie"
        selected={readSelection(filterValues, "category")}
        onToggle={(value) => toggleSelection("category", value)}
        onClear={() => clearSelection("category")}
        allLabel="Toutes"
        choices={dealCategories}
      />

      {/* Multi-select, so pills again: "Produit = No-show + Entrant" means
          either, and a dropdown cannot show two active values honestly. */}
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          Produit {products.length > 0 && `(${products.length})`}
        </span>
        <div
          className="flex items-center gap-1"
          role="group"
          aria-label="Produit"
        >
          {dealProducts.map((product) => {
            const active = products.includes(product.value);
            return (
              <Button
                key={product.value}
                type="button"
                size="sm"
                variant={active ? "default" : "outline"}
                aria-pressed={active}
                onClick={() => toggleProduct(product.value)}
              >
                {product.label}
              </Button>
            );
          })}
        </div>
      </div>

      <FilterMultiSelect
        label="Étape"
        selected={readSelection(filterValues, "stage")}
        onToggle={(value) => toggleSelection("stage", value)}
        onClear={() => clearSelection("stage")}
        allLabel="Toutes"
        choices={dealStages}
        className="w-48"
      />

      {healthFilterActive && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            &nbsp;
          </span>
          <span className="inline-flex items-center gap-1.5 h-9 px-2.5 rounded-md border border-[var(--deal-status-serious)] text-xs text-[var(--deal-status-serious)]">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden />
            Alerte du tableau de bord active
          </span>
        </div>
      )}

      {hasFilters && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mb-0.5"
          onClick={() =>
            merge(
              Object.fromEntries(
                LIST_FILTER_KEYS.map((key) => [key, undefined]),
              ),
            )
          }
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden />
          Réinitialiser
        </Button>
      )}
    </div>
  );
};
