import {
  type OpportuniteExistante,
  aDesDoublons,
  detecterDoublons,
  resumerDoublons,
} from "./doublonOpportunite";

const TERMINALES = ["closed-won", "lost", "churn"];
const options = { pipelineStatuses: TERMINALES };

const opp = (
  over: Partial<OpportuniteExistante> & { id: number },
): OpportuniteExistante => ({
  name: "Une affaire",
  stage: "qualified",
  amount: 12000,
  company_id: 1,
  contact_ids: [],
  ...over,
});

describe("detecterDoublons — la même société", () => {
  it("signale une opportunité ouverte sur la société choisie", () => {
    const doublons = detecterDoublons(
      [opp({ id: 1, company_id: 7, name: "Oxance — appel sortant" })],
      7,
      [],
      options,
    );
    expect(doublons.parSociete.map((d) => d.id)).toEqual([1]);
    expect(aDesDoublons(doublons)).toBe(true);
  });

  it("ignore une société différente", () => {
    const doublons = detecterDoublons([opp({ id: 1, company_id: 9 })], 7, [], options);
    expect(aDesDoublons(doublons)).toBe(false);
  });

  it("compare les identifiants sans se soucier de leur type", () => {
    // Les listes rendent des identifiants tantôt nombres, tantôt chaînes.
    const doublons = detecterDoublons([opp({ id: 1, company_id: "7" })], 7, [], options);
    expect(doublons.parSociete).toHaveLength(1);
  });
});

describe("detecterDoublons — ce qui n'est PAS un doublon", () => {
  it("écarte les affaires closes, qui sont de l'historique", () => {
    /*
     * Une affaire gagnée l'an dernier chez le même client n'est pas un
     * doublon. La signaler transformerait l'alerte en bruit de fond — et une
     * alerte qu'on apprend a ignorer ne protege plus de rien.
     */
    for (const stage of TERMINALES) {
      const doublons = detecterDoublons(
        [opp({ id: 1, company_id: 7, stage })],
        7,
        [],
        options,
      );
      expect(aDesDoublons(doublons)).toBe(false);
    }
  });

  it("ne signale jamais l'opportunité qu'on est en train de modifier", () => {
    // Sans cette garde, ouvrir une fiche existante s'avertirait elle-même.
    const doublons = detecterDoublons([opp({ id: 42, company_id: 7 })], 7, [], {
      ...options,
      dealActuelId: 42,
    });
    expect(aDesDoublons(doublons)).toBe(false);
  });

  it("ne dit rien tant que rien n'est choisi", () => {
    expect(aDesDoublons(detecterDoublons([opp({ id: 1 })], null, [], options))).toBe(
      false,
    );
    expect(
      aDesDoublons(detecterDoublons([opp({ id: 1 })], undefined, null, options)),
    ).toBe(false);
  });
});

describe("detecterDoublons — le contact partagé", () => {
  it("signale un contact déjà suivi sur une AUTRE société", () => {
    /*
     * Le signal le plus intéressant : le même interlocuteur sur deux sociétés
     * révèle soit un doublon de société, soit un contact mal rattaché.
     */
    const doublons = detecterDoublons(
      [opp({ id: 1, company_id: 99, contact_ids: [5, 6] })],
      7,
      [5],
      options,
    );
    expect(doublons.parSociete).toHaveLength(0);
    expect(doublons.parContact.map((d) => d.id)).toEqual([1]);
  });

  it("ne compte pas deux fois une opportunité qui coche les deux critères", () => {
    // Même société ET même contact : une seule ligne, sous « société ».
    const doublons = detecterDoublons(
      [opp({ id: 1, company_id: 7, contact_ids: [5] })],
      7,
      [5],
      options,
    );
    expect(doublons.parSociete).toHaveLength(1);
    expect(doublons.parContact).toHaveLength(0);
  });

  it("ignore une opportunité sans contact commun", () => {
    const doublons = detecterDoublons(
      [opp({ id: 1, company_id: 99, contact_ids: [8, 9] })],
      7,
      [5],
      options,
    );
    expect(aDesDoublons(doublons)).toBe(false);
  });

  it("tolère un `contact_ids` absent", () => {
    const doublons = detecterDoublons(
      [opp({ id: 1, company_id: 99, contact_ids: null })],
      7,
      [5],
      options,
    );
    expect(aDesDoublons(doublons)).toBe(false);
  });
});

describe("resumerDoublons", () => {
  it("nomme ce qui est trouvé plutôt que d'avertir dans le vide", () => {
    // « attention, doublon possible » oblige a chercher soi-meme.
    const doublons = detecterDoublons(
      [opp({ id: 1, company_id: 7 }), opp({ id: 2, company_id: 7 })],
      7,
      [],
      options,
    );
    expect(resumerDoublons(doublons, "Oxance")).toBe(
      "« Oxance » a déjà 2 opportunités ouvertes.",
    );
  });

  it("accorde le singulier", () => {
    const doublons = detecterDoublons([opp({ id: 1, company_id: 7 })], 7, [], options);
    expect(resumerDoublons(doublons, "Oxance")).toBe(
      "« Oxance » a déjà 1 opportunité ouverte.",
    );
  });

  it("se passe du nom de société quand il manque", () => {
    const doublons = detecterDoublons([opp({ id: 1, company_id: 7 })], 7, [], options);
    expect(resumerDoublons(doublons)).toContain("Cette société");
  });

  it("combine les deux motifs en une phrase", () => {
    const doublons = detecterDoublons(
      [
        opp({ id: 1, company_id: 7 }),
        opp({ id: 2, company_id: 99, contact_ids: [5] }),
      ],
      7,
      [5],
      options,
    );
    expect(resumerDoublons(doublons, "Oxance")).toBe(
      "« Oxance » a déjà 1 opportunité ouverte, et un contact choisi suit déjà une opportunité ailleurs.",
    );
  });
});
