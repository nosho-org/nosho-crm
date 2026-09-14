import type { Deal, Task } from "../types";
import {
  affairesAtteintes,
  bucketFor,
  buildQueue,
  estSurAffairePerdue,
  summarizeBucket,
} from "./actionQueue";

const TODAY = new Date("2026-08-29T10:00:00Z");

const task = (over: Partial<Task> = {}): Task =>
  ({
    id: 1,
    text: "Relancer",
    due_date: "2026-08-29",
    done_date: null,
    deal_id: null,
    ...over,
  }) as unknown as Task;

const deal = (over: Partial<Deal> = {}): Deal =>
  ({ id: 1, name: "Un deal", amount: 10000, ...over }) as unknown as Deal;

describe("bucketFor", () => {
  it("range une échéance passée en retard, avec son nombre de jours", () => {
    expect(bucketFor("2026-08-26", TODAY)).toEqual({
      bucket: "overdue",
      daysOverdue: 3,
    });
  });

  it("traite un horodatage complet comme le jour qu'il porte", () => {
    // C'est ce mélange qui produisait l'en-tête « PLUS TARD » au-dessus de
    // tâches du jour même : une échéance à 15h40 aujourd'hui n'est pas plus
    // tard, elle est aujourd'hui.
    expect(bucketFor("2026-08-29T15:40:00Z", TODAY).bucket).toBe("today");
    expect(bucketFor("2026-08-29T02:00:00Z", TODAY).bucket).toBe("today");
  });

  it("compte sept jours glissants pour « cette semaine »", () => {
    // Pas « jusqu'à dimanche » : un vendredi, le groupe se viderait au moment
    // où l'on en a le plus besoin.
    expect(bucketFor("2026-09-05", TODAY).bucket).toBe("week");
    expect(bucketFor("2026-09-06", TODAY).bucket).toBe("later");
  });

  it("suit le jour local, pas le jour UTC", () => {
    /*
     * Le défaut signalé par Simon : « dans la partie tâche le CRM confond
     * aujourd'hui et hier ».
     *
     * La production appelle `bucketFor` avec `startOfToday()`, c'est-à-dire
     * MINUIT LOCAL. À Paris en été, cet instant s'écrit
     * `2026-08-31T22:00:00Z` : l'ancien code en découpait « 2026-08-31 » et
     * se croyait la veille.
     *
     * Les fixtures existantes valaient 10 h UTC — une heure où les deux
     * lectures coïncident partout, donc où le défaut reste invisible. Ce test
     * reconstruit la valeur réelle.
     */
    const minuitLocal = new Date(2026, 8, 1); // 1er septembre, heure locale

    expect(bucketFor("2026-09-01", minuitLocal).bucket).toBe("today");
    expect(bucketFor("2026-08-31", minuitLocal)).toEqual({
      bucket: "overdue",
      daysOverdue: 1,
    });
    expect(bucketFor("2026-09-02", minuitLocal).bucket).toBe("week");
  });

  it("range un horodatage sur le jour où on le lit", () => {
    // 23 h 30 UTC le 31 août, c'est déjà le 1er septembre à Paris. La tâche
    // s'affiche « due 01/09 » : elle doit se ranger avec ce jour-là.
    const minuitLocal = new Date(2026, 8, 1);
    const instant = new Date(2026, 8, 1, 9, 30).toISOString();

    expect(bucketFor(instant, minuitLocal).bucket).toBe("today");
  });

  it("ne met pas en retard une tâche sans date", () => {
    // Elle n'est en retard sur rien : personne n'a pris d'engagement. La faire
    // remonter en rouge apprendrait à ignorer le rouge.
    expect(bucketFor(null, TODAY).bucket).toBe("later");
    expect(bucketFor("", TODAY).bucket).toBe("later");
  });
});

describe("buildQueue", () => {
  it("écarte les tâches terminées", () => {
    const queue = buildQueue(
      [task({ id: 1 }), task({ id: 2, done_date: "2026-08-28" })],
      [],
      TODAY,
    );
    expect(queue.map((e) => e.task.id)).toEqual([1]);
  });

  it("met le retard en tête, sans exception", () => {
    const queue = buildQueue(
      [
        task({ id: 1, due_date: "2026-09-02" }),
        task({ id: 2, due_date: "2026-08-29" }),
        task({ id: 3, due_date: "2026-08-20" }),
      ],
      [],
      TODAY,
    );
    expect(queue.map((e) => e.task.id)).toEqual([3, 2, 1]);
  });

  it("classe le retard le plus ancien d'abord", () => {
    // C'est celui qui a le plus de chances d'être déjà perdu.
    const queue = buildQueue(
      [
        task({ id: 1, due_date: "2026-08-27" }),
        task({ id: 2, due_date: "2026-08-10" }),
      ],
      [],
      TODAY,
    );
    expect(queue.map((e) => e.task.id)).toEqual([2, 1]);
  });

  it("à échéance égale, la plus grosse affaire d'abord", () => {
    const queue = buildQueue(
      [task({ id: 1, deal_id: 10 }), task({ id: 2, deal_id: 20 })],
      [deal({ id: 10, amount: 5000 }), deal({ id: 20, amount: 50000 })],
      TODAY,
    );
    expect(queue.map((e) => e.task.id)).toEqual([2, 1]);
    expect(queue[0].amount).toBe(50000);
  });

  it("ne prête aucun montant à une tâche sans affaire", () => {
    // Afficher 0 € laisserait croire à une affaire sans valeur plutôt qu'à une
    // tâche sans affaire.
    const queue = buildQueue([task({ deal_id: null })], [], TODAY);
    expect(queue[0].amount).toBeNull();
    expect(queue[0].deal).toBeNull();
  });

  it("ne casse pas quand l'affaire rattachée n'est pas dans le lot chargé", () => {
    const queue = buildQueue(
      [task({ deal_id: 999 })],
      [deal({ id: 10 })],
      TODAY,
    );
    expect(queue[0].deal).toBeNull();
    expect(queue[0].amount).toBeNull();
  });
});

describe("affairesAtteintes — les deux chemins (NOS-1578)", () => {
  const affaire = (over = {}) => ({
    id: 1,
    stage: "lead",
    contact_ids: [],
    ...over,
  });

  it("trouve l'affaire par le lien direct", () => {
    const t = task({ deal_id: 10 });
    expect(affairesAtteintes(t, [affaire({ id: 10 })]).map((a) => a.id)).toEqual(
      [10],
    );
  });

  it("trouve l'affaire par le contact", () => {
    /*
     * Le chemin le plus frequent : sur les cinq taches de production
     * rattachees a une affaire perdue, quatre passent par la.
     */
    const t = task({ deal_id: null, contact_id: 7 });
    expect(
      affairesAtteintes(t, [affaire({ id: 10, contact_ids: [5, 7] })]).map(
        (a) => a.id,
      ),
    ).toEqual([10]);
  });

  it("compare les identifiants sans se soucier du type", () => {
    // Les identifiants arrivent en nombre de la base et en chaine des URL.
    const t = task({ deal_id: "10", contact_id: "7" });
    expect(
      affairesAtteintes(t, [
        affaire({ id: 10 }),
        affaire({ id: 20, contact_ids: [7] }),
      ]).map((a) => a.id),
    ).toEqual([10, 20]);
  });

  it("ne rend rien pour une tache qui ne touche aucune affaire", () => {
    const t = task({ deal_id: null, contact_id: 99 });
    expect(affairesAtteintes(t, [affaire({ id: 10, contact_ids: [5] })])).toEqual(
      [],
    );
  });
});

describe("estSurAffairePerdue (NOS-1578)", () => {
  const affaire = (over = {}) => ({
    id: 1,
    stage: "lead",
    contact_ids: [],
    ...over,
  });

  it("dit oui quand la seule affaire atteinte est perdue", () => {
    expect(
      estSurAffairePerdue(task({ deal_id: 10 }), [
        affaire({ id: 10, stage: "lost" }),
      ], "lost"),
    ).toBe(true);
  });

  it("dit non tant qu'une affaire atteinte est encore vivante", () => {
    /*
     * Le cas qui justifie « toutes » plutot que « au moins une » : un contact
     * peut porter une affaire perdue et une affaire en cours. Masquer sur la
     * seule presence d'une perdue ferait disparaitre du travail encore du.
     */
    expect(
      estSurAffairePerdue(
        task({ deal_id: null, contact_id: 7 }),
        [
          affaire({ id: 10, stage: "lost", contact_ids: [7] }),
          affaire({ id: 20, stage: "qualified", contact_ids: [7] }),
        ],
        "lost",
      ),
    ).toBe(false);
  });

  it("dit non pour une tache qui n'atteint aucune affaire", () => {
    /*
     * 57 taches ouvertes sur 105 sont dans ce cas en production : des rappels
     * sur un contact. Elles ne sont perdues avec rien -- et `every` sur une
     * liste vide rendrait `true` sans ce garde.
     */
    expect(
      estSurAffairePerdue(task({ deal_id: null, contact_id: 99 }), [
        affaire({ id: 10, stage: "lost", contact_ids: [5] }),
      ], "lost"),
    ).toBe(false);
  });

  it("ne masque que l'etape demandee, pas les autres etapes terminales", () => {
    // Apres une signature il reste de l'onboarding, et un churn se travaille.
    for (const stage of ["closed-won", "churn"]) {
      expect(
        estSurAffairePerdue(task({ deal_id: 10 }), [
          affaire({ id: 10, stage }),
        ], "lost"),
      ).toBe(false);
    }
  });
});

describe("buildQueue écarte les tâches des affaires perdues (NOS-1578)", () => {
  const affaire = (over = {}) => ({
    id: 1,
    stage: "lead",
    contact_ids: [],
    ...over,
  });

  it("retire la tache dont l'affaire est perdue", () => {
    const queue = buildQueue(
      [task({ id: 1, deal_id: 10 }), task({ id: 2, deal_id: 20 })],
      [deal({ id: 10 }), deal({ id: 20 })],
      TODAY,
      {
        affaires: [
          affaire({ id: 10, stage: "lost" }),
          affaire({ id: 20, stage: "demo" }),
        ],
        etapePerdue: "lost",
      },
    );
    expect(queue.map((e) => e.task.id)).toEqual([2]);
  });

  it("retire aussi celle qui n'atteint l'affaire que par le contact", () => {
    const queue = buildQueue(
      [task({ id: 1, deal_id: null, contact_id: 7 })],
      [],
      TODAY,
      {
        affaires: [affaire({ id: 10, stage: "lost", contact_ids: [7] })],
        etapePerdue: "lost",
      },
    );
    expect(queue).toEqual([]);
  });

  it("garde les rappels sans affaire", () => {
    const queue = buildQueue(
      [task({ id: 1, deal_id: null, contact_id: 99 })],
      [],
      TODAY,
      {
        affaires: [affaire({ id: 10, stage: "lost", contact_ids: [5] })],
        etapePerdue: "lost",
      },
    );
    expect(queue.map((e) => e.task.id)).toEqual([1]);
  });

  it("ne masque rien quand l'appelant ne fournit pas les affaires", () => {
    /*
     * Le comportement d'avant, garde tel quel : un appelant qui ne sait pas
     * juger ne doit pas masquer au hasard. C'est ce qui rend l'ajout sur
     * CockpitQueue explicite plutot qu implicite.
     */
    const queue = buildQueue([task({ id: 1, deal_id: 10 })], [], TODAY);
    expect(queue.map((e) => e.task.id)).toEqual([1]);
  });
});

describe("summarizeBucket", () => {
  it("compte les lignes et additionne ce qui est en jeu", () => {
    const queue = buildQueue(
      [task({ id: 1, deal_id: 10 }), task({ id: 2, deal_id: 20 })],
      [deal({ id: 10, amount: 18000 }), deal({ id: 20, amount: 12000 })],
      TODAY,
    );
    expect(summarizeBucket(queue)).toEqual({ count: 2, amount: 30000 });
  });

  it("ignore les tâches sans montant dans le total", () => {
    const queue = buildQueue(
      [task({ id: 1, deal_id: 10 }), task({ id: 2 })],
      [deal({ id: 10, amount: 18000 })],
      TODAY,
    );
    expect(summarizeBucket(queue)).toEqual({ count: 2, amount: 18000 });
  });
});
