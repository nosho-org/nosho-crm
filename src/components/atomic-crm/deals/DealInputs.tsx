import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { isEqual } from "lodash";
import {
  required,
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
import { ContactCreateSuggestion } from "../contacts/ContactCreateSuggestion";
import { DealListViewContext } from "./DealListContent";
import {
  getContactRole,
  sanitizeContactRoles,
  setContactRole,
} from "./dealContactRoles";
import {
  getDefaultDealStage,
  getSuggestedArr,
  resolvePrefilledArr,
  PARTNERSHIP_OPPORTUNITY_TYPE,
  PARTNER_DEAL_CATEGORY,
} from "./dealUtils";
import { companyIsIdentified, stageRequiresSiret } from "./dealStageGuard";
import type { Company, Contact, DealContactRoles, Sale } from "../types";
import {
  deciderNom,
  JAMAIS_VU,
  type EtatPrecedent,
} from "./dealAutoName";

export type DealFormMode = "create" | "edit";

/**
 * Marks the fields an opportunity cannot be *created* without (issue #122):
 * type d'opportunité, produit(s), catégorie, priorité, source du lead and
 * responsable. ARR, étape, nom et société were already mandatory in both
 * modes and stay declared at their own input.
 *
 * Creation only, deliberately. Production holds 219 open opportunities, and
 * 198 of them carry no lead source, 181 no type and 180 no product: applying
 * the same rule to the edit form would put a six-field wall in front of anyone
 * who just wanted to correct a closing date on a deal that predates the v2
 * model. New opportunities are held to the standard; the backlog gets cleaned
 * up on its own schedule.
 *
 * `required()` is memoised by ra-core, so this returns the same validator
 * instance on every render and never re-registers the field.
 */
const requiredOnCreate = (mode: DealFormMode) =>
  mode === "create" ? required() : undefined;

/**
 * L'ordre des champs, tel que Simon l'a dicté (NOS-1208).
 *
 * « dans l'ordre sur cette page tu mets les champs suivants : type
 * d'opportunité, catégorie, contacts associés, produits, priorité, ARR, étape,
 * responsable, apporteur, date d'entrée tu conserves mais tu la caches ».
 *
 * Une seule colonne pour ces champs-là : sur deux colonnes, le regard passerait
 * de la première à la seconde au milieu de la liste, et l'ordre demandé ne se
 * lirait plus. Le reste — ce qu'il n'a pas nommé — suit sous un séparateur, en
 * deux colonnes pour ne pas allonger la fenêtre.
 */
export const DealInputs = ({ mode = "edit" }: { mode?: DealFormMode }) => {
  const isMobile = useIsMobile();
  const { companyType: contextCompanyType } = useContext(DealListViewContext);
  const record = useRecordContext();
  // Plus de setter depuis que « Vue » a disparu : la valeur vient de la
  // fiche ou de la vue courante, et ne change plus en cours de saisie.
  const [companyTypeFilter] = useState(
    record?.company_type ?? contextCompanyType ?? "",
  );

  return (
    <div className="flex flex-col gap-8">
      <DealMainInputs mode={mode} companyTypeFilter={companyTypeFilter} />
      <Separator />
      <DealSecondaryInputs mode={mode} isMobile={isMobile} />
    </div>
  );
};

/**
 * Le nom de l'opportunité, repris de la société (NOS-1201, NOS-1208).
 *
 * Simon : « supprime le champ nom de l'opportunité, il sert à rien, tu
 * reprends automatiquement le nom de la société ».
 *
 * Le champ n'existe plus à l'écran, et `deals.name` est `not null` : ce hook
 * est donc le seul chemin qui remplit la colonne. La décision — écrire ou
 * non — vit dans `deciderNom`, testée à part, parce que la version qui
 * dormait ici portait un défaut qu'aucun test ne pouvait voir : `undefined`
 * servait à la fois de « jamais vu » et de « aucune société choisie », si
 * bien que le premier choix passait pour un montage et ne remplissait rien.
 *
 * `shouldDirty: false` pour que « dirty » continue de vouloir dire « un
 * humain y a touché ». Même convention que `DealArrInput` (NOS-810).
 *
 * Les DEUX modes sont concernés depuis que le champ a disparu : sans cela,
 * changer la société d'une opportunité existante laisserait l'ancien nom, et
 * plus rien ne permettrait de le corriger.
 */
const useNameFromCompany = () => {
  const { setValue, getValues } = useFormContext();
  const { dirtyFields } = useFormState({ name: "name" });
  const companyId = useWatch({ name: "company_id" });
  const precedent = useRef<EtatPrecedent>(JAMAIS_VU);

  const { data: company } = useGetOne<Company>(
    "companies",
    { id: companyId },
    { enabled: companyId != null },
  );

  useEffect(() => {
    const decision = deciderNom({
      precedent: precedent.current,
      societeId: companyId,
      nomSociete: company?.name,
      nomActuel: getValues("name"),
      nomTouche: !!dirtyFields.name,
    });
    precedent.current = decision.societeVue;
    if (decision.nom == null) return;
    setValue("name", decision.nom, { shouldDirty: false });
  }, [companyId, company, dirtyFields.name, setValue, getValues]);
};
/**
 * Les champs que Simon a nommés, dans son ordre.
 *
 * Ce composant réunit ce qui vivait dans « Lié à » et « Divers ». Les deux
 * titres ont disparu avec les colonnes : ils rangeaient les champs par origine
 * technique — la relation d'un côté, le reste de l'autre — et non par l'ordre
 * dans lequel on remplit le formulaire.
 */
/**
 * `companyTypeFilter` survit sans son sélecteur (NOS-1211).
 *
 * Simon : « supprime le champ Vue, car inutile ». Le select écrivait
 * `deals.company_type`, mais cette valeur est déjà posée par la vue depuis
 * laquelle on crée — `DealCreate` la seede depuis `DealListViewContext`.
 * La redemander revenait à faire ressaisir ce que l'écran savait déjà.
 *
 * Le filtre reste donc utile en lecture : il restreint la liste des
 * sociétés proposées et sert de type par défaut à celle qu'on crée à la
 * volée. C'est sa seule raison d'être ici désormais.
 */
const DealMainInputs = ({
  mode,
  companyTypeFilter,
}: {
  mode: DealFormMode;
  companyTypeFilter: string;
}) => {
  const {
    dealStages,
    dealCategories,
    dealOpportunityTypes,
    dealPriorities,
    dealProducts,
  } = useConfigurationContext();
  const { initialVisibleStages } = useContext(DealListViewContext);
  const defaultStage = getDefaultDealStage(dealStages, initialVisibleStages);
  const { setValue, getValues } = useFormContext();
  // Société déjà choisie sur l'opportunité : elle préremplit le contact créé à
  // la volée, pour ne pas la ressaisir (NOS-1048).
  const companyId = useWatch({ name: "company_id" });

  useNameFromCompany();

  // Initialise company_type au montage si pas encore défini (création)
  useEffect(() => {
    if (!getValues("company_type") && companyTypeFilter) {
      setValue("company_type", companyTypeFilter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {/*
        La société d'abord : c'est elle qui nomme l'opportunité, et un champ
        qui en alimente un autre doit le précéder (NOS-1201).
      */}
      <ReferenceInput source="company_id" reference="companies">
        <AutocompleteCompanyInput
          label="Société"
          validate={required()}
          defaultType={companyTypeFilter || undefined}
          richCreate
        />
      </ReferenceInput>

      {/* Issue #95 — growth source of this opportunity. Distinct from the
          "Vue" select above, which only routes the deal to a pipeline view. */}
      <DealOpportunityTypeInput choices={dealOpportunityTypes} mode={mode} />

      <SelectInput
        source="category"
        label="Catégorie"
        choices={dealCategories}
        optionText="label"
        optionValue="value"
        helperText={false}
        validate={requiredOnCreate(mode)}
      />

      {/*
       * `reference` reste `contacts_summary` : c'est la vue qui porte
       * `company_name`, dont `contactOptionText` a besoin, et c'est elle que
       * `getMany` interroge pour résoudre les puces déjà sélectionnées. La
       * création, elle, écrit sur la table `contacts` — c'est
       * `ContactCreateSuggestion` qui s'en charge (NOS-1048).
       */}
      <ReferenceArrayInput source="contact_ids" reference="contacts_summary">
        <AutocompleteArrayInput
          label="Contacts associés"
          optionText={contactOptionText}
          helperText={false}
          createItemLabel="Créer le contact « %{item} »"
          create={<ContactCreateSuggestion companyId={companyId} />}
        />
      </ReferenceArrayInput>
      {/* Les rôles ne listent que les contacts choisis juste au-dessus : les
          séparer les laisserait sans référent. */}
      <DealContactRolesInput />

      {/* Products (NOS-956). Multi-select: a deal can cover No-show, Entrant
          and Data at once. Stored in `deals.products` as a text[]. */}
      <AutocompleteArrayInput
        source="products"
        label="Produit(s)"
        choices={dealProducts}
        optionText="label"
        optionValue="value"
        helperText={false}
        validate={requiredOnCreate(mode)}
      />

      <SelectInput
        source="priority"
        label="Priorité"
        choices={dealPriorities}
        optionText="label"
        optionValue="value"
        defaultValue={defaultDealPriority}
        helperText={false}
        validate={requiredOnCreate(mode)}
      />

      <DealArrInput />
      <DealStageInput choices={dealStages} defaultStage={defaultStage} />
      <DealSalesInput mode={mode} />
      <DealReferrerInput />

      {/*
       * La date d'entrée, conservée mais masquée (NOS-1208).
       *
       * Simon : « date d'entrée tu conserves mais tu la caches ». Elle date
       * l'arrivée dans le pipeline et sert aux calculs d'ancienneté ; ce qui
       * ne se justifiait plus, c'est de la faire saisir alors qu'elle vaut
       * « aujourd'hui » à chaque création.
       *
       * Masquée en CSS plutôt que retirée : l'input reste monté, donc son
       * `defaultValue` continue de remplir la colonne. Le sortir du JSX la
       * laisserait vide.
       */}
      <div className="hidden" aria-hidden>
        <DateInput
          source="entered_at"
          label="Date d'entrée"
          helperText={false}
          defaultValue={new Date().toISOString().split("T")[0]}
        />
      </div>
    </div>
  );
};

/**
 * Ce que Simon n'a pas nommé, et qui reste néanmoins nécessaire.
 *
 * Sa liste couvre ce qu'on remplit à chaque création. Ces champs-là servent
 * moins souvent — mais « date de clôture prévue » est obligatoire, la source du
 * lead alimente les statistiques d'acquisition, et la probabilité
 * exceptionnelle est le seul moyen de sortir une affaire de la pondération de
 * son étape. Les supprimer serait un retrait de fonctionnalité qu'il n'a pas
 * demandé ; les reléguer ici suffit à dégager le haut du formulaire.
 */
const DealSecondaryInputs = ({
  mode,
  isMobile,
}: {
  mode: DealFormMode;
  isMobile: boolean;
}) => {
  const { leadSources } = useConfigurationContext();

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-base font-medium">Autres informations</h3>

      <div className={`grid gap-4 ${isMobile ? "grid-cols-1" : "grid-cols-2"}`}>
        {/*
         * Pas de `defaultValue` ici (NOS-1014). Le défaut vit dans
         * `<DealCreate>`, au niveau du formulaire, pour qu'il ne s'applique
         * qu'à la création : posé sur l'input, il remplirait aussi le champ à
         * l'ouverture d'une opportunité existante qui n'a pas de date, et
         * l'écrirait au premier enregistrement sans que personne ne l'ait
         * décidé.
         */}
        <DateInput
          validate={required()}
          source="expected_closing_date"
          label="Date de clôture prévue"
          helperText={false}
        />
        <SelectInput
          source="lead_source"
          label="Source du lead"
          choices={leadSources}
          optionText="label"
          optionValue="value"
          helperText={false}
          validate={requiredOnCreate(mode)}
        />
        <DateInput
          source="won_at"
          label="Date de signature"
          helperText={false}
        />
        {/*
         * « POC » et non « trial » : c'est le vocabulaire du pipeline, dont
         * l'étape s'appelle « Démo / POC ». La colonne, elle, reste
         * `trial_start_date` — la renommer pour du wording imposerait une
         * migration et toucherait six emplacements dont le trigger d'audit,
         * sans rien apporter (NOS-1049).
         */}
        <DateInput
          source="trial_start_date"
          label="Début du POC"
          helperText={false}
        />
        {/*
         * Probabilité exceptionnelle (NOS-817).
         *
         * Laissée vide, l'opportunité est pondérée par la probabilité de son
         * étape, configurée dans les Paramètres. Une valeur ici la remplace
         * pour cette seule opportunité — le cockpit marque alors la ligne
         * « exc. » pour qu'on sache d'où vient le pourcentage affiché.
         *
         * Surtout pas de `defaultValue` : 0 n'est pas « pas de probabilité »,
         * c'est « aucune chance », et poser l'un pour l'autre sortirait toute
         * opportunité neuve des prévisions. La colonne est nullable exactement
         * pour cette raison (20260823090000).
         */}
        <NumberInput
          source="probability"
          label="Probabilité exceptionnelle (%)"
          min={0}
          max={100}
          step={5}
          helperText="Laisser vide pour utiliser la probabilité de l'étape"
        />
      </div>

      <TextInput source="description" multiline rows={3} helperText={false} />
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

/**
 * Owner picker, open to everyone (NOS-1046).
 *
 * It used to be gated behind `canAccess({ resource: "configuration" })`, i.e.
 * admins only, and gated by an early `return null` rather than a `disabled` —
 * so a non-admin could not even *see* who owned an opportunity from the form.
 *
 * That gate had exactly one victim. In production every active user carries the
 * admin flag except Marc-Henri, who owns 40 opportunities: the one person unable
 * to hand an affair over was also the one running them. Transferring is ordinary
 * commercial work, not configuration — `referrer_id` right below has never been
 * restricted either.
 *
 * Two consequences of lifting it, both wanted:
 *   - `requiredOnCreate` now registers for everyone, so creation asks for an
 *     owner instead of silently defaulting. `<DealCreate>` still seeds the
 *     current identity, so the field arrives filled.
 *   - Saving a changed owner fires `deal_tasks_follow_owner` (NOS-1017), which
 *     moves the previous owner's open tasks along — but leaves alone anything
 *     deliberately assigned to a third party (NOS-1038).
 */
const DealSalesInput = ({ mode }: { mode: DealFormMode }) => {
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
        validate={requiredOnCreate(mode)}
      />
    </ReferenceInput>
  );
};

/**
 * Type d'opportunité, qui range l'affaire en « Partenaire » quand on choisit
 * « Partenariat » (NOS-1093).
 *
 * ---------------------------------------------------------------------------
 * Pourquoi une référence plutôt qu'un simple `useEffect` sur la valeur
 * ---------------------------------------------------------------------------
 * Un effet dont la dépendance est `opportunity_type` se déclenche aussi au
 * montage, donc à chaque ouverture d'une fiche existante. Une opportunité déjà
 * typée « Partenariat » mais rangée délibérément ailleurs se ferait réécrire à
 * chaque fois : l'utilisateur corrige la catégorie, rouvre la fiche, et
 * retrouve sa correction effacée — sans jamais comprendre d'où ça vient.
 *
 * La référence retient la valeur précédente et fait donc la différence entre
 * « c'était déjà ça » et « on vient de le choisir ». Seule la transition
 * déclenche l'écriture.
 *
 * `shouldDirty: true`, contrairement au préremplissage de l'ARR juste en
 * dessous : ici la catégorie est bien une conséquence d'un geste de
 * l'utilisateur, pas une suggestion qu'une meilleure pourrait remplacer. Elle
 * doit partir au prochain enregistrement.
 */
const DealOpportunityTypeInput = ({
  choices,
  mode,
}: {
  choices: { value: string; label: string }[];
  mode: DealFormMode;
}) => {
  const { setValue } = useFormContext();
  const opportunityType = useWatch({ name: "opportunity_type" });
  const previousType = useRef(opportunityType);

  useEffect(() => {
    const previous = previousType.current;
    previousType.current = opportunityType;
    if (previous === opportunityType) return;
    if (opportunityType !== PARTNERSHIP_OPPORTUNITY_TYPE) return;
    setValue("category", PARTNER_DEAL_CATEGORY, { shouldDirty: true });
  }, [opportunityType, setValue]);

  return (
    <SelectInput
      source="opportunity_type"
      label="Type d'opportunité"
      choices={choices}
      optionText="label"
      optionValue="value"
      helperText={false}
      validate={requiredOnCreate(mode)}
    />
  );
};

/**
 * L'étape, avec le contrôle SIRET à partir de Qualifié (NOS-1150).
 *
 * La validation vit sur ce champ plutôt que sur le formulaire entier : c'est
 * le champ fautif, et c'est là que l'utilisateur regarde. Un message global
 * l'obligerait à deviner lequel des quinze champs le refuse.
 *
 * Le SIRET est lu sur la société liée. Le champ `company_id` est surveillé,
 * pas seulement lu au montage : on peut changer de société dans le même
 * formulaire, et le contrôle doit suivre.
 */
const DealStageInput = ({
  choices,
  defaultStage,
}: {
  choices: { value: string; label: string }[];
  defaultStage?: string;
}) => {
  const companyId = useWatch({ name: "company_id" });
  const { data: company } = useGetOne<Company>(
    "companies",
    { id: companyId },
    { enabled: companyId != null },
  );

  const validateStage = (value: string) => {
    if (!stageRequiresSiret(value)) return undefined;
    if (companyIsIdentified(company)) return undefined;
    // La société n'est peut-être pas encore chargée : ne pas refuser sur une
    // absence de donnée qu'on n'a pas fini de lire.
    if (companyId != null && company === undefined) return undefined;
    return "SIRET de la société manquant — renseignez-le sur sa fiche (bouton « Enrichir ») avant de passer à cette étape.";
  };

  return (
    <SelectInput
      source="stage"
      label="Étape"
      choices={choices}
      optionText="label"
      optionValue="value"
      defaultValue={defaultStage}
      helperText={false}
      validate={[required(), validateStage]}
    />
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
