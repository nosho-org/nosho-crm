import { estOuverte, opportunitesOuvertes } from "./opportunitesDuContact";

const TERMINALES = ["closed-won", "lost", "churn"];

/** Une opportunité réduite à ce qui décide de sa présence et de son rang. */
const opp = (
  id: string,
  stage: string,
  updated_at?: string | null,
  archived_at?: string | null,
) => ({ id, stage, updated_at, archived_at });

const ids = (liste: { id: string }[]) => liste.map((o) => o.id);

describe("estOuverte — deux façons de ne plus l'être", () => {
  it("une étape terminale ferme l'opportunité", () => {
    for (const terminale of TERMINALES) {
      expect(estOuverte(opp("x", terminale), TERMINALES)).toBe(false);
    }
  });

  it("l'archivage ferme aussi, à n'importe quelle étape", () => {
    /*
     * Les deux critères ne se recouvrent pas : une affaire rangée reste
     * souvent au stade « Lead » — c'est justement pour cela qu'on l'a rangée.
     * Ne tester que l'étape la laisserait passer pour vivante.
     */
    expect(
      estOuverte(opp("x", "lead", "2026-09-01T10:00:00Z", "2026-09-02T10:00:00Z"), TERMINALES),
    ).toBe(false);
  });

  it("une étape courante sans archivage est ouverte", () => {
    for (const etape of ["lead", "qualified", "demo", "poc", "proposal"]) {
      expect(estOuverte(opp("x", etape), TERMINALES)).toBe(true);
    }
  });

  it("compte une étape inconnue comme ouverte", () => {
    /*
     * Les slugs ont déjà changé deux fois — « demo-poc » découpé, puis
     * « negociation » retiré. Faire disparaître une affaire vivante parce que
     * son étape porte un ancien nom est un dommage réel.
     */
    expect(estOuverte(opp("x", "negociation"), TERMINALES)).toBe(true);
    expect(estOuverte(opp("x", "demo-poc"), TERMINALES)).toBe(true);
  });
});

describe("opportunitesOuvertes — ce qui est écarté", () => {
  it("retire les affaires closes, même modifiées à l'instant", () => {
    // Le raccourci sert à reprendre un travail en cours, pas à rouvrir une
    // affaire gagnée il y a huit mois parce qu'on y a touché hier.
    const liste = opportunitesOuvertes(
      [
        opp("gagnee", "closed-won", "2026-09-09T10:00:00Z"),
        opp("en-cours", "qualified", "2026-03-01T10:00:00Z"),
      ],
      TERMINALES,
    );
    expect(ids(liste)).toEqual(["en-cours"]);
  });

  it("retire les affaires archivées", () => {
    const liste = opportunitesOuvertes(
      [
        opp("rangee", "poc", "2026-09-09T10:00:00Z", "2026-09-09T11:00:00Z"),
        opp("vivante", "lead", "2026-01-01T10:00:00Z"),
      ],
      TERMINALES,
    );
    expect(ids(liste)).toEqual(["vivante"]);
  });

  it("rend une liste vide quand rien n'est ouvert", () => {
    /*
     * 96 contacts sur 516 sont dans ce cas en production : ils ont des
     * opportunités, aucune ouverte. L'écran doit alors ne rien afficher, pas
     * afficher un bouton vide.
     */
    const liste = opportunitesOuvertes(
      [
        opp("perdue", "lost", "2026-09-01T10:00:00Z"),
        opp("rangee", "demo", "2026-09-01T10:00:00Z", "2026-09-02T10:00:00Z"),
      ],
      TERMINALES,
    );
    expect(liste).toEqual([]);
  });
});

describe("opportunitesOuvertes — l'ordre", () => {
  it("place la plus récemment modifiée en tête", () => {
    const liste = opportunitesOuvertes(
      [
        opp("vieille", "lead", "2026-01-01T10:00:00Z"),
        opp("recente", "poc", "2026-09-01T10:00:00Z"),
        opp("moyenne", "demo", "2026-05-01T10:00:00Z"),
      ],
      TERMINALES,
    );
    expect(ids(liste)).toEqual(["recente", "moyenne", "vieille"]);
  });

  it("ne fait pas remonter en tête une date absente ou illisible", () => {
    // `Date.parse` rend `NaN`, qui perd toutes les comparaisons dans les deux
    // sens : sans garde, l'ordre dépendrait de la position de départ.
    const liste = opportunitesOuvertes(
      [
        opp("sans-date", "lead", null),
        opp("datee", "lead", "2026-01-01T10:00:00Z"),
        opp("illisible", "lead", "pas une date"),
      ],
      TERMINALES,
    );
    expect(ids(liste)[0]).toBe("datee");
  });
});

describe("opportunitesOuvertes — les cas limites", () => {
  it("rend une liste vide sur une liste vide", () => {
    expect(opportunitesOuvertes([], TERMINALES)).toEqual([]);
  });

  it("laisse passer le cas le plus fréquent : une seule ouverte", () => {
    // 223 contacts sur 516 en production.
    const liste = opportunitesOuvertes([opp("seule", "qualified")], TERMINALES);
    expect(ids(liste)).toEqual(["seule"]);
  });

  it("ne modifie pas le tableau reçu", () => {
    /*
     * Il vient du cache de React Query, partagé avec les autres écrans qui
     * lisent la même requête. Trier en place les réordonnerait au passage.
     */
    const entree = [
      opp("vieille", "lead", "2026-01-01T10:00:00Z"),
      opp("recente", "lead", "2026-09-01T10:00:00Z"),
    ];
    const avant = ids(entree);
    opportunitesOuvertes(entree, TERMINALES);
    expect(ids(entree)).toEqual(avant);
  });

  it("sans étape terminale déclarée, seul l'archivage ferme encore", () => {
    const liste = opportunitesOuvertes(
      [
        opp("gagnee", "closed-won", "2026-01-01T10:00:00Z"),
        opp("rangee", "lead", "2026-09-01T10:00:00Z", "2026-09-02T10:00:00Z"),
      ],
      [],
    );
    expect(ids(liste)).toEqual(["gagnee"]);
  });
});
