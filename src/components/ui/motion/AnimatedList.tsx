import { useReducedMotion } from "./useReducedMotion";

/**
 * Entrée décalée d'une liste (Magic UI « Animated List », NOS-1170).
 *
 * L'audit : « L'entrée décalée aide à percevoir l'ordre de priorité. **À
 * limiter à 6-8 lignes et à couper au-delà**, sinon la liste devient plus lente
 * que l'œil. »
 *
 * La coupure est appliquée : au-delà de `MAX_STAGGERED` lignes, les suivantes
 * apparaissent sans délai. Une file de vingt tâches dont la dernière arrive
 * après deux secondes n'est pas une aide, c'est une attente.
 *
 * ## Le décalage porte du sens, ici
 *
 * Dans la file d'actions, l'ordre est le classement : le retard le plus ancien
 * d'abord, puis l'enjeu décroissant. Les voir arriver dans cet ordre dit ce que
 * le tri a décidé. C'est pour cette raison que l'effet est ici et pas sur une
 * grille de cartes, où l'ordre ne veut rien dire.
 */

/** Au-delà, l'attente cumulée dépasse ce qu'un œil accepte. */
const MAX_STAGGERED = 8;
const STEP_MS = 45;

export const AnimatedListItem = ({
  index,
  children,
  className = "",
}: {
  index: number;
  children: React.ReactNode;
  className?: string;
}) => {
  const reduced = useReducedMotion();

  if (reduced) return <div className={className}>{children}</div>;

  const delay = index < MAX_STAGGERED ? index * STEP_MS : 0;

  return (
    <div
      className={`${className} motion-safe:animate-[list-item-in_320ms_ease-out_both]`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
};
