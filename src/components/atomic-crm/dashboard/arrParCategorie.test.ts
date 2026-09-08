import type { DealStage, LabeledValue } from "../types";
import {
  SANS_CATEGORIE,
  type DealPourCategorie,
  computeArrParCategorie,
} from "./arrParCategorie";

const CATEGORIES: LabeledValue[] = [
  { value: "hopital", label: "Hôpital" },
  { value: "cabinet", label: "Cabinet" },
  { value: "scm", label: "SCM" },
];

const STAGES: DealStage[] = [
  { value: "lead", label: "Lead" },
  { value: "qualified", label: "Qualifié" },
  { value: "negociation", label: "Négociation" },
  { value: "closed-won", label: "Close Won" },
  { value: "lost", label: "Lost" },
];

const TERMINALES = ["closed-won", "lost", "churn"];

const deal = (over: Partial<DealPourCategorie> = {}): DealPourCategorie => ({
  category: "hopital",
  stage: "lead",
  amount: 10000,
  ...over,
});

const calcul = (deals: DealPourCategorie[]) =>
  computeArrParCategorie(deals, CATEGORIES, STAGES, TERMINALES);

describe("computeArrParCategorie — les montants", () => {
  it("cumule l'ARR par catégorie", () => {
    const r = calcul([
      deal({ category: "hopital", amount: 30000 }),
      deal({ category: "hopital", amount: 20000 }),
      deal({ category: "cabinet", amount: 5000 }),
    ]);
    expect(r.arrTotal).toBe(55000);
    expect(r.lignes.map((l) => [l.label, l.arr])).toEqual([
      ["Hôpital", 50000],
      ["Cabinet", 5000],
    ]);
  });

  it("classe du plus gros ARR au plus petit", () => {
    // C'est la question que le tableau répond en premier : où est l'argent.
    const r = calcul([
      deal({ category: "cabinet", amount: 5000 }),
      deal({ category: "scm", amount: 40000 }),
      deal({ category: "hopital", amount: 20000 }),
    ]);
    expect(r.lignes.map((l) => l.label)).toEqual(["SCM", "Hôpital", "Cabinet"]);
  });

  it("donne la part de chaque catégorie dans le total", () => {
    const r = calcul([
      deal({ category: "hopital", amount: 75000 }),
      deal({ category: "cabinet", amount: 25000 }),
    ]);
    expect(r.lignes[0].partArr).toBeCloseTo(75, 5);
    expect(r.lignes[1].partArr).toBeCloseTo(25, 5);
  });

  it("tolère une opportunité sans montant", () => {
    // Elle compte dans l'effectif, pas dans l'ARR : c'est la même convention
    // que le reste du tableau de bord.
    const r = calcul([
      deal({ amount: null }),
      deal({ amount: undefined }),
      deal({ amount: 10000 }),
    ]);
    expect(r.lignes[0].arr).toBe(10000);
    expect(r.lignes[0].count).toBe(3);
  });
});

describe("computeArrParCategorie — ce qui est écarté", () => {
  it("exclut les affaires closes", () => {
    /*
     * Mélanger le signé au prospectif dans une colonne « ARR » produirait un
     * total que personne ne saurait interpréter — ni une prévision, ni un
     * réalisé.
     */
    const r = calcul([
      deal({ stage: "closed-won", amount: 99000 }),
      deal({ stage: "lost", amount: 88000 }),
      deal({ stage: "lead", amount: 10000 }),
    ]);
    expect(r.arrTotal).toBe(10000);
    expect(r.countTotal).toBe(1);
  });

  it("rend un tableau vide quand rien n'est ouvert", () => {
    const r = calcul([deal({ stage: "closed-won" })]);
    expect(r.lignes).toEqual([]);
    expect(r.arrTotal).toBe(0);
  });
});

describe("computeArrParCategorie — la catégorie manquante", () => {
  it("la montre plutôt que de l'écarter", () => {
    /*
     * 120 opportunités sur 236 n'ont aucune catégorie en production. Les
     * masquer donnerait un tableau qui ne totalise pas le pipeline affiché
     * juste au-dessus, et personne ne comprendrait l'écart.
     */
    const r = calcul([
      deal({ category: null, amount: 40000 }),
      deal({ category: "hopital", amount: 10000 }),
    ]);
    expect(r.arrTotal).toBe(50000);
    const sans = r.lignes.find((l) => l.category === SANS_CATEGORIE);
    expect(sans?.label).toBe("(non renseignée)");
    expect(sans?.arr).toBe(40000);
  });

  it("la range en dernier, même quand elle pèse le plus lourd", () => {
    // C'est une dette de saisie, pas un segment de marché : la laisser remonter
    // en tête ferait passer un manque pour une priorité.
    const r = calcul([
      deal({ category: null, amount: 90000 }),
      deal({ category: "hopital", amount: 10000 }),
    ]);
    expect(r.lignes.map((l) => l.category)).toEqual([
      "hopital",
      SANS_CATEGORIE,
    ]);
  });

  it("traite la chaîne vide comme une absence", () => {
    const r = calcul([deal({ category: "" })]);
    expect(r.lignes[0].category).toBe(SANS_CATEGORIE);
  });
});

describe("computeArrParCategorie — la barre par étape", () => {
  it("répartit en pourcentage du NOMBRE d'opportunités", () => {
    /*
     * Sur des lots de trois à cinq affaires, une seule à 200 k€ écraserait une
     * barre pondérée par l'ARR et ferait lire « tout est en négociation » là
     * où une affaire sur quatre l'est.
     */
    const r = calcul([
      deal({ stage: "lead", amount: 1000 }),
      deal({ stage: "lead", amount: 1000 }),
      deal({ stage: "lead", amount: 1000 }),
      deal({ stage: "negociation", amount: 200000 }),
    ]);
    const parts = r.lignes[0].parEtape;
    expect(parts.map((p) => [p.label, Math.round(p.pourcentage)])).toEqual([
      ["Lead", 75],
      ["Négociation", 25],
    ]);
  });

  it("suit l'ordre du pipeline, pas celui des données", () => {
    // La barre doit se lire de gauche à droite comme le tunnel de vente,
    // sinon sa forme ne veut rien dire.
    const r = calcul([
      deal({ stage: "negociation" }),
      deal({ stage: "lead" }),
      deal({ stage: "qualified" }),
    ]);
    expect(r.lignes[0].parEtape.map((p) => p.stage)).toEqual([
      "lead",
      "qualified",
      "negociation",
    ]);
  });

  it("n'affiche pas les étapes vides", () => {
    // Une barre découpée en cinq segments dont trois à zéro se lit mal.
    const r = calcul([deal({ stage: "lead" })]);
    expect(r.lignes[0].parEtape).toHaveLength(1);
    expect(r.lignes[0].parEtape[0].pourcentage).toBe(100);
  });

  it("totalise toujours 100 % par catégorie", () => {
    const r = calcul([
      deal({ category: "hopital", stage: "lead" }),
      deal({ category: "hopital", stage: "qualified" }),
      deal({ category: "hopital", stage: "negociation" }),
      deal({ category: "cabinet", stage: "lead" }),
    ]);
    for (const ligne of r.lignes) {
      const somme = ligne.parEtape.reduce((t, p) => t + p.pourcentage, 0);
      expect(somme).toBeCloseTo(100, 5);
    }
  });

  it("ignore une étape inconnue de la configuration", () => {
    // `partenariats` et consorts vivent encore en base sans être des étapes
    // commerciales : les afficher inventerait un segment que le pipeline n'a
    // pas. L'opportunité compte toujours dans l'effectif et l'ARR.
    const r = calcul([
      deal({ stage: "partenariats", amount: 5000 }),
      deal({ stage: "lead", amount: 5000 }),
    ]);
    expect(r.lignes[0].count).toBe(2);
    expect(r.lignes[0].arr).toBe(10000);
    expect(r.lignes[0].parEtape.map((p) => p.stage)).toEqual(["lead"]);
  });
});
