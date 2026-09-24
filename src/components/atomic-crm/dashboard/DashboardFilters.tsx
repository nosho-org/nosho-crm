import { RotateCcw } from "lucide-react";
import { useGetList } from "ra-core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { FilterMultiSelect } from "../filters/FilterMultiSelect";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Sale } from "../types";
import {
  CUSTOM_PERIOD_ID,
  getPeriodChoices,
  type PeriodId,
} from "../deals/cockpit/dealPeriods";
import { useDashboard } from "./DashboardContext";

/**
 * The four global filters (NOS-955 §2).
 *
 * "Seulement quatre pour éviter de recréer un CRM dans le dashboard." Every
 * widget recomputes from the same selection, so there is nothing to synchronise
 * here — changing a value changes the query, and the whole page follows.
 */

const ALL = "__all__";

const FilterSelect = ({
  label,
  value,
  onChange,
  allLabel,
  choices,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  allLabel: string;
  choices: { value: string; label: string }[];
}) => (
  <label className="flex flex-col gap-1 min-w-0">
    <span className="text-xs font-medium text-muted-foreground">{label}</span>
    <Select
      value={value ?? ALL}
      onValueChange={(next) => onChange(next === ALL ? null : next)}
    >
      <SelectTrigger className="w-full sm:w-48" aria-label={label}>
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

/**
 * Le produit, en liste deroulante a cocher (demande de Simon, 24/09/2026).
 *
 * C'etaient des pastilles cote a cote, et le commentaire qui le justifiait
 * disait vrai d'un `Select` ordinaire : « a dropdown cannot show two values at
 * once without lying about which is active ». `FilterMultiSelect` n'en est pas
 * un : il coche, et il resume la selection en toutes lettres.
 *
 * Le declencheur est arithmetique : la liste passe de trois a cinq produits
 * avec « Reactivation client » et « Marketing ». Trois pastilles tenaient sur
 * une ligne ; cinq debordent.
 */
const ProductFilter = () => {
  const { dealProducts } = useConfigurationContext();
  const { selection, setProducts } = useDashboard();

  return (
    <FilterMultiSelect
      label="Produit"
      selected={selection.products}
      onToggle={(value) =>
        setProducts(
          selection.products.includes(value)
            ? selection.products.filter((produit) => produit !== value)
            : [...selection.products, value],
        )
      }
      onClear={() => setProducts([])}
      allLabel="Tous"
      choices={dealProducts}
    />
  );
};

/**
 * Les bornes de la période libre (NOS-1083).
 *
 * Deux champs date natifs plutôt qu'un calendrier à intervalle : ils acceptent
 * la saisie au clavier, ce qui compte pour viser 2027 sans faire défiler douze
 * mois, et le navigateur les localise déjà.
 *
 * Les deux sont facultatives. « À partir de janvier 2027 » est une question
 * légitime, et exiger l'autre borne obligerait à en inventer une.
 */
const CustomPeriodBounds = () => {
  const { selection, setCustomPeriod, period } = useDashboard();

  const field = (
    label: string,
    value: string | null,
    onChange: (next: string | null) => void,
  ) => (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Input
        type="date"
        className="w-full sm:w-40"
        aria-label={label}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
      />
    </label>
  );

  const bounded = Boolean(selection.customFrom || selection.customTo);

  return (
    <>
      {field("Du", selection.customFrom, (next) =>
        setCustomPeriod(next, selection.customTo),
      )}
      {field("Au", selection.customTo, (next) =>
        setCustomPeriod(selection.customFrom, next),
      )}
      <p className="text-xs text-muted-foreground mb-2">
        {/* Sans borne, rien n'est filtré. Le dire, plutôt que de laisser le
            sélecteur afficher « Période personnalisée » sur la totalité des
            opportunités — l'écart entre ce qui est annoncé et ce qui est
            compté est exactement ce qui a coûté NOS-1058. */}
        {bounded
          ? period.label
          : "Renseignez une borne — sinon toutes les périodes restent affichées."}
      </p>
    </>
  );
};

export const DashboardFilters = () => {
  const { dealCategories } = useConfigurationContext();
  const {
    selection,
    setPeriodId,
    setSalesId,
    setCategory,
    today,
    reset,
    hasActiveFilters,
  } = useDashboard();

  // Same rule as everywhere else: a deactivated owner is not a filter option
  // (issue #123).
  const { data: sales } = useGetList<Sale>("sales", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "last_name", order: "ASC" },
    filter: { "disabled@neq": true },
  });

  return (
    <div className="flex flex-wrap items-end gap-3">
      <FilterSelect
        /*
          Le libelle dit sur quelle date il porte (NOS-1648).

          Il annoncait « Période » tout court. Simon a choisi une semaine en
          pensant « l'activite de cette semaine » et a obtenu « les affaires
          dont la cloture est prevue cette semaine-la » -- une seule, perdue,
          donc des zeros partout. Les chiffres etaient justes ; la question
          posee n'etait pas celle qu'il croyait poser.

          Meme intitule que sur la liste des opportunites, ou le filtre
          equivalent le precise depuis toujours.
        */
        label="Période (date de clôture prévue)"
        // `null` rather than "all": FilterSelect maps null onto its own ALL
        // sentinel, and passing the raw "all" matched no item — the trigger
        // rendered blank instead of "Toutes périodes".
        value={selection.periodId === "all" ? null : selection.periodId}
        onChange={(value) => setPeriodId((value ?? "all") as PeriodId)}
        allLabel="Toutes périodes"
        choices={getPeriodChoices(today, { includeCustom: true }).filter(
          (c) => c.value !== "all",
        )}
      />

      {selection.periodId === CUSTOM_PERIOD_ID && <CustomPeriodBounds />}

      <FilterSelect
        label="Responsable"
        value={selection.salesId}
        onChange={setSalesId}
        allLabel="Tous"
        choices={(sales ?? []).map((sale) => ({
          value: String(sale.id),
          label: `${sale.first_name} ${sale.last_name}`.trim(),
        }))}
      />

      <FilterSelect
        label="Catégorie client"
        value={selection.category}
        onChange={setCategory}
        allLabel="Toutes"
        choices={dealCategories}
      />

      <ProductFilter />

      {hasActiveFilters && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={reset}
          className="mb-0.5"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden />
          Réinitialiser
        </Button>
      )}
    </div>
  );
};
