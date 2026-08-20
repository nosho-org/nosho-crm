import { useState, type Dispatch, type SetStateAction } from "react";
import type { RegisterSWOptions } from "vite-plugin-pwa/types";

/**
 * Test stub for `virtual:pwa-register/react`.
 *
 * That module is generated at build time by `vite-plugin-pwa`, which only runs
 * through `vite.config.ts`. The Vitest browser config neither loads that plugin
 * nor registers a service worker, so the import is unresolvable there and every
 * test transitively pulling in `<CRM>` dies with
 * "Failed to resolve import virtual:pwa-register/react".
 *
 * `vitest.config.ts` aliases the virtual module to this file. The shape mirrors
 * the real hook so `useVersionCheck` keeps working unchanged; only the
 * service-worker registration is inert. `onRegisteredSW` is deliberately never
 * invoked — that is the same branch production takes when no service worker is
 * available, and it keeps the update-poll interval out of the test run.
 */
export function useRegisterSW(_options: RegisterSWOptions = {}): {
  needRefresh: [boolean, Dispatch<SetStateAction<boolean>>];
  offlineReady: [boolean, Dispatch<SetStateAction<boolean>>];
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
} {
  const needRefresh = useState(false);
  const offlineReady = useState(false);

  return {
    needRefresh,
    offlineReady,
    updateServiceWorker: async () => {},
  };
}
