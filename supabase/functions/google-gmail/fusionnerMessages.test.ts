import { describe, expect, it } from "vitest";

import { fusionnerMessages, type MessageDeBoite } from "./fusionnerMessages";

const boite = (salesId: number, own = false) => ({
  salesId,
  name: `Commercial ${salesId}`,
  email: `c${salesId}@nosho.io`,
  own,
});

const message = (over: Partial<MessageDeBoite> = {}): MessageDeBoite => ({
  id: "gmail-1",
  threadId: "thread-1",
  subject: "Proposition",
  from: "moi@nosho.io",
  to: "client@chu.fr",
  date: "",
  snippet: "…",
  internalDate: "1000",
  mailbox: boite(1),
  ...over,
});

describe("fusionnerMessages — le dédoublonnage", () => {
  it("fond en une seule ligne le même courriel vu dans deux boîtes", () => {
    /*
     * Le cas courant : deux collègues en copie du même envoi. Gmail donne au
     * courriel un `id` DIFFÉRENT dans chaque boîte — c'est l'en-tête
     * `Message-ID` qui est stable, et lui seul.
     */
    const fusion = fusionnerMessages(
      [
        [message({ id: "chez-simon", messageId: "<abc@mail>" })],
        [
          message({
            id: "chez-thomas",
            messageId: "<abc@mail>",
            mailbox: boite(2),
          }),
        ],
      ],
      10,
    );
    expect(fusion).toHaveLength(1);
  });

  it("garde la copie de celui qui regarde, pour que le lien Gmail marche", () => {
    /*
     * Le `threadId` d'une autre boîte n'existe pas dans la sienne : garder sa
     * propre copie quand elle existe, c'est garder le lien cliquable.
     */
    const fusion = fusionnerMessages(
      [
        [
          message({
            id: "chez-thomas",
            messageId: "<abc@mail>",
            mailbox: boite(2),
          }),
        ],
        [
          message({
            id: "chez-moi",
            messageId: "<abc@mail>",
            mailbox: boite(1, true),
          }),
        ],
      ],
      10,
    );
    expect(fusion[0].id).toBe("chez-moi");
    expect(fusion[0].mailbox.own).toBe(true);
  });

  it("ne confond pas deux courriels aux Message-ID différents", () => {
    const fusion = fusionnerMessages(
      [
        [
          message({ messageId: "<un@mail>" }),
          message({ messageId: "<deux@mail>", internalDate: "2000" }),
        ],
      ],
      10,
    );
    expect(fusion).toHaveLength(2);
  });

  it("retombe sur objet + horodatage quand le Message-ID manque", () => {
    const fusion = fusionnerMessages(
      [
        [message({ id: "a", subject: "Devis", internalDate: "500" })],
        [
          message({
            id: "b",
            subject: "Devis",
            internalDate: "500",
            mailbox: boite(2),
          }),
        ],
      ],
      10,
    );
    expect(fusion).toHaveLength(1);
  });

  it("ne fusionne pas deux objets identiques envoyés à des moments différents", () => {
    const fusion = fusionnerMessages(
      [
        [
          message({ id: "a", subject: "Relance", internalDate: "500" }),
          message({ id: "b", subject: "Relance", internalDate: "900" }),
        ],
      ],
      10,
    );
    expect(fusion).toHaveLength(2);
  });

  it("traite un Message-ID vide comme absent", () => {
    // Un en-tête absent revient parfois en chaîne vide plutôt qu'en `undefined`.
    const fusion = fusionnerMessages(
      [
        [message({ id: "a", messageId: "   ", internalDate: "500" })],
        [
          message({
            id: "b",
            messageId: "",
            internalDate: "500",
            mailbox: boite(2),
          }),
        ],
      ],
      10,
    );
    expect(fusion).toHaveLength(1);
  });
});

describe("fusionnerMessages — l'ordre et la coupe", () => {
  it("rend les plus récents d'abord, toutes boîtes confondues", () => {
    const fusion = fusionnerMessages(
      [
        [message({ id: "vieux", messageId: "<1>", internalDate: "100" })],
        [
          message({
            id: "recent",
            messageId: "<2>",
            internalDate: "900",
            mailbox: boite(2),
          }),
          message({
            id: "moyen",
            messageId: "<3>",
            internalDate: "500",
            mailbox: boite(2),
          }),
        ],
      ],
      10,
    );
    expect(fusion.map((m) => m.id)).toEqual(["recent", "moyen", "vieux"]);
  });

  it("se rabat sur l'en-tête Date quand internalDate est inutilisable", () => {
    const fusion = fusionnerMessages(
      [
        [
          message({
            id: "sans-horodatage",
            messageId: "<1>",
            internalDate: "",
            date: "Tue, 15 Sep 2026 10:00:00 +0200",
          }),
          message({ id: "ancien", messageId: "<2>", internalDate: "100" }),
        ],
      ],
      10,
    );
    expect(fusion[0].id).toBe("sans-horodatage");
  });

  it("coupe après le maximum demandé, une fois l'ordre établi", () => {
    // La coupe vient APRÈS le tri : couper d'abord garderait les plus anciens
    // de la première boîte au lieu des plus récents de l'ensemble.
    const fusion = fusionnerMessages(
      [
        [message({ id: "a", messageId: "<1>", internalDate: "100" })],
        [
          message({
            id: "b",
            messageId: "<2>",
            internalDate: "900",
            mailbox: boite(2),
          }),
        ],
      ],
      1,
    );
    expect(fusion.map((m) => m.id)).toEqual(["b"]);
  });

  it("rend une liste vide quand aucune boîte n'a répondu", () => {
    expect(fusionnerMessages([], 10)).toEqual([]);
    expect(fusionnerMessages([[], []], 10)).toEqual([]);
  });
});
