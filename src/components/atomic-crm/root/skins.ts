import { useSkin } from "@/components/admin/use-skin";

/**
 * The UI variants a user can pick in Paramètres › Apparence.
 *
 * A skin is mostly a block of CSS variables in `src/index.css` — background,
 * radii, borders, elevation — so most of the app follows without a single
 * component knowing about it. Where a direction changes *structure* rather
 * than surface (how the Opportunités cockpit groups its figures), the
 * component branches on `useCrmSkin()` and renders a layout variant.
 */
export const SKINS = [
  {
    value: "default",
    label: "Actuel",
    description:
      "Le design en place : six tuiles de mesures, alerte d'inactivité en bandeau.",
  },
  {
    value: "dense",
    label: "Cockpit dense",
    description:
      "Chiffres regroupés par intention sur une seule surface, filets au lieu d'ombres, listes tabulaires. Un maximum d'information par écran.",
  },
  {
    value: "calme",
    label: "Surfaces calmes",
    description:
      "Trois panneaux, un chiffre dominant chacun. Fond ivoire, angles arrondis, ombres douces, sans bordures. Plus lisible, moins dense.",
  },
] as const;

export type CrmSkin = (typeof SKINS)[number]["value"];

export const isCrmSkin = (value: string): value is CrmSkin =>
  SKINS.some((skin) => skin.value === value);

/**
 * The active skin, narrowed to one this build knows about — a value left in
 * the store by an older build (or a hand-edited localStorage) falls back to
 * the base skin rather than rendering nothing.
 */
export const useCrmSkin = (): CrmSkin => {
  const { skin } = useSkin();
  return isCrmSkin(skin) ? skin : "default";
};
