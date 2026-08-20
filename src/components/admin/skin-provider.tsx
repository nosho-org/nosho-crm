import { useEffect } from "react";
import { useStore } from "ra-core";

import { BASE_SKIN, SkinProviderContext, type Skin } from "./skin-context";

type SkinProviderProps = {
  children: React.ReactNode;
  /** What a user who has never chosen gets. See `DEFAULT_CRM_SKIN`. */
  defaultSkin?: Skin;
  storageKey?: string;
};

/**
 * Reflects the selected skin onto `<html data-skin="…">`, which is what the
 * `[data-skin="…"]` token blocks in `src/index.css` hook onto.
 *
 * The choice is stored per user in the ra-core store (localStorage), next to
 * the light/dark preference — it is a personal display setting, not shared
 * application configuration.
 *
 * @internal
 */
export function SkinProvider({
  children,
  defaultSkin = BASE_SKIN,
  storageKey = "skin",
  ...props
}: SkinProviderProps) {
  const [skin, setSkin] = useStore<Skin>(storageKey, defaultSkin);

  useEffect(() => {
    const root = window.document.documentElement;

    if (!skin || skin === BASE_SKIN) {
      delete root.dataset.skin;
      return;
    }

    root.dataset.skin = skin;
  }, [skin]);

  const value = {
    skin: skin ?? BASE_SKIN,
    setSkin,
  };

  return (
    <SkinProviderContext.Provider {...props} value={value}>
      {children}
    </SkinProviderContext.Provider>
  );
}
