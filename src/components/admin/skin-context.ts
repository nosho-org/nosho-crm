import { createContext } from "react";

/**
 * A skin is a named UI variant: a block of CSS variables in `src/index.css`
 * plus, where tokens are not enough, a layout variant inside a component.
 * The value is a plain string here so this layer stays free of app domain
 * knowledge — the catalogue of skins lives in the application code.
 */
export type Skin = string;

/**
 * The skin whose tokens are the `:root` block itself — it sets no `data-skin`
 * attribute. This is the baseline every other skin overrides, NOT necessarily
 * the one a user gets before choosing: that is the provider's `defaultSkin`.
 */
export const BASE_SKIN: Skin = "default";

export type SkinProviderState = {
  skin: Skin;
  setSkin: (skin: Skin) => void;
};

const initialState: SkinProviderState = {
  skin: BASE_SKIN,
  setSkin: () => null,
};

export const SkinProviderContext =
  createContext<SkinProviderState>(initialState);
