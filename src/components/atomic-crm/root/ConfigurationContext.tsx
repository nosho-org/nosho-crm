import { useCallback, useMemo } from "react";
import { useStore } from "ra-core";

import type {
  CompanyType,
  DealPriority,
  DealStage,
  EstablishmentType,
  LabeledValue,
  NoteStatus,
} from "../types";
import { defaultConfiguration } from "./defaultConfiguration";

export const CONFIGURATION_STORE_KEY = "app.configuration";

export interface CustomView {
  id: string;
  label: string;
  companyType: string;
  visibleStages?: string[];
  /** Sales IDs allowed to see this view. undefined or [] = all users. */
  allowedUserIds?: number[];
}

export interface ConfigurationContextValue {
  companySectors: LabeledValue[];
  companyTypes: CompanyType[];
  currency: string;
  customViews: CustomView[];
  dealCategories: LabeledValue[];
  /** Décideur / Influenceur / Opérationnel — set per deal↔contact relation. */
  dealContactRoles: LabeledValue[];
  /** Nouveau client / Extension / Renouvellement — set per deal. */
  dealOpportunityTypes: LabeledValue[];
  dealPipelineStatuses: string[];
  dealPriorities: DealPriority[];
  dealStages: DealStage[];
  establishmentTypes: EstablishmentType[];
  leadSources: LabeledValue[];
  /**
   * Days without activity before an open deal is flagged as dormant on the
   * Opportunités screen (issue #94).
   */
  dealInactivityAlertDays: number;
  /**
   * Win probability per deal stage, in percent, used to weight the revenue
   * forecast. Empty by default: the cockpit reports weighted revenue as
   * unavailable rather than inventing a rate. This is a forecast input and has
   * nothing to do with commercial priority.
   */
  dealStageProbabilities: Record<string, number>;
  /** First stage at which a next action is expected (issue #92). */
  dealNextActionFromStage: string;
  noteStatuses: NoteStatus[];
  taskTypes: LabeledValue[];
  title: string;
  darkModeLogo: string;
  lightModeLogo: string;
  googleWorkplaceDomain?: string;
  disableEmailPasswordAuthentication?: boolean;
  dropcontactApiKey?: string;
  alloApiKey?: string;
}

export const useConfigurationContext = () => {
  const [config] = useStore<ConfigurationContextValue>(
    CONFIGURATION_STORE_KEY,
    defaultConfiguration,
  );
  // Merge with defaults so that missing fields in stored config
  // fall back to default values (e.g. when new settings are added)
  return useMemo(() => ({ ...defaultConfiguration, ...config }), [config]);
};

export const useConfigurationUpdater = () => {
  const [, setConfig] = useStore<ConfigurationContextValue>(
    CONFIGURATION_STORE_KEY,
  );
  return setConfig;
};

/**
 * Hook to read/write only the `customViews` field in the store.
 * Uses the raw stored config (not merged with defaults) to avoid
 * creating new references for unrelated fields (companySectors, dealStages…)
 * which would cause SettingsForm's defaultValues to change and reset the form.
 */
export const useCustomViewsStore = (): [
  CustomView[],
  (views: CustomView[]) => void,
] => {
  const [storedConfig, setStoredConfig] = useStore<
    Partial<ConfigurationContextValue>
  >(CONFIGURATION_STORE_KEY, {});
  const setCustomViews = useCallback(
    (views: CustomView[]) => {
      setStoredConfig({ ...storedConfig, customViews: views });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storedConfig],
  );
  return [
    storedConfig.customViews ?? defaultConfiguration.customViews,
    setCustomViews,
  ];
};

/**
 * Same narrow-write trick as {@link useCustomViewsStore}, for `companyTypes`.
 * Used by the commercial/non-commercial toggle, which lives outside the
 * settings form and must not reset it.
 */
export const useCompanyTypesStore = (): [
  CompanyType[],
  (types: CompanyType[]) => void,
] => {
  const [storedConfig, setStoredConfig] = useStore<
    Partial<ConfigurationContextValue>
  >(CONFIGURATION_STORE_KEY, {});
  const setCompanyTypes = useCallback(
    (types: CompanyType[]) => {
      setStoredConfig({ ...storedConfig, companyTypes: types });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storedConfig],
  );
  return [
    storedConfig.companyTypes ?? defaultConfiguration.companyTypes,
    setCompanyTypes,
  ];
};
