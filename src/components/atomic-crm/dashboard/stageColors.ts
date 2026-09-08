/**
 * Une teinte par étape, partagée par tous les écrans qui en dessinent.
 *
 * La table vivait en double, à l'identique, dans `PipelineFunnel` et
 * `DealColumn` — un dégradé recopié à la main qu'il a fallu modifier deux fois
 * lors du redécoupage de « Démo / POC ». Le troisième consommateur, les barres
 * de `CategoryBreakdown`, a fait pencher la balance : une même étape garde sa
 * couleur du kanban à l'entonnoir au tableau, sinon chaque graphique demande un
 * effort de traduction.
 *
 * ## La palette, choisie par Simon (NOS-1430)
 *
 * « change les couleurs : gris, bleu, vert, violet, rouge » — une par étape
 * ouverte, dans l'ordre du tunnel. Le noir de sa liste revenait à
 * « Négociation », retirée du pipeline par la même demande.
 *
 * Ce sont des teintes distinctes des jetons sémantiques `--deal-status-won` et
 * `--deal-status-lost`, volontairement : le vert et le rouge de la palette
 * qualifient une étape du parcours, pas une issue. Les confondre ferait lire
 * « Proposition » comme une affaire perdue.
 *
 * Chaque valeur est un hexadécimal fixe plutôt qu'une variable de thème : la
 * palette est un choix éditorial de Simon, et la faire dépendre du thème clair
 * ou sombre la ferait dériver de ce qu'il a demandé. Les deux issues, elles,
 * gardent leurs jetons — leur sens ne change pas avec la mode.
 */
export const STAGE_COLORS: Record<string, string> = {
  "a-reclasser": "var(--muted-foreground)",
  lead: "#8a8f98",
  qualified: "#2a78d6",
  demo: "#2f9e6e",
  poc: "#7c5cd6",
  proposal: "#d6453f",
  // Les deux issues gardent leur sémantique : vert = acquis, rouge = perdu.
  // Elles ne font pas partie de la palette du tunnel.
  "closed-won": "var(--deal-status-won)",
  lost: "var(--deal-status-lost)",
  // Churn est une perte, mais après signature : neutre plutôt que rouge, pour
  // ne pas la confondre avec une affaire jamais gagnée.
  churn: "var(--muted-foreground)",
  /*
   * « Négociation » a quitté le pipeline le 08/09/2026 (NOS-1430) : aucune
   * opportunité ne l'a jamais portée, et son historique était vide. La teinte
   * reste ici pour que le journal des changements sache encore la dessiner si
   * une ligne égarée la mentionne.
   */
  negociation: "#1f2328",
};
