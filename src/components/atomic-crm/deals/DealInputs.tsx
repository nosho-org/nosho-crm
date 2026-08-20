import { useContext, useEffect, useState } from "react";
import { required, useCanAccess, useGetOne, useRecordContext } from "ra-core";
import { useFormContext, useFormState, useWatch } from "react-hook-form";
import { AutocompleteArrayInput } from "@/components/admin/autocomplete-array-input";
import { ReferenceArrayInput } from "@/components/admin/reference-array-input";
import { ReferenceInput } from "@/components/admin/reference-input";
import { TextInput } from "@/components/admin/text-input";
import { NumberInput } from "@/components/admin/number-input";
import { DateInput } from "@/components/admin/date-input";
import { SelectInput } from "@/components/admin/select-input";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";

import { contactOptionText } from "../misc/ContactOption";
import {
  arrToMrr,
  currencySymbol,
  formatCurrency,
} from "../misc/formatCurrency";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { defaultDealPriority } from "../root/defaultConfiguration";
import { AutocompleteCompanyInput } from "../companies/AutocompleteCompanyInput.tsx";
import { DealListViewContext } from "./DealListContent";
import {
  getCompanyTypeChoices,
  getDefaultDealStage,
  getSuggestedArr,
  resolvePrefilledArr,
} from "./dealUtils";
import type { Company, Sale } from "../types";

export const DealInputs = () => {
  const isMobile = useIsMobile();
  const { companyType: contextCompanyType } = useContext(DealListViewContext);
  const record = useRecordContext();
  const [companyTypeFilter, setCompanyTypeFilter] = useState(
    record?.company_type ?? contextCompanyType ?? "",
  );

  return (
    <div className="flex flex-col gap-8">
      <DealInfoInputs />

      <div className={`flex gap-6 ${isMobile ? "flex-col" : "flex-row"}`}>
        <DealLinkedToInputs
          companyTypeFilter={companyTypeFilter}
          onCompanyTypeFilterChange={setCompanyTypeFilter}
        />
        <Separator orientation={isMobile ? "horizontal" : "vertical"} />
        <DealMiscInputs />
      </div>
    </div>
  );
};

const DealInfoInputs = () => {
  return (
    <div className="flex flex-col gap-4 flex-1">
      <TextInput
        source="name"
        label="Nom de l'opportunité"
        validate={required()}
        helperText={false}
      />
      <TextInput source="description" multiline rows={3} helperText={false} />
    </div>
  );
};

const ALL_TYPES = "__all__";

const DealLinkedToInputs = ({
  companyTypeFilter,
  onCompanyTypeFilterChange,
}: {
  companyTypeFilter: string;
  onCompanyTypeFilterChange: (type: string) => void;
}) => {
  const { companyTypes, customViews } = useConfigurationContext();
  const companyTypeChoices = getCompanyTypeChoices(companyTypes, customViews);
  const { setValue, getValues } = useFormContext();

  // Initialise company_type au montage si pas encore défini (création)
  useEffect(() => {
    if (!getValues("company_type") && companyTypeFilter) {
      setValue("company_type", companyTypeFilter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTypeChange = (newType: string) => {
    const type = newType === ALL_TYPES ? "" : newType;
    onCompanyTypeFilterChange(type);
    setValue("company_type", type || null);
  };

  return (
    <div className="flex flex-col gap-4 flex-1">
      <h3 className="text-base font-medium">Lié à</h3>

      <div className="space-y-1">
        <label className="text-sm font-medium">Vue</label>
        <Select
          value={companyTypeFilter || ALL_TYPES}
          onValueChange={handleTypeChange}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TYPES}>Toutes les vues</SelectItem>
            {companyTypeChoices.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ReferenceInput source="company_id" reference="companies">
        <AutocompleteCompanyInput
          validate={required()}
          defaultType={companyTypeFilter || undefined}
        />
      </ReferenceInput>

      <ReferenceArrayInput source="contact_ids" reference="contacts_summary">
        <AutocompleteArrayInput
          label="Contacts associés"
          optionText={contactOptionText}
          helperText={false}
        />
      </ReferenceArrayInput>
    </div>
  );
};

const saleOptionRenderer = (choice: Sale) =>
  `${choice.first_name} ${choice.last_name}`;

const DealSalesInput = () => {
  const { canAccess: isAdmin } = useCanAccess({
    resource: "configuration",
    action: "edit",
  });

  if (!isAdmin) return null;

  return (
    <ReferenceInput
      source="sales_id"
      reference="sales"
      filter={{ "disabled@neq": true }}
    >
      <SelectInput
        label="Responsable commercial"
        helperText={false}
        optionText={saleOptionRenderer}
      />
    </ReferenceInput>
  );
};

const DealMiscInputs = () => {
  const { dealStages, dealCategories, dealPriorities, leadSources } =
    useConfigurationContext();
  const { initialVisibleStages } = useContext(DealListViewContext);
  const defaultStage = getDefaultDealStage(dealStages, initialVisibleStages);

  return (
    <div className="flex flex-col gap-4 flex-1">
      <h3 className="text-base font-medium">Divers</h3>

      <SelectInput
        source="category"
        label="Catégorie"
        choices={dealCategories}
        optionText="label"
        optionValue="value"
        helperText={false}
      />
      <SelectInput
        source="priority"
        label="Priorité"
        choices={dealPriorities}
        optionText="label"
        optionValue="value"
        defaultValue={defaultDealPriority}
        helperText={false}
      />
      <DealArrInput />
      <SelectInput
        source="lead_source"
        label="Source du lead"
        choices={leadSources}
        optionText="label"
        optionValue="value"
        helperText={false}
      />
      <DateInput
        validate={required()}
        source="expected_closing_date"
        label="Date de clôture prévue"
        helperText={false}
        defaultValue={new Date().toISOString().split("T")[0]}
      />
      <DateInput
        source="entered_at"
        label="Date d'entrée"
        helperText={false}
        defaultValue={new Date().toISOString().split("T")[0]}
      />
      <DateInput source="won_at" label="Date de signature" helperText={false} />
      <DateInput
        source="trial_start_date"
        label="Début du trial"
        helperText={false}
      />
      <SelectInput
        source="stage"
        label="Étape"
        choices={dealStages}
        optionText="label"
        optionValue="value"
        defaultValue={defaultStage}
        helperText={false}
        validate={required()}
      />
      <DealSalesInput />
      <DealReferrerInput />
    </div>
  );
};

/**
 * ARR input with the establishment-type prefill (NOS-810/811/812).
 *
 * The suggestion only ever fills a blank amount. Editing the field by hand
 * marks the value as manual, which permanently locks it against later
 * suggestions — including those triggered by changing company or category.
 *
 * Manual entry is detected through react-hook-form's dirty tracking rather
 * than an `onChange` prop: <NumberInput> omits `onChange` from its props and
 * overrides it with its own handler, so a handler passed in is silently
 * dropped. The prefill below writes with `shouldDirty: false` precisely so
 * that "dirty" keeps meaning "a human touched this".
 */
const DealArrInput = () => {
  const { currency, establishmentTypes } = useConfigurationContext();
  const { setValue, getValues } = useFormContext();
  const { dirtyFields } = useFormState({ name: "amount" });
  const companyId = useWatch({ name: "company_id" });
  const isManual = useWatch({ name: "arr_is_manual" });
  const { data: company } = useGetOne<Company>(
    "companies",
    { id: companyId },
    { enabled: companyId != null },
  );

  const suggestedArr = getSuggestedArr(
    company?.establishment_type,
    establishmentTypes,
  );

  useEffect(() => {
    const { arr, changed } = resolvePrefilledArr({
      currentArr: getValues("amount"),
      isManual: getValues("arr_is_manual"),
      suggestedArr,
    });
    if (changed) {
      // Not dirty and not manual: this is a suggestion, so a better one may
      // still replace it until someone types a value.
      setValue("amount", arr, { shouldDirty: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedArr]);

  const amountIsDirty = !!dirtyFields.amount;
  useEffect(() => {
    if (amountIsDirty && !getValues("arr_is_manual")) {
      setValue("arr_is_manual", true, { shouldDirty: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountIsDirty]);

  const suggestionLabel =
    suggestedArr != null && !isManual
      ? `Proposé d'après le type d'établissement : ${formatCurrency(suggestedArr, currency)}`
      : false;

  return (
    <div className="space-y-1">
      <NumberInput
        source="amount"
        label={`ARR annuel (${currencySymbol(currency)})`}
        defaultValue={0}
        validate={required()}
        helperText={suggestionLabel}
      />
      {isManual ? (
        <p className="text-xs text-muted-foreground">
          Valeur saisie manuellement — elle ne sera jamais écrasée par le
          préremplissage.
        </p>
      ) : null}
      <MrrPreview currency={currency} />
    </div>
  );
};

/** Read-only echo of the MRR the database will store for this ARR. */
const MrrPreview = ({ currency }: { currency: string }) => {
  const amount = useWatch({ name: "amount" });
  const mrr = arrToMrr(typeof amount === "number" ? amount : Number(amount));
  if (mrr == null) return null;
  return (
    <p className="text-xs text-muted-foreground">
      MRR calculé :{" "}
      {formatCurrency(mrr, currency, { maximumFractionDigits: 2 })}
    </p>
  );
};

/** Who brought the lead in — distinct from the owner (NOS-804). */
const DealReferrerInput = () => (
  <ReferenceInput
    source="referrer_id"
    reference="sales"
    filter={{ "disabled@neq": true }}
  >
    <SelectInput
      label="Apporteur"
      helperText="Qui a amené le lead, si différent du responsable"
      optionText={saleOptionRenderer}
    />
  </ReferenceInput>
);
