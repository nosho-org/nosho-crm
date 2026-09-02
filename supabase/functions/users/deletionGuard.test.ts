import { describe, expect, it } from "vitest";

import {
  accorder,
  ATTACHES,
  messageDeBlocage,
  type Attache,
} from "./deletionGuard.ts";

describe("ATTACHES", () => {
  it("couvre les tâches, que nulle contrainte ne protège", () => {
    /*
     * `tasks.sales_id` n'a aucune clé étrangère : sans ce décompte, les tâches
     * resteraient rattachées à un identifiant qui ne désigne plus personne, et
     * n'apparaîtraient dans la file de personne.
     */
    const cibles = ATTACHES.map((a) => `${a.table}.${a.colonne}`);
    expect(cibles).toContain("tasks.sales_id");
  });

  it("ne retient plus personne sur ses notes", () => {
    /*
     * NOS-1234 : les notes se détachent de leur auteur (`SET NULL`) au lieu
     * de bloquer sa suppression. Une note dit ce qu'un client a répondu ;
     * elle vaut pour l'affaire, pas pour la personne qui l'a saisie.
     *
     * Les y remettre reviendrait à rendre à nouveau indélébiles trois comptes
     * désactivés — Etienne, Leo et Benjamin.
     */
    const cibles = ATTACHES.map((a) => `${a.table}.${a.colonne}`);
    expect(cibles).not.toContain("deal_notes.sales_id");
    expect(cibles).not.toContain("contact_notes.sales_id");
  });

  it("couvre les contraintes bloquantes relevées en production", () => {
    const cibles = ATTACHES.map((a) => `${a.table}.${a.colonne}`);
    for (const attendu of [
      "companies.sales_id",
      "contacts.sales_id",
      "contracts.nosho_signatory_id",
      "contracts.sales_id",
      "deals.sales_id",
      "event_leads.captured_by",
      "targets.author_id",
    ]) {
      expect(cibles).toContain(attendu);
    }
  });
});

describe("accorder", () => {
  const societe: Attache = {
    table: "companies",
    colonne: "sales_id",
    libelle: "société",
    pluriel: "sociétés",
  };
  const contact: Attache = {
    table: "contacts",
    colonne: "sales_id",
    libelle: "contact",
  };

  it("laisse le singulier à un", () => {
    expect(accorder(societe, 1)).toBe("société");
  });

  it("suit le pluriel déclaré quand il ne s'obtient pas par un s", () => {
    expect(accorder(societe, 3)).toBe("sociétés");
  });

  it("ajoute un s par défaut", () => {
    expect(accorder(contact, 4)).toBe("contacts");
  });
});

describe("messageDeBlocage", () => {
  it("énumère ce qui retient, avec les nombres", () => {
    // Le cas Benjamin, relevé en production : 78 opportunités et 163 contacts.
    const message = messageDeBlocage("Benjamin Blenck", [
      { libelle: "opportunités", nombre: 78 },
      { libelle: "contacts", nombre: 163 },
    ]);
    expect(message).toContain("Benjamin Blenck");
    expect(message).toContain("78 opportunités");
    expect(message).toContain("163 contacts");
  });

  it("nomme les deux issues plutôt que de refuser sans suite", () => {
    // Un « suppression impossible » sec ferait chercher, puis supprimer à la
    // main en base.
    const message = messageDeBlocage("Leo Uslu", [
      { libelle: "opportunité", nombre: 1 },
    ]);
    expect(message).toContain("Réattribuez");
    expect(message).toContain("désactivez");
  });

  it("compose le nombre et le libellé, sans les doubler", () => {
    /*
     * Ce test a servi : la première version de ces fixtures passait
     * « 2 tâches » comme libellé, et le message rendait « 2 2 tâches ».
     * `libelle` porte le nom accordé, le nombre vient du champ `nombre`.
     */
    const message = messageDeBlocage("Leo Uslu", [
      { libelle: "tâches", nombre: 2 },
    ]);
    expect(message).toContain("porte encore 2 tâches.");
  });
});
