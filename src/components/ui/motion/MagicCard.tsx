import { useCallback, useRef } from "react";

import { useReducedMotion } from "./useReducedMotion";

/**
 * Halo qui suit le curseur (Magic UI « Magic Card », NOS-1170).
 *
 * L'audit : « Le halo qui suit le curseur donne un retour de survol **sans
 * bordure supplémentaire**. Utile sur une grille dense où la bordure coûte
 * cher visuellement. »
 *
 * C'est exactement le cas de la bande de KPI : six cartes côte à côte, où
 * épaissir une bordure au survol fait sauter la mise en page d'un pixel.
 *
 * ## Aucun état React
 *
 * La position du curseur est écrite directement en variables CSS sur le nœud.
 * Un `useState` déclencherait un rendu React à chaque `mousemove` — soixante
 * par seconde, sur six cartes qui portent chacune un calcul de KPI. Le halo ne
 * vaut pas ce prix, et il n'a pas besoin de React pour bouger.
 *
 * Sous `prefers-reduced-motion`, le halo est absent : ce n'est pas une
 * animation d'entrée qu'on peut simplement raccourcir, c'est un élément qui
 * suit le curseur en continu.
 */
export const MagicCard = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  const onMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    node.style.setProperty("--magic-x", `${event.clientX - rect.left}px`);
    node.style.setProperty("--magic-y", `${event.clientY - rect.top}px`);
    node.style.setProperty("--magic-opacity", "1");
  }, []);

  const onMouseLeave = useCallback(() => {
    ref.current?.style.setProperty("--magic-opacity", "0");
  }, []);

  if (reduced) return <div className={className}>{children}</div>;

  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className={`group relative ${className}`}
      style={{ "--magic-opacity": "0" } as React.CSSProperties}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-[var(--magic-opacity)] transition-opacity duration-300"
        style={{
          background:
            "radial-gradient(180px circle at var(--magic-x) var(--magic-y), color-mix(in oklch, var(--deal-series-potential) 14%, transparent), transparent 70%)",
        }}
      />
      {children}
    </div>
  );
};
