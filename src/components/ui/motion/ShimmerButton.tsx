import { useReducedMotion } from "./useReducedMotion";

/**
 * Le reflet du bouton principal (Magic UI « Shimmer Button », NOS-1170).
 *
 * L'audit : « Résout FICHE-01 : le reflet distingue l'action principale des
 * quatre autres **sans ajouter de couleur**. Discipline absolue : jamais deux
 * sur un même écran. »
 *
 * Le point est celui-là : la fiche opportunité portait cinq boutons de même
 * poids. On aurait pu colorer le principal, mais la charte réserve désormais
 * l'orange à l'action — et une couleur de plus sur un écran qui en compte déjà
 * six ne hiérarchise rien. Un reflet qui passe toutes les quelques secondes se
 * remarque sans peser.
 *
 * ## Ce n'est pas un bouton, c'est un vernis
 *
 * Volontairement une classe à poser sur le `<Button>` existant plutôt qu'un
 * composant qui le remplace : le bouton garde ses variantes, ses tailles, son
 * `asChild` et son comportement clavier. Rien de tout cela n'a à être réécrit
 * pour un reflet.
 */
export const useShimmer = (enabled = true): string => {
  const reduced = useReducedMotion();
  if (!enabled || reduced) return "";
  return "relative overflow-hidden after:absolute after:inset-0 after:bg-[linear-gradient(105deg,transparent_35%,rgba(255,255,255,0.42)_50%,transparent_65%)] after:animate-[shimmer-sweep_4s_ease-in-out_infinite] after:pointer-events-none";
};
