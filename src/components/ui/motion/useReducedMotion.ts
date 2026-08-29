import { useEffect, useState } from "react";

/**
 * ---------------------------------------------------------------------------
 * Le socle des composants animés (NOS-1177)
 * ---------------------------------------------------------------------------
 * L'audit du 29 août 2026 pose trois règles non négociables sur les effets
 * repris de Magic UI :
 *
 *   1. une seule animation en boucle par écran ;
 *   2. toute animation d'entrée joue une fois, et jamais au re-render ;
 *   3. `prefers-reduced-motion` respecté partout — « ce qui n'est pas une
 *      option quand vos utilisateurs finaux sont des professionnels de
 *      santé ».
 *
 * La troisième est celle que ce module fait respecter. Les deux autres tiennent
 * à la façon de composer, et sont documentées dans chaque composant.
 *
 * ## Pourquoi ces composants sont écrits ici, et non installés
 *
 * Magic UI livre ses composants en React + `framer-motion`. Cette dépendance
 * pèse une cinquantaine de kilo-octets pour ce qu'on lui demanderait ici : des
 * transitions d'opacité, un dégradé qui tourne, un compteur qui monte. Toutes
 * choses que le CSS fait nativement — et que le prototype de l'audit lui-même
 * fait en CSS.
 *
 * Le jour où une animation demandera vraiment de l'interpolation contrôlée —
 * une liste réordonnable, un geste — la dépendance se justifiera. Pas avant.
 */

/**
 * Le réglage système, suivi en direct.
 *
 * Écouté et non lu une fois : le réglage se change sans recharger la page, et
 * un utilisateur qui l'active parce qu'une animation le gêne doit être exaucé
 * tout de suite.
 *
 * Le repli est `false` — animations actives — parce que `matchMedia` peut
 * manquer en test ou en rendu serveur, et que faire l'inverse désactiverait
 * tout partout sans que personne ne le demande.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
