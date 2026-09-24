import type { Deal } from "../types";

/**
 * ---------------------------------------------------------------------------
 * Dupliquer une opportunité
 * ---------------------------------------------------------------------------
 * Simon, le 24/09/2026 : « souvent c'est chiant quand on a un client qui
 * redemande un autre produit : si la carte est en Close Won, on est obligé
 * d'en refaire une manuellement du début. »
 *
 * Ce qui coûte, dans « du début », ce n'est pas le formulaire — c'est de
 * retrouver la société, ses contacts, leurs rôles, la catégorie, la motion,
 * l'apporteur. Ces champs-là décrivent le *client*, pas l'affaire qui vient de
 * se clore : ils se recopient tels quels.
 *
 * ## Une liste blanche, pas une liste noire
 *
 * On énumère ce qui se copie, et rien d'autre ne passe. L'inverse — tout
 * copier sauf une liste d'exclusions — se périme à la première colonne
 * ajoutée : elle arriverait dans les doublons sans que personne l'ait décidé,
 * et il faudrait s'en apercevoir. Ici une colonne nouvelle ne se copie pas
 * tant qu'on ne l'a pas écrite ci-dessous ; l'oubli se voit à l'écran.
 *
 * ## Ce qui ne se copie pas, et pourquoi
 *
 * Tout ce qui raconte le *cycle de vie* de l'affaire close :
 *
 * - `stage`, `index`, `expected_closing_date` — la nouvelle repart au début du
 *   pipeline, aux valeurs que `DealCreate` pose déjà pour une création neuve ;
 * - `entered_at`, `won_at`, `trial_start_date`, `archived_at`, `created_at`,
 *   `updated_at`, `last_activity_at` — des dates qui appartiennent à l'autre ;
 * - `probability` — une dérogation consentie à une affaire précise, pas au
 *   client ; la nouvelle repart sur la probabilité de son étape ;
 * - `proposal_*` — la proposition générée porte le produit et le montant de
 *   l'affaire d'origine. La recopier ferait partir le mauvais document ;
 * - `next_action*`, `next_task_*` — l'action suivante se rattache aux tâches,
 *   et les tâches ne suivent pas ;
 * - `mrr`, `priority_rank`, `company_name` — calculés par la base ou par la
 *   vue, jamais écrits par le formulaire ;
 * - `legacy_stage`, `legacy_category` — la trace d'une migration subie par une
 *   ligne précise, dénuée de sens sur une ligne créée aujourd'hui.
 *
 * Ni les notes, ni les tâches, ni les contrats : ce sont des enregistrements à
 * part, rattachés par `deal_id`, et rien ici ne les touche.
 *
 * ## Le montant et les produits se copient
 *
 * Le nouveau produit aura presque toujours un autre prix — mais un bouton qui
 * s'appelle « Dupliquer » et qui vide des champs renseignés surprend plus
 * qu'il n'aide. Le formulaire s'ouvre rempli, l'utilisateur corrige avant
 * d'enregistrer : rien n'est écrit sans son clic.
 *
 * `arr_is_manual` suit le montant, sinon un ARR saisi à la main se ferait
 * écraser par la suggestion tirée du type d'établissement, à l'ouverture même
 * du formulaire.
 *
 * ## Le nom
 *
 * `deals.name` est `not null` et le champ n'existe plus à l'écran : il se
 * remplit depuis la société (`deciderNom`), qui ne réagit qu'à un *changement*
 * de société. Sur un formulaire prérempli la société ne change pas. Le nom se
 * copie donc explicitement, faute de quoi la création échouerait sur une
 * erreur Postgres brute.
 */

/**
 * Les champs recopiés dans le doublon.
 *
 * Exportée pour que le test la lise plutôt que de la redire — un test qui
 * répète la liste ne vérifie que sa propre copie.
 */
export const CHAMPS_DUPLIQUES = [
  "name",
  "company_id",
  "company_type",
  "opportunity_type",
  "contact_ids",
  "contact_roles",
  "category",
  "motion",
  "products",
  "priority",
  "lead_source",
  "referrer_id",
  "sales_id",
  "description",
  "amount",
  "arr_is_manual",
] as const satisfies readonly (keyof Deal)[];

export type ChampDuplique = (typeof CHAMPS_DUPLIQUES)[number];

/**
 * Le brouillon à préremplir dans le formulaire de création.
 *
 * Les champs absents ou `null` de la source sont omis, pas recopiés à `null` :
 * un `null` posé sur le formulaire écraserait le défaut que `DealCreate`
 * applique aux créations neuves — le responsable courant, notamment.
 *
 * Tableaux et objets sont recopiés, pas partagés : `contact_ids` et
 * `contact_roles` sont édités en place par le formulaire, et une référence
 * commune modifierait l'affaire d'origine — celle-là même qu'on est en train
 * de regarder.
 */
export function brouillonDuplique(source: Deal): Partial<Deal> {
  const brouillon: Record<string, unknown> = {};

  for (const champ of CHAMPS_DUPLIQUES) {
    const valeur = source[champ];
    if (valeur == null) continue;
    if (Array.isArray(valeur)) {
      brouillon[champ] = [...valeur];
    } else if (typeof valeur === "object") {
      brouillon[champ] = { ...valeur };
    } else {
      brouillon[champ] = valeur;
    }
  }

  return brouillon as Partial<Deal>;
}
