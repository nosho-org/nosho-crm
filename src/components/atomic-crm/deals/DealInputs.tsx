import { useContext, useEffect, useMemo, useState } from "react";
import { isEqual } from "lodash";
import {
  required,
  useCanAccess,
  useGetMany,
  useGetOne,
  useRecordContext,
  type Identifier,
} from "ra-core";
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
  getContactRole,
  sanitizeContactRoles,
  setContactRole,
} from "./dealContactRoles";
import {
  getCompanyTypeChoices,
  getDefaultDealStage,
  getSuggestedArr,
  resolvePrefilledArr,
} from "./dealUtils";
import type { Company, Contact, DealContactRoles, Sale } from "../types";

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

      <DealContactRolesInput />
    </div>
  );
};

const NO_ROLE = "__none__";

/**
 * Per-contact decision-making role (issue #99).
 *
 * The role belongs to the deal↔contact relation, so it is edited here — inside
 * the opportunity form — and never on the contact record. Roles are stored in
 * `deals.contact_roles` as a `{ "<contact_id>": "<role>" }` map, and pruned as
 * soon as a contact is unlinked so no orphan role survives.
 */
const DealContactRolesInput = () => {
  const { dealContactRoles } = useConfigurationContext();
  const { setValue } = useFormContext();
  const watchedContactIds = useWatch({ name: "contact_ids" });
  const watchedContactRoles = useWatch({ name: "contact_roles" });

  // Memoised so the `?? []` / `?? {}` fallbacks don't produce a fresh reference
  // on every render and re-run the pruning effect for nothing.
  const contactIds = useMemo(
    () => (watchedContactIds ?? []) as Identifier[],
    [watchedContactIds],
  );
  const contactRoles = useMemo(
    () => (watchedContactRoles ?? {}) as DealContactRoles,
    [watchedContactRoles],
  );

  const { data: contacts } = useGetMany<Contact>(
    "contacts_summary",
    { ids: contactIds },
    { enabled: contactIds.length > 0 },
  );

  // Unlinking a contact must not leave its role behind.
  useEffect(() => {
    const pruned = sanitizeContactRoles(contactRoles, contactIds);
    if (!isEqual(pruned, contactRoles)) {
      setValue("contact_roles", pruned, { shouldDirty: true });
    }
  }, [contactIds, contactRoles, setValue]);

  if (contactIds.length === 0) return null;

  const handleRoleChange = (contactId: Identifier, value: string) => {
    setValue(
      "contact_roles",
      setContactRole(contactRoles, contactId, value === NO_ROLE ? null : value),
      { shouldDirty: true },
    );
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Rôle dans la décision</label>
      <div className="flex flex-col gap-2">
        {contactIds.map((contactId) => {
          const contact = contacts?.find((c) => c.id === contactId);
          const contactName =
            [contact?.first_name, contact?.last_name]
              .filter(Boolean)
              .join(" ")
              .trim() || `#${contactId}`;
          return (
            <div key={String(contactId)} className="flex items-center gap-2">
              <span
                className="text-sm flex-1 min-w-0 truncate"
                title={contactName}
              >
                {contactName}
              </span>
              <Select
                value={getContactRole(contactRoles, contactId) ?? NO_ROLE}
                onValueChange={(value) => handleRoleChange(contactId, value)}
              >
                <SelectTrigger
                  className="w-44"
                  aria-label={`Rôle de ${contactName} dans la décision`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ROLE}>Non défini</SelectItem>
                  {dealContactRoles.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>
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
  const {
    dealStages,
    dealCategories,
    dealOpportunityTypes,
    dealPriorities,
    leadSources,
  } = useConfigurationContext();
  const { initialVisibleStages } = useContext(DealListViewContext);
  const defaultStage = getDefaultDealStage(dealStages, initialVisibleStages);

  return (
    <div className="flex flex-col gap-4 flex-1">
      <h3 className="text-base font-medium">Divers</h3>

      {/* Issue #95 — growth source of this opportunity. Distinct from the
          "Vue" select above, which only routes the deal to a pipeline view. */}
      <SelectInput
        source="opportunity_type"
        label="Type d'opportunité"
        choices={dealOpportunityTypes}
        optionText="label"
        optionValue="value"
        helperText={false}
      />
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
