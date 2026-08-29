import { useReducedMotion } from "./useReducedMotion";

/**
 * Un faisceau qui parcourt la bordure (Magic UI « Border Beam », NOS-1177).
 *
 * L'audit : « Le seul élément animé en permanence de l'écran. C'est
 * précisément ce qui en fait un point focal : **si deux éléments l'ont, l'effet
 * s'annule.** »
 *
 * C'est donc une ressource rare, pas un style. Un seul usage dans toute
 * l'application : la carte « À faire maintenant » du cockpit. Avant d'en poser
 * un second, il faut retirer le premier.
 *
 * ## Comment c'est fait
 *
 * Un dégradé conique qui tourne, masqué par un fond posé en retrait d'un
 * pixel — le même procédé que le prototype de l'audit. Pas de bibliothèque :
 * `conic-gradient` et `@keyframes` suffisent, et le navigateur compose la
 * rotation sur le GPU.
 *
 * Sous `prefers-reduced-motion`, le composant ne rend **rien** : une bordure
 * figée qui prétendrait le remplacer serait un ornement de plus, pas un point
 * focal. La carte porte déjà sa bordure gauche colorée, qui suffit.
 */
export const BorderBeam = ({
  className = "",
  durationSeconds = 6,
}: {
  className?: string;
  durationSeconds?: number;
}) => {
  const reduced = useReducedMotion();
  if (reduced) return null;

  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] ${className}`}
    >
      <span
        className="absolute left-1/2 top-1/2 aspect-square w-[200%] -translate-x-1/2 -translate-y-1/2 motion-safe:animate-[border-beam-spin_var(--beam-duration)_linear_infinite]"
        style={
          {
            "--beam-duration": `${durationSeconds}s`,
            background:
              "conic-gradient(from 0deg, transparent 0turn, var(--deal-series-potential) 0.06turn, transparent 0.16turn)",
          } as React.CSSProperties
        }
      />
      {/* Le masque : il ne laisse voir du dégradé que l'épaisseur du bord. */}
      <span className="absolute inset-px rounded-[inherit] bg-card" />
    </span>
  );
};
