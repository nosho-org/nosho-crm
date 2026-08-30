import { escapeHtml, renderTemplate } from "./renderTemplate";

describe("escapeHtml", () => {
  it("neutralise ce qui casserait le document", () => {
    expect(escapeHtml('Durand & Fils <"SAS">')).toBe(
      "Durand &amp; Fils &lt;&quot;SAS&quot;&gt;",
    );
  });
});

describe("renderTemplate", () => {
  it("remplace une variable simple", () => {
    const { html } = renderTemplate("Bonjour {{name}}.", { name: "Nosho" });
    expect(html).toBe("Bonjour Nosho.");
  });

  it("descend dans les objets par les points", () => {
    const { html } = renderTemplate("{{client.name}} — {{client.city}}", {
      client: { name: "HEM", city: "Marseille" },
    });
    expect(html).toBe("HEM — Marseille");
  });

  it("échappe toujours : un nom de société n'est pas du HTML", () => {
    // Une valeur venant de la base et recopiée telle quelle serait une
    // injection. Il n'existe volontairement aucune syntaxe « brut ».
    const { html } = renderTemplate("{{name}}", {
      name: '<script>alert(1)</script>',
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("signale ce qu'il n'a pas su remplir, plutôt que de le taire", () => {
    // Le contrat HEM est parti avec « [SIREN / FINESS HEM] » non remplacé.
    // L'appelant doit pouvoir refuser d'envoyer.
    const { html, missing } = renderTemplate("Entre {{a}} et {{b}}.", {
      a: "Nosho",
    });
    expect(html).toBe("Entre Nosho et .");
    expect(missing).toEqual(["b"]);
  });

  it("déroule une section sur un tableau", () => {
    const { html } = renderTemplate(
      "{{#services}}[{{label}} {{unitPrice}}]{{/services}}",
      {
        services: [
          { label: "Agent de secrétariat", unitPrice: "90 €" },
          { label: "Confirmation de RDV", unitPrice: "1,50 €" },
        ],
      },
    );
    expect(html).toBe("[Agent de secrétariat 90 €][Confirmation de RDV 1,50 €]");
  });

  it("garde la racine accessible depuis une ligne", () => {
    const { html } = renderTemplate(
      "{{#services}}{{label}} ({{contractRef}}){{/services}}",
      { contractRef: "NSH-2026-33", services: [{ label: "Agent" }] },
    );
    expect(html).toBe("Agent (NSH-2026-33)");
  });

  it("masque une section vide, en-têtes compris", () => {
    // Un contrat sans ligne de service ne doit pas afficher un tableau de prix
    // vide avec ses colonnes.
    const { html } = renderTemplate(
      "{{#services}}<table>{{label}}</table>{{/services}}",
      { services: [] },
    );
    expect(html).toBe("");
  });

  it("rend une section inversée quand la valeur est fausse", () => {
    const gratuit = renderTemplate("{{^isFree}}Payant{{/isFree}}", {
      isFree: true,
    });
    expect(gratuit.html).toBe("");

    const payant = renderTemplate("{{^isFree}}Payant{{/isFree}}", {
      isFree: false,
    });
    expect(payant.html).toBe("Payant");
  });

  it("traite les sections imbriquées sans se tromper de balise fermante", () => {
    // Une regex non gourmande fermerait la section extérieure sur la première
    // balise fermante rencontrée, qui appartient à l'intérieure.
    const { html } = renderTemplate(
      "{{#a}}A{{#b}}B{{/b}}A{{/a}}",
      { a: true, b: true },
    );
    expect(html).toBe("ABA");
  });

  it("ne compte pas une chaîne vide comme une valeur", () => {
    const { html } = renderTemplate("{{#comment}}[{{comment}}]{{/comment}}", {
      comment: "   ",
    });
    expect(html).toBe("");
  });

  it("ne signale pas comme manquante une variable jamais atteinte", () => {
    // Elle est dans une branche que le gabarit n'a pas rendue : l'exiger
    // ferait échouer tout POC gratuit sur l'absence de prix.
    const { missing } = renderTemplate(
      "{{^isFree}}{{unitPrice}}{{/isFree}}",
      { isFree: true },
    );
    expect(missing).toEqual([]);
  });
});
