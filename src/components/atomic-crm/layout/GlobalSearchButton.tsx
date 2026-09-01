import { Search } from "lucide-react";

import { ouvrirPalette } from "./paletteBus";

/**
 * ---------------------------------------------------------------------------
 * La barre de recherche du bandeau (NOS-1226)
 * ---------------------------------------------------------------------------
 * Simon : « rajoute sur le menu bleu une barre de recherche qui permet de
 * taper dans tout (société, opportunité, contacts…) ».
 *
 * ## Ce n'est pas un champ, et c'est délibéré
 *
 * La recherche existe déjà et couvre les trois ressources : c'est la palette
 * ⌘K. Poser ici un vrai `<input>` en aurait fait un SECOND moteur — deux
 * seuils de déclenchement, deux façons d'afficher les résultats, deux
 * endroits à corriger le jour où l'un des deux se trompe.
 *
 * Ce bouton a donc l'aspect d'un champ et le comportement d'une porte : il
 * ouvre la palette, qui prend le relais. C'est le patron retenu par la plupart
 * des outils qui ont les deux — la barre rend la fonction visible, le
 * raccourci la rend rapide.
 *
 * La première frappe n'est pas perdue : elle voyage avec l'ouverture (voir
 * `paletteBus`). Taper « ker » depuis le bandeau revient donc au même que
 * l'avoir tapé dans la palette.
 *
 * ## Le raccourci reste affiché
 *
 * Le « ⌘K » à droite n'est pas décoratif : c'est ce qui apprend le raccourci à
 * ceux qui ne l'ont jamais connu. Une barre qui le cacherait ferait
 * régresser ceux qui l'utilisaient déjà.
 */
export const GlobalSearchButton = () => (
  <button
    type="button"
    onClick={() => ouvrirPalette()}
    /*
     * `onKeyDown` plutôt que le seul clic : au clavier, on arrive ici par
     * Tab et on se met à écrire. Sans cela la lettre tapée disparaîtrait dans
     * le vide, le bouton n'ayant pas de champ de saisie.
     */
    onKeyDown={(event) => {
      if (event.key.length !== 1 || event.metaKey || event.ctrlKey) return;
      event.preventDefault();
      ouvrirPalette(event.key);
    }}
    aria-label="Rechercher une société, une opportunité, un contact"
    className="hidden md:flex items-center gap-2 h-8 w-56 lg:w-72 px-2.5 mr-2 rounded-md border border-header-foreground/20 bg-header-foreground/5 text-header-foreground/60 hover:bg-header-foreground/10 hover:text-header-foreground/80 transition-colors"
  >
    <Search className="w-3.5 h-3.5 shrink-0" aria-hidden />
    <span className="text-sm truncate">Rechercher…</span>
    <kbd className="ml-auto shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded border border-header-foreground/20">
      ⌘K
    </kbd>
  </button>
);
