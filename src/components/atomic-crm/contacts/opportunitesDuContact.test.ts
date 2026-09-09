import { ordonnerOpportunites } from "./opportunitesDuContact";

const TERMINALES = ["closed-won", "lost", "churn"];

/** Une opportunité réduite à ce qui décide de l'ordre. */
const opp = (
  id: string,
  stage: string,
  updated_at?: string | null,
) => ({ id, stage, updated_at });

const ids = (liste: { id: string }[]) => liste.map((o) => o.id);

describe("ordonnerOpportunites — les ouvertes d'abord", () => {
  it("place une affaire ouverte devant une affaire gagnée plus récente", () => {
    /*
     * Le cas qui justifie tout le module : le raccourci sert à reprendre un
     * travail en cours. Trier sur la seule date de modification enverrait sur
     * une affaire close hier plutôt que sur celle qu'il reste à faire.
     */
    const range = ordonnerOpportunites(
      [
        opp("gagnee", "closed-won", "2026-09-08T10:00:00Z"),
        opp("en-cours", "qualified", "2026-03-01T10:00:00Z"),
      ],
      TERMINALES,
    );
    expect(ids(range)).toEqual(["en-cours", "gagnee"]);
  });

  it("traite lost et churn comme closes, au même titre que closed-won", () => {
    const range = ordonnerOpportunites(
      [
        opp("perdue", "lost", "2026-09-08T10:00:00Z"),
        opp("churn", "churn", "2026-09-08T11:00:00Z"),
        opp("demo", "demo", "2026-01-01T10:00:00Z"),
      ],
      TERMINALES,
    );
    expect(ids(range)[0]).toBe("demo");
  });

  it("compte une étape inconnue comme ouverte", () => {
    /*
     * Les slugs ont déjà changé deux fois — « demo-poc » découpé, puis
     * « negociation » retiré. Reléguer au fond une affaire vivante parce que
     * son étape porte un ancien nom est un vrai dommage ; remonter une affaire
     * close d'un rang ne coûte qu'un clic.
     */
    const range = ordonnerOpportunites(
      [
        opp("gagnee", "closed-won", "2026-09-08T10:00:00Z"),
        opp("ancienne-etape", "negociation", "2026-01-01T10:00:00Z"),
      ],
      TERMINALES,
    );
    expect(ids(range)).toEqual(["ancienne-etape", "gagnee"]);
  });
});

describe("ordonnerOpportunites — à statut égal, la plus récente", () => {
  it("classe deux affaires ouvertes par date de modification décroissante", () => {
    const range = ordonnerOpportunites(
      [
        opp("vieille", "lead", "2026-01-01T10:00:00Z"),
        opp("recente", "poc", "2026-09-01T10:00:00Z"),
        opp("moyenne", "demo", "2026-05-01T10:00:00Z"),
      ],
      TERMINALES,
    );
    expect(ids(range)).toEqual(["recente", "moyenne", "vieille"]);
  });

  it("classe aussi les closes entre elles", () => {
    const range = ordonnerOpportunites(
      [
        opp("perdue-vieille", "lost", "2025-01-01T10:00:00Z"),
        opp("gagnee-recente", "closed-won", "2026-08-01T10:00:00Z"),
      ],
      TERMINALES,
    );
    expect(ids(range)).toEqual(["gagnee-recente", "perdue-vieille"]);
  });

  it("ne fait pas remonter en tête une date absente ou illisible", () => {
    // `Date.parse` rend `NaN`, qui perd toutes les comparaisons dans les deux
    // sens : sans garde, l'ordre dépendrait de la position de départ.
    const range = ordonnerOpportunites(
      [
        opp("sans-date", "lead", null),
        opp("datee", "lead", "2026-01-01T10:00:00Z"),
        opp("illisible", "lead", "pas une date"),
      ],
      TERMINALES,
    );
    expect(ids(range)[0]).toBe("datee");
  });
});

describe("ordonnerOpportunites — les cas limites", () => {
  it("rend une liste vide sur une liste vide", () => {
    expect(ordonnerOpportunites([], TERMINALES)).toEqual([]);
  });

  it("laisse passer le cas le plus fréquent : une seule opportunité", () => {
    // 307 contacts sur 516 en production.
    const range = ordonnerOpportunites([opp("seule", "qualified")], TERMINALES);
    expect(ids(range)).toEqual(["seule"]);
  });

  it("ne modifie pas le tableau reçu", () => {
    /*
     * Il vient du cache de React Query, partagé avec les autres écrans qui
     * lisent la même requête. Trier en place les réordonnerait au passage.
     */
    const entree = [
      opp("gagnee", "closed-won", "2026-09-08T10:00:00Z"),
      opp("ouverte", "lead", "2026-01-01T10:00:00Z"),
    ];
    const avant = ids(entree);
    ordonnerOpportunites(entree, TERMINALES);
    expect(ids(entree)).toEqual(avant);
  });

  it("sans étape terminale déclarée, tout est ouvert et seul l'âge compte", () => {
    const range = ordonnerOpportunites(
      [
        opp("vieille", "closed-won", "2025-01-01T10:00:00Z"),
        opp("recente", "lost", "2026-09-01T10:00:00Z"),
      ],
      [],
    );
    expect(ids(range)).toEqual(["recente", "vieille"]);
  });
});
