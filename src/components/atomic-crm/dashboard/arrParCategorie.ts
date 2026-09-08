import type { DealStage, LabeledValue } from "../types";

/**
 * ---------------------------------------------------------------------------
 * L'ARR par catégorie de clientèle, et son avancement (NOS-1401)
 * ---------------------------------------------------------------------------
 * Simon, le 08/09/2026 : « ajoute un tableau qui donne l'ARR par catégorie, et
 * tu mets des diagrammes en barre en pourcentage par étapes des leads ».
 *
 * Le tableau de bord disait où en était le pipeline dans son ensemble, jamais
 * de quoi il était fait. Or les seize catégories ne se travaillent pas pareil :
 * un hôpital est un cycle long à gros ARR, un cabinet une signature rapide à
 * petit montant. Un pipeline de 900 k€ concentré sur trois hôpitaux ne raconte
 * pas la même histoire que le même total réparti sur quarante cabinets.
 *
 * ## Deux lectures dans un seul tableau
 *
 * Le montant répond à « où est l'argent » ; la barre répond à « où en est-on »
 * — la répartition des opportunités de cette catégorie entre les étapes, en
 * pourcentage. Une catégorie riche mais entièrement en Lead est un espoir ;
 * la même en Négociation est une prévision.
 *
 * Le pourcentage porte sur le NOMBRE d'opportunités, pas sur l'ARR. Sur des
 * lots de trois à cinq affaires, une seule à 200 k€ écraserait la barre et
 * ferait lire « tout est en négociation » là où une affaire sur cinq l'est.
 *
 * ## Seules les affaires ouvertes
 *
 * Close Won, Lost et Churn en sont exclus. Mélanger le signé au prospectif
 * dans une colonne « ARR » produirait un total que personne ne saurait
 * interpréter — ni une prévision, ni un réalisé.
 */

export interface DealPourCategorie {
  category?: string | null;
  stage?: string | null;
  amount?: number | null;
}

export interface PartEtape {
  stage: string;
  label: string;
  count: number;
  /** Part du nombre d'opportunités de la catégorie, 0 à 100. */
  pourcentage: number;
}

export interface LigneCategorie {
  category: string;
  label: string;
  /** Opportunités ouvertes de cette catégorie. */
  count: number;
  /** ARR cumulé, en euros. */
  arr: number;
  /** Part de l'ARR total du tableau, 0 à 100 — l'axe de lecture principal. */
  partArr: number;
  parEtape: PartEtape[];
}

/** Ce que le tableau affiche, et de quoi il est le total. */
export interface RepartitionCategories {
  lignes: LigneCategorie[];
  arrTotal: number;
  countTotal: number;
}

const VIDE: RepartitionCategories = { lignes: [], arrTotal: 0, countTotal: 0 };

/**
 * Le libellé « (non renseignée) », choisi plutôt que d'écarter ces lignes.
 *
 * 120 opportunités sur 236 n'ont aucune catégorie en production. Les masquer
 * donnerait un tableau qui ne totalise pas le pipeline affiché juste au-dessus,
 * et personne ne comprendrait l'écart. Les montrer nomme le travail de saisie
 * qui reste à faire.
 */
export const SANS_CATEGORIE = "__sans_categorie__";

export function computeArrParCategorie(
  deals: DealPourCategorie[],
  categories: LabeledValue[],
  stages: DealStage[],
  pipelineStatuses: string[],
): RepartitionCategories {
  const terminales = new Set(pipelineStatuses);
  const libelleCategorie = new Map(categories.map((c) => [c.value, c.label]));
  const libelleEtape = new Map(stages.map((s) => [s.value, s.label]));

  const ouvertes = deals.filter(
    (deal) => !deal.stage || !terminales.has(deal.stage),
  );
  if (ouvertes.length === 0) return VIDE;

  const parCategorie = new Map<
    string,
    { count: number; arr: number; etapes: Map<string, number> }
  >();

  for (const deal of ouvertes) {
    const cle = deal.category || SANS_CATEGORIE;
    let entree = parCategorie.get(cle);
    if (!entree) {
      entree = { count: 0, arr: 0, etapes: new Map() };
      parCategorie.set(cle, entree);
    }
    entree.count += 1;
    entree.arr += typeof deal.amount === "number" ? deal.amount : 0;
    const etape = deal.stage ?? "";
    if (etape) entree.etapes.set(etape, (entree.etapes.get(etape) ?? 0) + 1);
  }

  const arrTotal = [...parCategorie.values()].reduce((t, e) => t + e.arr, 0);
  const countTotal = [...parCategorie.values()].reduce((t, e) => t + e.count, 0);

  const lignes: LigneCategorie[] = [...parCategorie.entries()].map(
    ([category, entree]) => ({
      category,
      label:
        category === SANS_CATEGORIE
          ? "(non renseignée)"
          : (libelleCategorie.get(category) ?? category),
      count: entree.count,
      arr: entree.arr,
      partArr: arrTotal > 0 ? (entree.arr / arrTotal) * 100 : 0,
      /*
       * Les étapes dans l'ordre du pipeline, pas dans celui où les
       * opportunités ont été rencontrées : la barre doit se lire de gauche à
       * droite comme le tunnel de vente, sinon sa forme ne veut rien dire.
       */
      parEtape: stages
        .filter((s) => (entree.etapes.get(s.value) ?? 0) > 0)
        .map((s) => {
          const count = entree.etapes.get(s.value) ?? 0;
          return {
            stage: s.value,
            label: libelleEtape.get(s.value) ?? s.value,
            count,
            pourcentage: (count / entree.count) * 100,
          };
        }),
    }),
  );

  /*
   * Du plus gros ARR au plus petit, et la catégorie non renseignée toujours en
   * dernier : c'est une dette de saisie, pas un segment de marché, et la
   * laisser remonter en tête ferait passer un manque pour une priorité.
   */
  lignes.sort((a, b) => {
    if (a.category === SANS_CATEGORIE) return 1;
    if (b.category === SANS_CATEGORIE) return -1;
    return b.arr - a.arr || a.label.localeCompare(b.label, "fr");
  });

  return { lignes, arrTotal, countTotal };
}
