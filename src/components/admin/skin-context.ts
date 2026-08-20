import { createContext } from "react";

/**
 * A skin is a named UI variant: a block of CSS variables in `src/index.css`
 * plus, where tokens are not enough, a layout variant inside a component.
 * The value is a plain string here so this layer stays free of app domain
 * knowledge — the catalogue of skins lives in the application code.
 */
export type Skin = string;

/** The skin that ships with the app; it sets no `data-skin` attribute. */
export const DEFAULT_SKIN: Skin = "default";

export type SkinProviderState = {
  skin: Skin;
  setSkin: (skin: Skin) => void;
};

const initialState: SkinProviderState = {
  skin: DEFAULT_SKIN,
  setSkin: () => null,
};

export const SkinProviderContext =
  createContext<SkinProviderState>(initialState);
