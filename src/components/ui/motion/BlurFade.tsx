import { useEffect, useRef, useState } from "react";

import { useReducedMotion } from "./useReducedMotion";

/**
 * Apparition floutée, une seule fois (Magic UI « Blur Fade », NOS-1177).
 *
 * L'audit : « Séquence de chargement de 250 ms qui masque le temps de requête
 * et guide l'œil de haut en bas. **Une fois, à l'ouverture.** »
 *
 * ## Le décalage est ce qui guide l'œil, pas le flou
 *
 * `delayMs` croît de bloc en bloc : la journée, puis l'action du moment, puis
 * la file. L'ordre d'apparition est celui dans lequel il faut lire l'écran.
 * Sans décalage, tout arriverait en même temps et l'effet ne dirait rien.
 *
 * ## « Une fois » vaut pour la vie du composant
 *
 * Un `useRef` garde l'état joué. Un tableau de bord se re-rend à chaque filtre,
 * à chaque requête qui revient ; rejouer l'entrée à chaque fois transformerait
 * un changement de filtre en clignotement général.
 *
 * Le cas dégradé est le bon : sous `prefers-reduced-motion`, le contenu est
 * visible immédiatement, sans transition ni flou.
 */
export const BlurFade = ({
  children,
  delayMs = 0,
  className = "",
}: {
  children: React.ReactNode;
  delayMs?: number;
  className?: string;
}) => {
  const reduced = useReducedMotion();
  const played = useRef(false);
  const [shown, setShown] = useState(() => reduced || played.current);

  useEffect(() => {
    if (reduced || played.current) {
      setShown(true);
      return;
    }
    // Deux images d'attente avant de basculer, sinon le navigateur applique
    // l'état final sans transition — l'élément n'a jamais été peint dans son
    // état initial.
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        played.current = true;
        setShown(true);
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [reduced]);

  return (
    <div
      className={`${className} ${
        reduced
          ? ""
          : "transition-[opacity,filter,transform] duration-500 ease-out"
      } ${shown ? "opacity-100 blur-0 translate-y-0" : "opacity-0 blur-[3px] translate-y-1"}`}
      style={reduced ? undefined : { transitionDelay: `${delayMs}ms` }}
    >
      {children}
    </div>
  );
};
