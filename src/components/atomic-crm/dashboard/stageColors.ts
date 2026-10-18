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
 * ## La palette, choisie par Simon (NOS-1430, revue le 18/10/2026)
 *
 * D'abord « gris, bleu, vert, violet, rouge » — une teinte par étape ouverte,
 * dans l'ordre du tunnel. Le noir de sa liste revenait à « Négociation »,
 * retirée du pipeline par la même demande.
 *
 * Le rouge n'a pas tenu. Il était sur « Proposition », et la carte de France
 * l'a rendu intenable : « je veux que tu ajoutes les lost en rouge, les POC en
 * vert, et les propositions en vert aussi ». Sur une pastille qui mélange les
 * étapes d'une ville, une part rouge se lit comme une affaire perdue — c'est
 * le risque que le commentaire précédent annonçait, et il s'est réalisé.
 *
 * Depuis, **le rouge appartient à la perte et à elle seule**, et la fin du
 * tunnel est une famille de VERTS qui fonce à mesure qu'on approche de la
 * signature : démo clair, POC moyen, proposition profond. Trois verts et non
 * un seul parce qu'un anneau qui mélange les trois doit rester lisible ; Simon
 * a demandé du vert, pas l'impossibilité de distinguer une démo d'une
 * proposition. La teinte de « Démo » a donc bougé d'un cran pour que la
 * progression aille dans le bon sens.
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
  demo: "#6ec8a0",
  poc: "#2f9e6e",
  proposal: "#146b47",
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
