import type { Identifier } from "ra-core";

/**
 * ---------------------------------------------------------------------------
 * Deux notifications, une seule cause (NOS-1210)
 * ---------------------------------------------------------------------------
 * Simon, devant Oxance : « le système de notification déconne, j'ai déjà
 * traité Oxance et il me remet la notification alors que la tâche est
 * effectuée ».
 *
 * Ses trois tâches étaient bel et bien terminées. Ce que la cloche annonçait,
 * c'est qu'il n'en restait **aucune de planifiée** — vrai, mais dit deux fois :
 *
 * - « À faire : Oxance · aucune prochaine action »
 * - « 1 opportunité sans prochaine action »
 *
 * Ce n'est pas une coïncidence. `MISSING_ACTION_WEIGHT` fait précisément
 * remonter en tête du classement les affaires sans prochaine action : celle du
 * focus est donc, très souvent, celle que la seconde notification compte. Deux
 * lignes pour un fait unique, dont l'une nomme l'affaire et l'autre la
 * dénombre.
 *
 * D'où cette fonction : la seconde ne parle plus que des AUTRES. Le compte
 * reste exact — on n'a rien caché, on a seulement cessé de compter deux fois ce
 * qui était déjà nommé — et la notification disparaît quand il n'y a personne
 * d'autre.
 */
export function autresQueLaTete<T extends { deal: { id: Identifier } }>(
  sansAction: T[],
  teteDeFocus: { deal: { id: Identifier } } | undefined,
): T[] {
  if (!teteDeFocus) return sansAction;
  return sansAction.filter(
    (candidat) => candidat.deal.id !== teteDeFocus.deal.id,
  );
}
