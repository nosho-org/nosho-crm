import {
  Building2,
  Code,
  HeartPulse,
  Hospital,
  Network,
  Pill,
  Scan,
  Server,
  Sparkles,
  Stethoscope,
} from "lucide-react";
import type { ComponentType } from "react";

import { cn } from "@/lib/utils";

/**
 * Establishment typology pictograms (issue #97).
 *
 * The typology is `companies.sector` — *what kind of place this is*. It is
 * intentionally rendered in a neutral, monochrome style so it never competes
 * with the colour-coded commercial signals next to it (the note-status dot in
 * the Contacts list). Shape = typology, colour = commercial priority.
 *
 * Keys are the `value`s from `defaultCompanySectors`. Sectors can be renamed or
 * extended by admins in Settings, so anything unknown falls back to a generic
 * building rather than disappearing.
 */

/**
 * Tooth glyph for dental practices — lucide has no tooth icon, and the ticket
 * explicitly asks for 🦷. Drawn to match lucide's conventions (24×24 viewBox,
 * currentColor stroke, width 2, round caps) so it sits cleanly next to the
 * other icons.
 */
const Tooth: ComponentType<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 4.2c-2.4 0-3.4-1.2-5.4-1.2C4.2 3 2.8 4.8 2.8 7.3c0 2 .6 3.4 1.1 5 .5 1.4.8 3 .9 4.5.2 1.5.4 3 1.5 3 1.3 0 1.6-1.6 1.9-3.4.3-1.7.5-3.2 1.6-3.2s1.3 1.5 1.6 3.2c.3 1.8.6 3.4 1.9 3.4 1.1 0 1.3-1.5 1.5-3 .1-1.5.4-3.1.9-4.5.5-1.6 1.1-3 1.1-5 0-2.5-1.4-4.3-3.8-4.3-2 0-3 1.2-5.4 1.2Z" />
  </svg>
);

type Typology = {
  /** Icon component, rendered monochrome. */
  icon: ComponentType<{ className?: string }>;
  /** Short label, surfaced as the accessible name / tooltip. */
  label: string;
};

const TYPOLOGY_BY_SECTOR: Record<string, Typology> = {
  "cabinet-liberal": { icon: Stethoscope, label: "Cabinet libéral" },
  "dentiste-orthodontiste": { icon: Tooth, label: "Dentiste / Orthodontiste" },
  "hopital-clinique": { icon: Hospital, label: "Hôpital / Clinique" },
  "radiologie-imagerie": { icon: Scan, label: "Radiologie / Imagerie" },
  "centre-sante": { icon: HeartPulse, label: "Centre de santé" },
  "groupement-sante": { icon: Network, label: "Groupement de santé" },
  "editeur-logiciel": { icon: Code, label: "Éditeur de logiciel" },
  "integrateur-esn": { icon: Server, label: "Intégrateur / ESN" },
  pharmacie: { icon: Pill, label: "Pharmacie" },
  "centre-esthetique": { icon: Sparkles, label: "Centre esthétique" },
  autre: { icon: Building2, label: "Autre" },
};

const FALLBACK: Typology = { icon: Building2, label: "Établissement" };

// The icons are React components, so the lookup table has to live in a .tsx
// file next to the component that renders it.
// eslint-disable-next-line react-refresh/only-export-components
export const getCompanyTypology = (sector?: string | null): Typology =>
  (sector ? TYPOLOGY_BY_SECTOR[sector] : undefined) ?? FALLBACK;

/**
 * Renders the typology pictogram for a company sector.
 *
 * @param sector    `companies.sector` value.
 * @param label     Human-readable sector label from the configuration; falls
 *                  back to the built-in label when the sector is unknown.
 */
export const CompanyTypologyIcon = ({
  sector,
  label,
  className,
}: {
  sector?: string | null;
  label?: string;
  className?: string;
}) => {
  const typology = getCompanyTypology(sector);
  const Icon = typology.icon;
  const title = label || typology.label;

  return (
    <span
      title={title}
      aria-label={title}
      role="img"
      className={cn(
        "inline-flex shrink-0 items-center justify-center text-muted-foreground",
        className,
      )}
    >
      <Icon className="w-full h-full" />
    </span>
  );
};
