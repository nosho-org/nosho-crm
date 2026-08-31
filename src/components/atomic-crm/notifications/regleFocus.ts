/**
 * ---------------------------------------------------------------------------
 * Quand la priorité du jour mérite d'être notifiée (NOS-1215)
 * ---------------------------------------------------------------------------
 * Simon : « uniquement si une action reste à faire, pour moi ensuite on peut
 * fermer ».
 *
 * ## Un classement n'est pas une alerte
 *
 * `rankDealsByFocus` ordonne les affaires : il y a donc toujours une première,
 * tous les jours, quoi qu'on fasse. La cloche annonçait cette première sans
 * condition — un état permanent présenté comme un événement. Sur Oxance, où
 * Simon n'avait rien à faire, elle revenait sans fin.
 *
 * ## Ce qui compte comme « quelque chose à faire »
 *
 * Deux situations, et deux seulement :
 *
 * - **aucune action planifiée** — l'affaire avance sans prochaine étape, c'est
 *   le trou dans le suivi que le pipeline sert précisément à éviter ;
 * - **une action échue** — la date est passée et rien n'a été coché.
 *
 * Une affaire dotée d'une action à venir ne déclenche rien : la prochaine
 * étape est posée, sa date dira quand s'en occuper. Notifier là-dessus
 * reviendrait à réclamer aujourd'hui ce qui est prévu pour la semaine
 * prochaine.
 *
 * L'inactivité prolongée n'entre pas dans la liste : elle pèse déjà sur le
 * score, donc sur le choix de l'affaire en tête, mais elle ne dit pas qu'un
 * geste est attendu — une affaire suivie peut dormir entre deux relances
 * planifiées.
 */
export interface CandidatFocus {
  hasNextAction: boolean;
  daysOverdue: number | null;
}

export function focusMeriteNotification(
  candidat: CandidatFocus | undefined | null,
): boolean {
  if (!candidat) return false;
  if (!candidat.hasNextAction) return true;
  return (candidat.daysOverdue ?? 0) > 0;
}
