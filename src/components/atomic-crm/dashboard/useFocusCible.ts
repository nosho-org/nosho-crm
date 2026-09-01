import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

/**
 * ---------------------------------------------------------------------------
 * Amener le regard là où la notification promettait de conduire (NOS-1224)
 * ---------------------------------------------------------------------------
 * Simon : « quand je clique sur la notification faudrait que je sois renvoyé
 * sur une page avec les 6 actions concernées, car quand je clique il ne se
 * passe rien ».
 *
 * Rien ne se passait au sens strict : la notification pointait vers `/`, et il
 * y était déjà. Le tableau de bord montre pourtant ces six actions, dans la
 * file d'actions — plus bas dans la page, hors de vue.
 *
 * ## Pourquoi un paramètre plutôt qu'une ancre
 *
 * L'application est servie en `HashRouter` : le fragment porte déjà la route
 * (`#/deals/12`). Une ancre `#file-actions` entrerait en collision avec le
 * routeur. Le repère voyage donc en query string de la route — `?focus=…` —
 * que React Router restitue intact.
 *
 * ## Pourquoi une surbrillance temporaire
 *
 * Faire défiler sans rien dire laisse l'utilisateur chercher ce qui a bougé,
 * surtout quand la page est déjà longue. Le halo dure le temps de faire le
 * lien entre le clic et l'endroit, puis s'efface — un marquage permanent
 * deviendrait un décor qu'on ne voit plus.
 */
export function useFocusCible(nom: string): boolean {
  const { search, key } = useLocation();
  const [enEvidence, setEnEvidence] = useState(false);

  const cible = new URLSearchParams(search).get("focus");

  useEffect(() => {
    if (cible !== nom) return;

    const element = document.getElementById(nom);
    if (!element) return;

    element.scrollIntoView({ behavior: "smooth", block: "center" });
    setEnEvidence(true);

    const minuteur = window.setTimeout(() => setEnEvidence(false), 2500);
    return () => window.clearTimeout(minuteur);
    /*
     * `key` change a chaque navigation, meme vers une URL identique.
     *
     * Sans lui, un second clic sur la meme notification ne rejouerait rien :
     * la query serait inchangee, l effet ne se declencherait pas, et on
     * retomberait exactement sur le « il ne se passe rien » qu on corrige.
     */
  }, [cible, nom, key]);

  return enEvidence;
}

/** Le repère de la file d'actions, partagé entre la cloche et le cockpit. */
export const FOCUS_FILE_ACTIONS = "file-actions";

/**
 * La cible des notifications de tâches.
 *
 * Forme objet plutôt que chaîne : `AppNotification.to` la passe telle quelle à
 * `<Link>`, et une chaîne « /?focus=… » serait interprétée comme un chemin.
 */
export function lienFileActions(): { pathname: string; search: string } {
  return { pathname: "/", search: `?focus=${FOCUS_FILE_ACTIONS}` };
}
