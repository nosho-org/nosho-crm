import type { DealStage } from "../types";
import {
  type StageChangeRow,
  type WeekDeal,
  computePipelineWeek,
  debutDeSemaine,
  formatVariation,
} from "./pipelineWeek";

const STAGES: DealStage[] = [
  { value: "lead", label: "Lead" },
  { value: "qualified", label: "Qualifié" },
  { value: "demo", label: "Démo" },
  { value: "poc", label: "POC" },
  { value: "proposal", label: "Proposition" },
  { value: "negociation", label: "Négociation" },
  { value: "closed-won", label: "Close Won" },
  { value: "lost", label: "Lost" },
];

// Mercredi 9 septembre 2026, 10h. La semaine commence le lundi 7.
const MERCREDI = new Date(2026, 8, 9, 10, 0, 0);
const LUNDI = "2026-09-07T08:00:00Z";
const MARDI = "2026-09-08T08:00:00Z";
const SEMAINE_PASSEE = "2026-09-03T08:00:00Z";

const deal = (over: Partial<WeekDeal> & { id: number }): WeekDeal => ({
  stage: "lead",
  amount: 12000,
  // Par défaut, une opportunité ancienne : elle existait lundi matin.
  created_at: "2026-06-01T09:00:00Z",
  ...over,
});

const change = (
  over: Partial<StageChangeRow> & { deal_id: number },
): StageChangeRow => ({
  field: "stage",
  operation: "update",
  old_value: "lead",
  new_value: "qualified",
  changed_at: MARDI,
  source: "user",
  ...over,
});

describe("debutDeSemaine", () => {
  it("rend le lundi 00h locale", () => {
    const debut = debutDeSemaine(MERCREDI);
    expect(debut.getFullYear()).toBe(2026);
    expect(debut.getMonth()).toBe(8);
    expect(debut.getDate()).toBe(7);
    expect(debut.getHours()).toBe(0);
    expect(debut.getMinutes()).toBe(0);
  });

  it("ne recule pas d'une semaine quand on EST lundi", () => {
    const lundi = new Date(2026, 8, 7, 9, 0, 0);
    expect(debutDeSemaine(lundi).getDate()).toBe(7);
  });

  it("rattache le dimanche à la semaine qui s'achève", () => {
    // getDay() rend 0 le dimanche : sans correction, on sauterait au lundi
    // SUIVANT et toute la semaine deviendrait invisible le jour même.
    const dimanche = new Date(2026, 8, 13, 18, 0, 0);
    expect(debutDeSemaine(dimanche).getDate()).toBe(7);
  });

  it("passe correctement d'un mois à l'autre", () => {
    // Jeudi 1er octobre 2026 : le lundi est le 28 septembre.
    const jeudi = new Date(2026, 9, 1, 10, 0, 0);
    const debut = debutDeSemaine(jeudi);
    expect(debut.getMonth()).toBe(8);
    expect(debut.getDate()).toBe(28);
  });
});

describe("computePipelineWeek — entrées et variation sont deux choses", () => {
  it("distingue le flux du solde sur une étape traversée", () => {
    /*
     * Le point sur lequel Marc-Henri a insisté. Qualifié reçoit deux
     * opportunités et en perd une vers Démo : deux entrées, mais +1 de stock.
     * Un seul de ces deux chiffres ne raconte pas la semaine.
     */
    const deals = [
      deal({ id: 1, stage: "qualified" }),
      deal({ id: 2, stage: "qualified" }),
      deal({ id: 3, stage: "demo" }),
    ];
    const changements = [
      change({ deal_id: 1, old_value: "lead", new_value: "qualified" }),
      change({ deal_id: 2, old_value: "lead", new_value: "qualified" }),
      change({ deal_id: 3, old_value: "qualified", new_value: "demo" }),
    ];

    const semaine = computePipelineWeek(deals, changements, STAGES, MERCREDI);

    expect(semaine.parEtape.qualified.entrees).toBe(2);
    // Lundi matin : 1 et 2 en lead, 3 en qualifié. Aujourd'hui : 2 en qualifié.
    expect(semaine.parEtape.qualified.variation).toBe(1);
    expect(semaine.parEtape.lead.variation).toBe(-2);
    expect(semaine.parEtape.demo.entrees).toBe(1);
  });

  it("compte une entrée par passage, même aller-retour", () => {
    // Une opportunité repassée deux fois en Qualifié est bien entrée deux fois.
    const deals = [deal({ id: 1, stage: "qualified" })];
    const changements = [
      change({
        deal_id: 1,
        old_value: "lead",
        new_value: "qualified",
        changed_at: LUNDI,
      }),
      change({
        deal_id: 1,
        old_value: "qualified",
        new_value: "lead",
        changed_at: MARDI,
      }),
      change({
        deal_id: 1,
        old_value: "lead",
        new_value: "qualified",
        changed_at: "2026-09-09T08:00:00Z",
      }),
    ];

    const semaine = computePipelineWeek(deals, changements, STAGES, MERCREDI);

    expect(semaine.parEtape.qualified.entrees).toBe(2);
    // Mais elle était déjà en lead lundi matin, et est en qualifié : +1 / -1.
    expect(semaine.parEtape.qualified.variation).toBe(1);
    expect(semaine.parEtape.lead.variation).toBe(-1);
    // Et elle n'a bougé qu'une fois au sens du KPI.
    expect(semaine.kpis.ayantBouge).toBe(1);
  });

  it("laisse une étape immobile à zéro partout", () => {
    const semaine = computePipelineWeek(
      [deal({ id: 1, stage: "proposal" })],
      [],
      STAGES,
      MERCREDI,
    );
    expect(semaine.parEtape.proposal).toEqual({ entrees: 0, variation: 0 });
  });
});

describe("computePipelineWeek — ce qui ne doit pas compter", () => {
  it("ignore les changements de la semaine précédente", () => {
    const semaine = computePipelineWeek(
      [deal({ id: 1, stage: "qualified" })],
      [change({ deal_id: 1, changed_at: SEMAINE_PASSEE })],
      STAGES,
      MERCREDI,
    );
    expect(semaine.kpis.ayantBouge).toBe(0);
    expect(semaine.parEtape.qualified.entrees).toBe(0);
    // Sans changement dans la semaine, elle était déjà en qualifié lundi.
    expect(semaine.parEtape.qualified.variation).toBe(0);
  });

  it("ignore les reprises de migration, entrées ET reconstitution", () => {
    /*
     * Le piège que NOS-1377 aurait tendu. Le redécoupage « Démo / POC » a
     * écrit 14 lignes `demo-poc -> demo` en une seconde, avec
     * `source = 'migration'`.
     *
     * Sans le filtre, le lundi suivant aurait annoncé « 14 opportunités ayant
     * avancé » et « Démo + 14 vs W-1 » pour un pipeline où rien n'avait bougé.
     * Le filtre doit valoir aussi pour le REMBOBINAGE : sinon l'étape de lundi
     * serait `demo-poc`, qui n'existe plus, et Démo afficherait quand même +14.
     */
    const deals = [
      deal({ id: 1, stage: "demo" }),
      deal({ id: 2, stage: "demo" }),
    ];
    const changements = [
      change({
        deal_id: 1,
        old_value: "demo-poc",
        new_value: "demo",
        source: "migration",
      }),
      change({
        deal_id: 2,
        old_value: "demo-poc",
        new_value: "demo",
        source: "migration",
      }),
    ];

    const semaine = computePipelineWeek(deals, changements, STAGES, MERCREDI);

    expect(semaine.kpis.ayantBouge).toBe(0);
    expect(semaine.parEtape.demo.entrees).toBe(0);
    expect(semaine.parEtape.demo.variation).toBe(0);
  });

  it("ignore les changements d'un autre champ que l'étape", () => {
    const semaine = computePipelineWeek(
      [deal({ id: 1, stage: "lead" })],
      [
        change({
          deal_id: 1,
          field: "amount",
          old_value: "1000",
          new_value: "2000",
        }),
      ],
      STAGES,
      MERCREDI,
    );
    expect(semaine.kpis.ayantBouge).toBe(0);
  });

  it("résout un slug renommé écrit par un humain avant la migration", () => {
    /*
     * Défaut constaté en production le 06/09/2026, sur données réelles.
     *
     * Le redécoupage « Démo / POC » a eu lieu un dimanche ; l'opportunité 301
     * avait été déplacée vers `demo-poc` le mardi précédent, PAR UN HUMAIN.
     * Cette ligne décrit un vrai mouvement commercial, et le filtre `source`
     * ne la retire donc pas — mais sa destination n'existe plus.
     *
     * Sans résolution, l'entrée était perdue pendant que l'opportunité comptait
     * dans le stock actuel de Démo : le bloc affichait « + 2 vs W-1 » pour
     * « 1 entrée ». Un solde plus grand que son flux est impossible.
     */
    const semaine = computePipelineWeek(
      [deal({ id: 301, stage: "demo", created_at: "2026-06-01T09:00:00Z" })],
      [change({ deal_id: 301, old_value: "lead", new_value: "demo-poc" })],
      STAGES,
      MERCREDI,
      { "demo-poc": "demo" },
    );
    expect(semaine.parEtape.demo.entrees).toBe(1);
    expect(semaine.parEtape.demo.variation).toBe(1);
    // Et le flux ne peut jamais etre depasse par le solde.
    expect(semaine.parEtape.demo.variation).toBeLessThanOrEqual(
      semaine.parEtape.demo.entrees,
    );
  });

  it("résout aussi le slug renommé lors du rembobinage", () => {
    // Une opportunité qui ÉTAIT en `demo-poc` lundi est aujourd'hui en `demo` :
    // sans résolution, son stock de départ tomberait dans une étape inconnue et
    // Démo afficherait un gain qui n'a pas eu lieu.
    const semaine = computePipelineWeek(
      [deal({ id: 1, stage: "qualified", created_at: "2026-06-01T09:00:00Z" })],
      [change({ deal_id: 1, old_value: "demo-poc", new_value: "qualified" })],
      STAGES,
      MERCREDI,
      { "demo-poc": "demo" },
    );
    expect(semaine.parEtape.demo.variation).toBe(-1);
    expect(semaine.parEtape.qualified.entrees).toBe(1);
  });

  it("écarte une étape inconnue de la configuration", () => {
    // `partenariats` et consorts vivent encore en base sans être des étapes
    // commerciales : les compter gonflerait un tableau qui ne les affiche pas.
    const semaine = computePipelineWeek(
      [deal({ id: 1, stage: "partenariats" })],
      [
        change({
          deal_id: 1,
          old_value: "lead",
          new_value: "partenariats",
        }),
      ],
      STAGES,
      MERCREDI,
    );
    expect(semaine.parEtape.lead.variation).toBe(-1);
    expect(Object.keys(semaine.parEtape)).not.toContain("partenariats");
  });
});

describe("computePipelineWeek — les opportunités nées cette semaine", () => {
  it("les compte en entrée sans les compter dans le stock de lundi", () => {
    const semaine = computePipelineWeek(
      [deal({ id: 1, stage: "lead", created_at: MARDI })],
      [],
      STAGES,
      MERCREDI,
    );
    expect(semaine.kpis.nouveauxLeads).toBe(1);
    expect(semaine.parEtape.lead.entrees).toBe(1);
    // Elle n'existait pas lundi : la variation doit voir un gain, pas zéro.
    expect(semaine.parEtape.lead.variation).toBe(1);
  });

  it("retrouve l'étape de naissance d'une opportunité déjà déplacée", () => {
    /*
     * C'est ce raisonnement qui rend inutile le backfill des 75 opportunités
     * sans ligne de création : née en lead puis passée en qualifié le
     * lendemain, elle a bien produit une entrée dans CHAQUE étape, et
     * l'ancienne valeur de son premier changement suffit à le savoir.
     */
    const semaine = computePipelineWeek(
      [deal({ id: 1, stage: "qualified", created_at: LUNDI })],
      [
        change({
          deal_id: 1,
          old_value: "lead",
          new_value: "qualified",
          changed_at: MARDI,
        }),
      ],
      STAGES,
      MERCREDI,
    );
    expect(semaine.parEtape.lead.entrees).toBe(1);
    expect(semaine.parEtape.qualified.entrees).toBe(1);
    // Absente lundi matin : lead ne doit pas descendre en négatif.
    expect(semaine.parEtape.lead.variation).toBe(0);
    expect(semaine.parEtape.qualified.variation).toBe(1);
  });

  it("préfère `entered_at` à `created_at`", () => {
    // La date d'entrée est saisie par le commercial ; la date de création est
    // celle où la fiche a été tapée. Une reprise d'historique les sépare.
    const semaine = computePipelineWeek(
      [deal({ id: 1, entered_at: "2026-03-01", created_at: MARDI })],
      [],
      STAGES,
      MERCREDI,
    );
    expect(semaine.kpis.nouveauxLeads).toBe(0);
  });
});

describe("computePipelineWeek — les 4 KPI de la semaine", () => {
  it("compte un passage en Lost comme un mouvement (arbitrage de Simon)", () => {
    /*
     * J'avais recommandé l'inverse : une perte n'est pas une avancée. Simon a
     * tranché « oui », et la question posée est « où le pipeline bouge-t-il » —
     * une affaire perdue a bougé. Ce test verrouille SON choix, pas le mien.
     */
    const semaine = computePipelineWeek(
      [deal({ id: 1, stage: "lost", amount: 12000 })],
      [change({ deal_id: 1, old_value: "qualified", new_value: "lost" })],
      STAGES,
      MERCREDI,
    );
    expect(semaine.kpis.ayantBouge).toBe(1);
    expect(semaine.kpis.lost).toEqual({ count: 1, amount: 12000 });
  });

  it("ne compte qu'une fois une opportunité déplacée deux fois", () => {
    const semaine = computePipelineWeek(
      [deal({ id: 1, stage: "demo" })],
      [
        change({
          deal_id: 1,
          old_value: "lead",
          new_value: "qualified",
          changed_at: LUNDI,
        }),
        change({
          deal_id: 1,
          old_value: "qualified",
          new_value: "demo",
          changed_at: MARDI,
        }),
      ],
      STAGES,
      MERCREDI,
    );
    expect(semaine.kpis.ayantBouge).toBe(1);
  });

  it("additionne l'ARR gagné et perdu de la semaine", () => {
    const deals = [
      deal({ id: 1, stage: "closed-won", amount: 18000 }),
      deal({ id: 2, stage: "closed-won", amount: 10000 }),
      deal({ id: 3, stage: "lost", amount: 12000 }),
    ];
    const changements = [
      change({ deal_id: 1, old_value: "negociation", new_value: "closed-won" }),
      change({ deal_id: 2, old_value: "proposal", new_value: "closed-won" }),
      change({ deal_id: 3, old_value: "demo", new_value: "lost" }),
    ];

    const semaine = computePipelineWeek(deals, changements, STAGES, MERCREDI);

    expect(semaine.kpis.won).toEqual({ count: 2, amount: 28000 });
    expect(semaine.kpis.lost).toEqual({ count: 1, amount: 12000 });
    expect(semaine.kpis.ayantBouge).toBe(3);
  });

  it("ne compte pas deux fois une affaire gagnée puis rouverte puis regagnée", () => {
    const semaine = computePipelineWeek(
      [deal({ id: 1, stage: "closed-won", amount: 9000 })],
      [
        change({
          deal_id: 1,
          old_value: "negociation",
          new_value: "closed-won",
          changed_at: LUNDI,
        }),
        change({
          deal_id: 1,
          old_value: "closed-won",
          new_value: "negociation",
          changed_at: MARDI,
        }),
        change({
          deal_id: 1,
          old_value: "negociation",
          new_value: "closed-won",
          changed_at: "2026-09-09T09:00:00Z",
        }),
      ],
      STAGES,
      MERCREDI,
    );
    expect(semaine.kpis.won).toEqual({ count: 1, amount: 9000 });
  });

  it("ignore le churn dans le Lost de la semaine", () => {
    // Une résiliation après signature ne raconte pas la même chose qu'une
    // affaire jamais gagnée ; les mélanger ferait lire une défaite commerciale.
    const semaine = computePipelineWeek(
      [deal({ id: 1, stage: "churn", amount: 5000 })],
      [change({ deal_id: 1, old_value: "closed-won", new_value: "churn" })],
      STAGES,
      MERCREDI,
    );
    expect(semaine.kpis.lost).toEqual({ count: 0, amount: 0 });
    // Elle a tout de même bougé.
    expect(semaine.kpis.ayantBouge).toBe(1);
  });

  it("tolère une opportunité gagnée sans montant", () => {
    const semaine = computePipelineWeek(
      [deal({ id: 1, stage: "closed-won", amount: null })],
      [change({ deal_id: 1, old_value: "proposal", new_value: "closed-won" })],
      STAGES,
      MERCREDI,
    );
    expect(semaine.kpis.won).toEqual({ count: 1, amount: 0 });
  });
});

describe("formatVariation", () => {
  it("montre le signe sans effort de lecture", () => {
    expect(formatVariation(2)).toBe("+ 2");
    expect(formatVariation(-3)).toBe("- 3");
    // « = 0 » plutôt que « + 0 » : rien n'a bougé n'est pas un gain nul.
    expect(formatVariation(0)).toBe("= 0");
  });
});
