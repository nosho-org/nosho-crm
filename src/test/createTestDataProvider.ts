import { withLifecycleCallbacks } from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";

import { dataProvider as demoDataProvider } from "@/components/atomic-crm/providers/fakerest";
import { crmLifecycleCallbacks } from "@/components/atomic-crm/providers/fakerest/dataProvider";
import type { Db } from "@/components/atomic-crm/providers/fakerest/dataGenerator/types";
import { withSupabaseFilterAdapter } from "@/components/atomic-crm/providers/fakerest/internal/supabaseAdapter";
import type { ConfigurationContextValue } from "@/components/atomic-crm/root/ConfigurationContext";
import type { CrmDataProvider } from "@/components/atomic-crm/providers/types";

/**
 * Builds a CrmDataProvider backed by a caller-supplied database, so each test
 * gets its own isolated records instead of the shared generated demo dataset.
 *
 * The demo provider is spread in first to supply the CRM-specific methods
 * (unarchiveDeal, salesCreate, getActivityLog, …). Those still read the demo
 * dataset, not `db` — they are closed over module-level state in the provider
 * and re-implementing them here would fork production logic. Any test that
 * needs one should stub it through StoryWrapper's `dataProvider` prop.
 *
 * The standard CRUD methods and the configuration accessors below are the ones
 * that matter for rendering, and those are bound to `db`. They also run the
 * production lifecycle callbacks, so side effects the UI relies on — creating a
 * task bumping the contact's nb_tasks, for one — behave as they do in the app.
 */
export const createTestDataProvider = ({
  db,
  silent = true,
}: {
  db: Db;
  silent?: boolean;
}): CrmDataProvider => {
  // delay: 0 — tests await their own assertions, an artificial latency only
  // makes them slower and flakier.
  const base = withLifecycleCallbacks(
    withSupabaseFilterAdapter(fakeRestDataProvider(db, !silent, 0)),
    crmLifecycleCallbacks,
  );

  return {
    ...demoDataProvider,
    ...base,
    getConfiguration: async (): Promise<ConfigurationContextValue> => {
      const { data } = await base.getOne("configuration", { id: 1 });
      return (data?.config as ConfigurationContextValue) ?? {};
    },
    updateConfiguration: async (
      config: ConfigurationContextValue,
    ): Promise<ConfigurationContextValue> => {
      const { data: previousData } = await base.getOne("configuration", {
        id: 1,
      });
      await base.update("configuration", {
        id: 1,
        data: { config },
        previousData,
      });
      return config;
    },
  };
};
