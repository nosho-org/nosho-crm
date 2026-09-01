/**
 * ---------------------------------------------------------------------------
 * Ouvrir la palette depuis ailleurs (NOS-1226)
 * ---------------------------------------------------------------------------
 * Simon : « rajoute sur le menu bleu une barre de recherche qui permet de
 * taper dans tout (société, opportunité, contacts…) ».
 *
 * Cette recherche existait déjà, complète, dans `CommandPalette` — mais
 * seulement derrière ⌘K. Un raccourci clavier sans affordance visible n'est
 * découvert par personne : la fonction était là, invisible.
 *
 * ## Pourquoi un événement plutôt qu'un contexte
 *
 * `Header` et `CommandPalette` sont frères dans `Layout`. Un contexte
 * demanderait d'envelopper les deux et de faire remonter un état d'ouverture
 * à travers un arbre qui n'en a aucun autre besoin. L'événement reste local à
 * ces deux fichiers et ne coûte rien au reste de l'application.
 *
 * ## Pourquoi le texte voyage avec
 *
 * Un champ qui ouvre une fenêtre puis perd la lettre qu'on vient de taper est
 * une petite trahison qu'on paie à chaque recherche. La première frappe part
 * avec l'ouverture et se retrouve dans la palette.
 */

const EVENEMENT = "nosho:palette:ouvrir";

export interface OuverturePalette {
  /** Ce qui était déjà tapé, à reprendre dans la palette. */
  texte?: string;
}

/** Demande l'ouverture de la palette, éventuellement pré-remplie. */
export function ouvrirPalette(texte?: string): void {
  window.dispatchEvent(
    new CustomEvent<OuverturePalette>(EVENEMENT, { detail: { texte } }),
  );
}

/** Écoute les demandes d'ouverture. Rend la fonction de désabonnement. */
export function ecouterOuverturePalette(
  reagir: (ouverture: OuverturePalette) => void,
): () => void {
  const gestionnaire = (event: Event) => {
    reagir((event as CustomEvent<OuverturePalette>).detail ?? {});
  };
  window.addEventListener(EVENEMENT, gestionnaire);
  return () => window.removeEventListener(EVENEMENT, gestionnaire);
}
