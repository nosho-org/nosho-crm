import { useEffect, useRef, useState } from "react";

import { useReducedMotion } from "./useReducedMotion";

/**
 * L'anneau d'objectif (Magic UI « Animated Circular Progress Bar », NOS-1177).
 *
 * L'audit : « Donne enfin un référentiel aux 912 k€. **L'animation ne joue
 * qu'à l'arrivée sur la page.** »
 *
 * Remplace les deux anneaux écrits à la main dans `TargetsCard` et
 * `CockpitDayBar`, qui dessinaient la même géométrie à deux endroits — donc
 * deux occasions de diverger sur le rayon, l'épaisseur ou le sens de rotation.
 *
 * ## Le tracé est borné, le pourcentage ne l'est pas
 *
 * Un objectif dépassé ne peut pas dessiner deux tours ; il doit en revanche se
 * lire comme dépassé. Le tracé sature donc à un tour et change de couleur, et
 * c'est le texte à côté — hors de ce composant — qui écrit 130 %.
 */
export const AnimatedRing = ({
  ratio,
  size = 52,
  className = "",
}: {
  /** 0 à 1 ; au-delà, le tracé sature et la couleur change. */
  ratio: number;
  size?: number;
  className?: string;
}) => {
  const reduced = useReducedMotion();
  const played = useRef(false);
  const filled = Math.min(1, Math.max(0, ratio));
  const reached = ratio >= 1;

  // Rayon 21 dans une boîte de 52 : 6 d'épaisseur de trait laissent 2 de marge
  // de chaque côté, sinon le trait est rogné par le `viewBox`.
  const CIRCUMFERENCE = 2 * Math.PI * 21;

  const [drawn, setDrawn] = useState(() =>
    reduced || played.current ? filled : 0,
  );

  useEffect(() => {
    if (reduced || played.current) {
      setDrawn(filled);
      played.current = true;
      return;
    }
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        played.current = true;
        setDrawn(filled);
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [reduced, filled]);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 52 52"
      className={className}
      aria-hidden
    >
      <circle
        cx="26"
        cy="26"
        r="21"
        fill="none"
        stroke="var(--muted)"
        strokeWidth="6"
      />
      <circle
        cx="26"
        cy="26"
        r="21"
        fill="none"
        stroke={
          reached ? "var(--deal-status-won)" : "var(--deal-series-potential)"
        }
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - drawn)}
        transform="rotate(-90 26 26)"
        style={
          reduced
            ? undefined
            : {
                transition:
                  "stroke-dashoffset 1s cubic-bezier(0.22, 0.9, 0.3, 1)",
              }
        }
      />
    </svg>
  );
};
