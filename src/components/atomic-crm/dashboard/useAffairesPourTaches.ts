import { useGetList } from "ra-core";

import type { DealRecord } from "../deals/cockpit/dealFields";

/**
 * ---------------------------------------------------------------------------
 * Les affaires servant à juger qu'une tâche n'a plus lieu d'être (NOS-1578)
 * ---------------------------------------------------------------------------
 * Simon : « si une opportunité est en lost alors ne plus faire apparaître les
 * tâches ». Deux écrans appliquent la règle — la file d'actions et la cloche
 * de notifications — et elle doit porter sur le **même** jeu d'affaires dans
 * les deux, sous peine d'annoncer un compte qui ne correspond pas à la liste
 * qu'il ouvre.
 *
 * ## Ni la période, ni le responsable
 *
 * Les deux écrans disposent déjà d'un lot d'affaires, et aucun ne convient :
 *
 *   * celui du tableau de bord est borné par la **période** choisie — une même
 *     tâche apparaîtrait ou disparaîtrait selon le filtre, ce qui n'est pas une
 *     règle mais un hasard ;
 *   * celui des notifications est borné par le **responsable**, et c'est le
 *     piège qui a fait échouer la première version : une tâche appartient à
 *     qui l'a créée, l'opportunité à qui la suit, et ce n'est pas la même
 *     personne. Vérifié à l'écran — l'affaire passait en Lost, sa tâche restait
 *     affichée, parce que l'affaire n'était pas dans le lot du propriétaire de
 *     la tâche.
 *
 * D'où une requête à part, filtrée sur la seule chose qui compte : l'affaire
 * n'est pas archivée. Requête unique et partagée — les deux appelants passent
 * par ce hook, donc React Query les regroupe sous la même clé et n'interroge le
 * serveur qu'une fois.
 *
 * Tri sur `id`, une vraie colonne de la table : `last_activity_at` est calculé
 * par la vue, et la trier n'apporterait rien à une liste dont on ne lit que
 * `stage` et `contact_ids`.
 */

/**
 * Le même plafond que le tableau de bord. Au-delà, la règle se dégraderait en
 * silence : les affaires non chargées compteraient comme inexistantes, et leurs
 * tâches resteraient affichées. 289 affaires en production.
 */
const MAX_AFFAIRES = 1000;

export function useAffairesPourTaches() {
  const { data } = useGetList<DealRecord>("deals", {
    pagination: { page: 1, perPage: MAX_AFFAIRES },
    sort: { field: "id", order: "ASC" },
    filter: { "archived_at@is": null },
  });
  return data;
}
