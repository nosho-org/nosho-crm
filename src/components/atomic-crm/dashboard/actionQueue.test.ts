import type { Deal, Task } from "../types";
import { bucketFor, buildQueue, summarizeBucket } from "./actionQueue";

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
