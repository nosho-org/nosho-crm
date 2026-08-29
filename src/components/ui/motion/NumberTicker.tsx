import { useEffect, useRef, useState } from "react";

import { useReducedMotion } from "./useReducedMotion";

/**
 * Un nombre qui monte jusqu'à sa valeur (Magic UI « Number Ticker », NOS-1177).
 *
 * L'audit : « Le compteur qui monte fait lire le chiffre. À réserver au chiffre
 * héros, une seule fois par écran, et uniquement au premier chargement — pas à
 * chaque re-render. »
 *
 * ## « Une seule fois » est la partie difficile
 *
 * Un tableau de bord se re-rend à chaque changement de filtre, à chaque
 * requête qui revient. Sans garde, le chiffre repartirait de zéro à chaque
 * fois — et un chiffre qui bouge sans raison est illisible, exactement le
 * contraire de l'effet recherché.
 *
 * La garde est ici un `useRef` : l'animation ne joue qu'au **premier montage**,
 * et une valeur qui change ensuite s'affiche directement. C'est délibéré : un
 * pipeline qui passe de 912 k€ à 890 k€ parce qu'on a changé de filtre doit
 * afficher 890 k€, pas remonter depuis zéro.
 */
export const NumberTicker = ({
  value,
  format = (current) => String(Math.round(current)),
  durationMs = 900,
  className = "",
}: {
  value: number;
  /** Reçoit la valeur intermédiaire à chaque image. */
  format?: (current: number) => string;
  durationMs?: number;
  className?: string;
}) => {
  const reduced = useReducedMotion();
  const hasAnimated = useRef(false);
  const [displayed, setDisplayed] = useState(() =>
    // Sans animation, le chiffre est juste dès la première image : personne ne
    // doit voir un zéro qui ne bougera jamais.
    reduced ? value : 0,
  );

  useEffect(() => {
    if (hasAnimated.current || reduced || !Number.isFinite(value)) {
      setDisplayed(value);
      hasAnimated.current = true;
      return;
    }
    hasAnimated.current = true;

    let frame = 0;
    const start = performance.now();

    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      // Cubique sortante : rapide au début, elle s'installe à la fin. Une
      // rampe linéaire donne l'impression d'un chargement qui traîne.
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(value * eased);
      if (progress < 1) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // Volontairement au montage seulement : voir l'en-tête.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * Les valeurs suivantes s'affichent directement.
   *
   * `initialValue` et non `hasAnimated` : ce dernier passe à vrai dans l'effet
   * ci-dessus, qui s'exécute AVANT celui-ci au montage — la synchronisation
   * écraserait donc l'animation à sa première image. Comparer à la valeur de
   * départ ne se déclenche, elle, que sur un vrai changement.
   */
  const initialValue = useRef(value);
  useEffect(() => {
    if (value !== initialValue.current) setDisplayed(value);
  }, [value]);

  return (
    <span className={className} aria-label={format(value)}>
      <span aria-hidden>{format(displayed)}</span>
    </span>
  );
};
