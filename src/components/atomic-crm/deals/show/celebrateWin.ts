import confetti from "canvas-confetti";

/**
 * ---------------------------------------------------------------------------
 * Le seul effet purement émotionnel du CRM (NOS-1168)
 * ---------------------------------------------------------------------------
 * L'audit du 29 août 2026, sur les composants animés : « Confetti — passage en
 * Close Won, uniquement. Le seul effet purement émotionnel qui se justifie
 * dans un CRM. Il marque l'événement que toute l'équipe attend. Réservé au
 * Won : jamais sur une tâche cochée. »
 *
 * La règle tient à la rareté. Une équipe signe quelques affaires par mois ;
 * elle coche des dizaines de tâches par jour. Le même effet appliqué aux deux
 * cesse de marquer quoi que ce soit et devient un délai avant de pouvoir
 * cliquer ailleurs.
 *
 * ## `prefers-reduced-motion` n'est pas une option ici
 *
 * Les utilisateurs finaux sont des professionnels de santé, et parmi eux des
 * personnes que le mouvement rend malades. Le réglage système est respecté :
 * dans ce cas, rien ne se déclenche du tout — pas une version atténuée.
 */

/** Les couleurs de la charte, pour que l'effet appartienne au produit. */
const COLORS = ["#D9540B", "#136F46", "#1E5FA8", "#F0B429"];

export function celebrateWin(): void {
  if (typeof window === "undefined") return;

  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  /*
   * Deux tirs depuis les bords bas, plutôt qu'un seul depuis le centre.
   *
   * Un tir central passe devant le contenu qu'on vient de lire — le montant,
   * le nom du client — pendant une seconde entière. Depuis les côtés, l'effet
   * traverse le champ sans masquer ce qui compte.
   */
  const shoot = (origin: { x: number; y: number }, angle: number) => {
    confetti({
      particleCount: 60,
      spread: 55,
      startVelocity: 45,
      angle,
      origin,
      colors: COLORS,
      // Sous les fenêtres modales de Radix (z-50), au-dessus du reste.
      zIndex: 40,
      disableForReducedMotion: true,
    });
  };

  shoot({ x: 0.1, y: 0.9 }, 60);
  shoot({ x: 0.9, y: 0.9 }, 120);
}
