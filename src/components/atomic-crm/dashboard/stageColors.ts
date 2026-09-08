/**
 * Une teinte par étape, partagée par tous les écrans qui en dessinent.
 *
 * La table vivait en double, à l'identique, dans `PipelineFunnel` et
 * `DealColumn` — un dégradé recopié à la main que le redécoupage de
 * « Démo / POC » a fallu modifier deux fois (NOS-1377). Le troisième
 * consommateur, les barres de `ArrParCategorie` (NOS-1401), a fait pencher la
 * balance : une même étape doit garder sa couleur du kanban à l'entonnoir au
 * tableau, sinon chaque graphique demande un effort de traduction.
 *
 * Le dégradé suit le tunnel de vente — bleu clair à l'entrée, violet puis
 * magenta au milieu, orange et jaune près de la signature — de sorte que
 * l'avancement se lise à la couleur avant même de lire les libellés.
 */
export const STAGE_COLORS: Record<string, string> = {
  "a-reclasser": "var(--muted-foreground)",
  lead: "#7cc0f0",
  qualified: "var(--deal-series-potential)",
  // `demo` garde le violet de l'ancienne « Démo / POC » — c'est la couleur que
  // l'équipe associe déjà à cette zone du pipeline. `poc` reçoit un magenta,
  // interpolé entre ce violet et l'orange de « Proposition », pour que la
  // progression du dégradé reste continue après le redécoupage du 06/09/2026.
  demo: "var(--deal-series-weighted)",
  poc: "#c4569e",
  proposal: "#f0993f",
  negociation: "var(--deal-status-warning)",
  // Les deux issues gardent leur sémantique : vert = acquis, rouge = perdu.
  "closed-won": "var(--deal-status-won)",
  lost: "var(--deal-status-lost)",
  // Churn est une perte, mais après signature : neutre plutôt que rouge, pour
  // ne pas la confondre avec une affaire jamais gagnée.
  churn: "var(--muted-foreground)",
};
