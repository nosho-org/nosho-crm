import { contractFileName, wrapContractDocument } from "./contractDocument";

describe("wrapContractDocument", () => {
  it("produit un document complet, pas un fragment", () => {
    const html = wrapContractDocument("<article>Bonjour</article>", {
      title: "Contrat POC",
    });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<article>Bonjour</article>");
    expect(html).toContain("<title>Contrat POC</title>");
  });

  it("empêche les sauts de page au mauvais endroit", () => {
    // Un contrat coupé entre « Fait à Marseille » et les cases de signature
    // est un document qu'on ne signe pas.
    const html = wrapContractDocument("", { title: "x" });
    expect(html).toContain("break-inside: avoid");
    expect(html).toContain("break-after: avoid");
  });

  it("cache l'aide à l'impression sur le document imprimé", () => {
    const html = wrapContractDocument("", { title: "x" });
    // La règle, pas sa mise en forme : le CSS a été reformaté depuis.
    const bloc = html.slice(html.indexOf("@media print"));
    expect(bloc).toContain(".aide { display: none; }");
  });

  it("échappe le titre plutôt que de le recopier", () => {
    const html = wrapContractDocument("", { title: 'A<"B' });
    expect(html).toContain("<title>A&lt;&quot;B</title>");
  });

  it("porte les mentions légales Nosho, qui ne viennent pas de la base", () => {
    // Les faire transiter par le CRM ferait de chaque contrat une occasion de
    // les contredire.
    const html = wrapContractDocument("", { title: "x" });
    expect(html).toContain("990546418");
    expect(html).toContain("390 Avenue du Prado");
  });

  it("ouvre sur une couverture, comme le contrat de référence", () => {
    // « Ça ne reprend pas mes templates » : le texte était le bon, la mise en
    // forme absente. Le document sortait en A4 blanc sans couverture.
    const html = wrapContractDocument("<article>x</article>", {
      title: "Contrat POC — HEM",
      kicker: "Contrat de service — Période d'essai",
      clientName: "Hôpital Européen",
      contractDate: "30 août 2026",
    });
    expect(html).toContain('class="couverture"');
    expect(html).toContain("Hôpital Européen");
    expect(html).toContain("30 août 2026");
    // Le degrade du contrat de reference.
    expect(html).toContain("linear-gradient");
  });

  it("répète bandeau et pied de page", () => {
    const html = wrapContractDocument("", {
      title: "x",
      kicker: "Contrat de service",
    });
    expect(html).toContain('class="bandeau"');
    expect(html).toContain('class="pied"');
  });

  it("se passe de couverture quand rien ne la nourrit", () => {
    // Une couverture avec un client vide serait pire que pas de couverture.
    const html = wrapContractDocument("", { title: "x" });
    expect(html).not.toContain('class="client"');
  });
});

describe("contractFileName", () => {
  const jour = new Date("2026-08-30T12:00:00Z");

  it("nomme d'après le type, le client et la date", () => {
    expect(contractFileName("poc", "Clinique de Bonneveine", jour)).toBe(
      "Contrat-POC-Clinique-de-Bonneveine-2026-08-30.html",
    );
  });

  it("distingue le contrat cadre", () => {
    expect(contractFileName("cadre", "HEM", jour)).toBe(
      "Contrat-cadre-HEM-2026-08-30.html",
    );
  });

  it("retire les accents, pas seulement les caractères interdits", () => {
    // `Contrat-Hôpital.html` arrive chez le client en `Contrat-HÃ´pital.html`.
    expect(contractFileName("cadre", "Hôpital Européen", jour)).toBe(
      "Contrat-cadre-Hopital-Europeen-2026-08-30.html",
    );
  });

  it("reste un nom valide quand le client n'en a pas", () => {
    expect(contractFileName("poc", "«»", jour)).toBe(
      "Contrat-POC-client-2026-08-30.html",
    );
  });
});
