import { placer, type Point } from "./geocoder";
import { villeDuTitre } from "./villeDuTitre";

/**
 * ---------------------------------------------------------------------------
 * Des opportunités aux pastilles de la carte
 * ---------------------------------------------------------------------------
 * Une pastille par VILLE, pas par opportunité : à Nice on en a vingt-cinq, et
 * vingt-cinq disques empilés au même endroit ne disent rien de plus qu'un seul
 * — ils disent même moins, puisqu'on ne peut plus les compter.
 *
 * ## La couleur ne tranche pas, elle répartit
 *
 * Simon : « un code couleur en fonction des leads, savoir s'il est en qualifié,
 * s'il est lost ou pas ». Sur une ville qui porte plusieurs affaires à des
 * étapes différentes, choisir UNE couleur demande de choisir laquelle ment le
 * moins — la dominante efface une proposition au milieu de neuf leads,
 * la plus avancée fait passer une ville pour mûre sur une seule affaire.
 *
 * On ne choisit donc pas : la pastille est un ANNEAU découpé par étape. Une
 * ville qui n'a qu'une étape rend un disque plein, ce qui est le cas de la
 * majorité ; les autres se lisent en un coup d'œil sans qu'on ait arbitré à la
 * place de qui regarde.
 *
 * ## Le rayon suit la RACINE du compte
 *
 * C'est la surface qu'on lit sur un disque, pas le rayon. Proportionner le
 * rayon au compte ferait d'une ville à neuf affaires une tache neuf fois trop
 * grosse, et les villes à une affaire disparaîtraient.
 */

/** Ce que l'agrégation a besoin de lire sur une opportunité. */
export interface AffaireLocalisable {
  id: string | number;
  name: string;
  stage: string;
  amount?: number | null;
  company_name?: string | null;
  /** Depuis `deals_summary`, qui expose déjà l'adresse de la société. */
  company_city?: string | null;
  company_zipcode?: string | null;
  /*
   * Ce qui suit ne sert pas à placer le point : c'est ce que l'infobulle
   * montre quand on clique dessus. Tout le reste de la fiche est à un clic,
   * et une infobulle qui recopierait l'opportunité entière ferait un
   * deuxième CRM dans une bulle.
   */
  priority?: string | null;
  sales_id?: string | number | null;
  expected_closing_date?: string | null;
  next_task_date?: string | null;
  next_task_text?: string | null;
}

/**
 * Une affaire posée sur la carte, et la façon dont elle y est arrivée.
 *
 * `deduite` vaut `true` quand le point ne vient pas d'une adresse mais du nom
 * de l'opportunité. Ce n'est pas un détail d'implémentation : la carte doit
 * pouvoir distinguer ce qu'elle sait de ce qu'elle suppose.
 */
export interface AffairePlacee extends AffaireLocalisable {
  deduite: boolean;
}

export interface PartDEtape {
  stage: string;
  nombre: number;
}

export interface Pastille {
  /** Clé stable : le point lui-même, arrondi comme l'index le porte. */
  cle: string;
  point: Point;
  /** Le libellé le plus fréquent parmi les villes qui tombent ici. */
  ville: string;
  nombre: number;
  /** Somme des ARR ; une affaire sans montant compte pour zéro. */
  arr: number;
  /** Trié comme les étapes de la configuration, pour que l'anneau soit lisible. */
  parEtape: PartDEtape[];
  affaires: AffairePlacee[];
  /** Combien de ces affaires ne doivent leur point qu'à leur intitulé. */
  deduites: number;
}

export interface Mapping {
  pastilles: Pastille[];
  /** Aucune adresse du tout : rien à placer, et rien à corriger non plus. */
  sansAdresse: AffaireLocalisable[];
  /** Une adresse existe, l'index ne la reconnaît pas. Celle-là se corrige. */
  nonPlacees: AffaireLocalisable[];
  /** Le plus gros compte, pour mettre les rayons à l'échelle. */
  maximum: number;
  /** Total des affaires placées d'après leur intitulé, toutes villes confondues. */
  deduites: number;
}

/**
 * Regroupe les affaires par point, et garde les orphelines à part — en DEUX
 * listes, parce que les deux cas ne se réparent pas pareil.
 *
 * ⚠️ **Ce qui n'est pas sur la carte est la moitié qui compte.** Mesuré le
 * 18/10/2026 : 145 des 446 opportunités ouvertes n'ont NI code postal NI ville.
 * Une carte qui les tairait montrerait les deux tiers restants comme si c'était
 * tout, et personne ne s'en apercevrait.
 *
 * ## Pourquoi deux listes et non une
 *
 * Écrit d'abord avec une seule, et la démonstration l'a démenti en trente
 * secondes : les sociétés de démonstration sont américaines, elles ont toutes
 * une ville et un code postal, et l'écran annonçait « 100 % n'ont ni code
 * postal ni ville ». Un message faux sur la seule chose que cet écran est
 * chargé de dire honnêtement.
 *
 * - **sans adresse** : il n'y a rien à corriger dans le CRM tant que personne
 *   n'a renseigné la société. C'est un travail de saisie.
 * - **non placée** : une adresse EST là et l'index ne la reconnaît pas —
 *   « Île-De-France » saisi dans le champ ville, un code postal étranger, une
 *   faute de frappe. C'est un travail de correction, et la liste nomme ce qui
 *   a été lu pour qu'on voie quoi corriger.
 *
 * ## Le repêchage par l'intitulé (Simon, 18/10/2026)
 *
 * « Celles qui ont un nom de ville dans leur titre, les mettre directement sur
 * la carte au niveau de la ville concernée. » Beaucoup de ces 145 affaires
 * portent le lieu dans leur nom — « CHU de Bordeaux », « IMRO Imagerie
 * Limoges ». Quand l'adresse ne donne rien, `villeDuTitre` est tenté, et il
 * récupère 28 affaires sur les 145.
 *
 * Ces points-là sont marqués `deduite`, et ils le restent jusqu'à l'écran :
 * pastille cerclée de pointillés, compte annoncé à part. Une déduction qui se
 * fond dans les faits est une erreur qu'on ne retrouve plus.
 */
export function agreger(
  affaires: AffaireLocalisable[],
  ordreDesEtapes: string[],
): Mapping {
  const parPoint = new Map<
    string,
    {
      point: Point;
      villes: Map<string, number>;
      affaires: AffairePlacee[];
    }
  >();
  const sansAdresse: AffaireLocalisable[] = [];
  const nonPlacees: AffaireLocalisable[] = [];

  for (const affaire of affaires) {
    const adresse = placer({
      zipcode: affaire.company_zipcode,
      city: affaire.company_city,
    });
    /*
     * L'adresse d'abord, l'intitulé seulement à défaut — jamais l'inverse.
     * Une société renseignée sait où elle est ; un nom d'opportunité est une
     * supposition, et une supposition ne doit pas écraser un fait.
     */
    const deduit = adresse ? null : villeDuTitre(affaire.name);
    const point = adresse ?? deduit?.point ?? null;
    if (!point) {
      const aQuelqueChose =
        Boolean((affaire.company_zipcode ?? "").trim()) ||
        Boolean((affaire.company_city ?? "").trim());
      (aQuelqueChose ? nonPlacees : sansAdresse).push(affaire);
      continue;
    }
    const cle = `${point.lat},${point.lng}`;
    let groupe = parPoint.get(cle);
    if (!groupe) {
      groupe = { point, villes: new Map(), affaires: [] };
      parPoint.set(cle, groupe);
    }
    groupe.affaires.push({ ...affaire, deduite: Boolean(deduit) });
    /*
     * Deux saisies peuvent désigner la même commune — « Aix En Provence » et
     * « AIX-EN-PROVENCE » tombent sur le même point. On affiche la forme la
     * plus fréquente plutôt que la première rencontrée : la première dépend de
     * l'ordre de tri, donc du filtre courant, et le libellé changerait sous
     * les yeux de qui filtre.
     */
    /*
     * Quand le point vient de l'intitule, le LIBELLE en vient aussi. Garder
     * la ville de la societe poserait une pastille a Bordeaux sous le nom
     * d'une ville que l'index n'a pas su placer — vu en recette le
     * 18/10/2026 : un point sur Bordeaux intitule « Daphneyfort ».
     */
    const ville = deduit ? deduit.nom : (affaire.company_city ?? "").trim();
    if (ville) groupe.villes.set(ville, (groupe.villes.get(ville) ?? 0) + 1);
  }

  const rang = new Map(ordreDesEtapes.map((etape, index) => [etape, index]));
  const pastilles: Pastille[] = [];

  for (const [cle, groupe] of parPoint) {
    const comptes = new Map<string, number>();
    let arr = 0;
    for (const affaire of groupe.affaires) {
      comptes.set(affaire.stage, (comptes.get(affaire.stage) ?? 0) + 1);
      arr += affaire.amount ?? 0;
    }
    const parEtape = [...comptes.entries()]
      .map(([stage, nombre]) => ({ stage, nombre }))
      // Une étape absente du référentiel passe en fin plutôt que d'être jetée :
      // la production en porte dix, à des étapes qui n'existent plus.
      .sort(
        (a, b) =>
          (rang.get(a.stage) ?? Number.MAX_SAFE_INTEGER) -
          (rang.get(b.stage) ?? Number.MAX_SAFE_INTEGER),
      );

    const villeDominante =
      [...groupe.villes.entries()].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
      )[0]?.[0] ?? "Ville inconnue";

    pastilles.push({
      cle,
      point: groupe.point,
      ville: villeDominante,
      nombre: groupe.affaires.length,
      arr,
      parEtape,
      affaires: groupe.affaires,
      deduites: groupe.affaires.filter((a) => a.deduite).length,
    });
  }

  /*
   * Les grosses pastilles d'abord dans le tableau, donc dessinées EN PREMIER,
   * donc SOUS les petites : une ville à une affaire posée sur une ville à
   * vingt reste cliquable. L'ordre de rendu d'un SVG est l'ordre du document,
   * il n'y a pas de `z-index` à poser.
   */
  pastilles.sort((a, b) => b.nombre - a.nombre);

  return {
    pastilles,
    sansAdresse,
    nonPlacees,
    maximum: pastilles.reduce((max, p) => Math.max(max, p.nombre), 0),
    deduites: pastilles.reduce((total, p) => total + p.deduites, 0),
  };
}

/** Rayon d'une pastille, en unités du dessin. */
export function rayon(nombre: number, maximum: number): number {
  const RAYON_MIN = 4;
  const RAYON_MAX = 22;
  if (maximum <= 1) return RAYON_MIN;
  // Racine : c'est la SURFACE qui se lit, pas le rayon.
  const part = Math.sqrt(nombre) / Math.sqrt(maximum);
  return RAYON_MIN + part * (RAYON_MAX - RAYON_MIN);
}

/**
 * Les arcs d'un anneau, en pourcentages cumulés.
 *
 * Rendus par `stroke-dasharray` sur un cercle plutôt que par des chemins
 * d'arc : pas de trigonométrie, pas de cas particulier à 100 %, et un seul
 * segment donne un cercle plein sans qu'on ait à le traiter à part.
 */
export function arcs(
  parEtape: PartDEtape[],
  total: number,
): { stage: string; part: number; depart: number }[] {
  let cumul = 0;
  return parEtape.map(({ stage, nombre }) => {
    const part = total > 0 ? nombre / total : 0;
    const depart = cumul;
    cumul += part;
    return { stage, part, depart };
  });
}
