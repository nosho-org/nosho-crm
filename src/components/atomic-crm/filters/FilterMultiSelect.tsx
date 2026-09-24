import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * ---------------------------------------------------------------------------
 * Un filtre à cocher, partagé par la liste et le tableau de bord
 * ---------------------------------------------------------------------------
 * Il vivait dans `DealFilterBar`, où il servait déjà pour l'étape, la
 * catégorie, le type, la priorité et le responsable. Simon, le 24/09/2026 :
 * « sur le tableau de bord, dans la partie produits, mets ça dans un menu
 * déroulant » — d'où l'extraction, plutôt qu'une seconde copie qui serait
 * celle qu'on oublie de corriger.
 *
 * ## Ce qu'une liste déroulante ordinaire ne sait pas faire
 *
 * Le tableau de bord rendait le filtre Produit en pastilles côte à côte, et le
 * commentaire qui justifiait ce choix disait vrai :
 *
 *   « Products are multi-select, so they get toggle pills rather than a Select:
 *     "Produit = No-show + Entrant" means either, and a dropdown cannot show two
 *     values at once without lying about which is active. »
 *
 * C'est vrai d'un `Select`. Faux de celui-ci : il coche plusieurs entrées, et
 * `summarise` écrit la sélection en toutes lettres — « No-show + Entrant »,
 * puis « No-show +2 » quand elle ne tient plus. Rien n'est caché.
 *
 * `DropdownMenuCheckboxItem` plutôt qu'un multi-select maison : la brique
 * existe dans `ui/`, elle est accessible au clavier, et elle évite un énième
 * patron de sélection. Le menu ne se referme pas à chaque clic — `onSelect`
 * annule l'événement — sinon cocher trois produits demanderait d'ouvrir le
 * menu trois fois.
 */

/** Étiquette compacte : « Qualifié + Démo/POC +1 ». */
export const summarise = (
  selected: string[],
  choices: { value: string; label: string }[],
  allLabel: string,
): string => {
  if (selected.length === 0) return allLabel;
  const labels = selected.map(
    /*
     * Une valeur sans libellé s'écrit « … », jamais sa valeur brute.
     *
     * Les choix des étapes et des priorités viennent de la configuration et
     * sont là immédiatement ; ceux des responsables arrivent d'une requête.
     * Depuis que la liste s'ouvre filtrée sur l'utilisateur courant (NOS-1085),
     * ce filtre est toujours posé au premier rendu — et affichait donc « 0 »,
     * l'identifiant nu, le temps que les commerciaux répondent. Un identifiant
     * technique ne dit rien à personne ; l'ellipse dit « ça arrive ».
     */
    (value) => choices.find((choice) => choice.value === value)?.label ?? "…",
  );
  if (labels.length <= 2) return labels.join(" + ");
  return `${labels[0]} + ${labels[1]} +${labels.length - 2}`;
};

export const FilterMultiSelect = ({
  label,
  selected,
  onToggle,
  onClear,
  allLabel,
  choices,
  className = "w-40",
}: {
  label: string;
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
  allLabel: string;
  choices: { value: string; label: string }[];
  className?: string;
}) => (
  <div className="flex flex-col gap-1 min-w-0">
    <span className="text-xs font-medium text-muted-foreground">
      {label} {selected.length > 1 && `(${selected.length})`}
    </span>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label={label}
          className={`${className} justify-between font-normal`}
        >
          <span className="truncate">
            {summarise(selected, choices, allLabel)}
          </span>
          <ChevronDown className="w-4 h-4 opacity-50 shrink-0" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
        <DropdownMenuCheckboxItem
          checked={selected.length === 0}
          onSelect={(event) => {
            event.preventDefault();
            onClear();
          }}
        >
          {allLabel}
        </DropdownMenuCheckboxItem>
        {choices.map((choice) => (
          <DropdownMenuCheckboxItem
            key={choice.value}
            checked={selected.includes(choice.value)}
            onSelect={(event) => {
              event.preventDefault();
              onToggle(choice.value);
            }}
          >
            {choice.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);
