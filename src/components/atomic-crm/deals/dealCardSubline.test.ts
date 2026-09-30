import { companySubline, dealSubtitle } from "./dealCardSubline";

/**
 * Les cas viennent de la production, relevés par l'audit du 29 août 2026.
 */
describe("companySubline", () => {
  it("tait la société quand l'intitulé la répète déjà", () => {
    // La carte écrivait « KERSANTE - Kersanté ».
    expect(companySubline("KERSANTE - Kersanté", "Kersanté")).toBeNull();
  });

  it("ignore casse, accents et ponctuation dans la comparaison", () => {
    // Le cas le plus coûteux : 200 px de haut pour une information écrite
    // deux fois.
    expect(
      companySubline(
        "C.M.C.O. CENTRE MEDITERRANEEN DE CHIRURGIE ORTHOPEDIQUE - C.M.C.O. CENTRE MEDITERRANEEN DE CHIRURGIE ORTHOPEDIQUE",
        "C.M.C.O. Centre Méditerranéen de Chirurgie Orthopédique",
      ),
    ).toBeNull();
  });

  it("écrit la société quand elle ajoute vraiment quelque chose", () => {
    expect(companySubline("Extension 3 sites", "Hôpital Européen")).toBe(
      "Hôpital Européen",
    );
  });

  it("compare des mots entiers, pas des sous-chaînes", () => {
    // « Autre » est une vraie société en production. Une première version
    // écrasait les espaces avant de comparer : « autre » se retrouvait dans
    // « renouvelerautrement » et la société disparaissait de la carte.
    expect(companySubline("Renouveler autrement", "Autre")).toBe("Autre");
    // Mais le mot entier, lui, est bien une répétition.
    expect(companySubline("Autre - extension", "Autre")).toBeNull();
  });

  it("ne rend rien quand il n'y a pas de société", () => {
    expect(companySubline("Un deal", null)).toBeNull();
    expect(companySubline("Un deal", "   ")).toBeNull();
  });
});

describe("dealSubtitle", () => {
  it("se tait quand l'intitulé est la société", () => {
    expect(dealSubtitle("Oxance", "Oxance")).toBeNull();
    expect(dealSubtitle("KERSANTE", "Kersanté")).toBeNull();
    expect(dealSubtitle("  Oxance  ", "Oxance")).toBeNull();
  });

  /*
   * Le cas de Simon : deux POC sur le même groupe. C'est la seule chose qui
   * sépare les deux fiches, donc elle doit sortir.
   */
  it("rend l'intitulé quand il ajoute quelque chose", () => {
    expect(dealSubtitle("Oxance — POC Marignane", "Oxance")).toBe(
      "Oxance — POC Marignane",
    );
    expect(dealSubtitle("Oxance — POC Nîmes", "Oxance")).toBe(
      "Oxance — POC Nîmes",
    );
  });

  it("se tait sur un intitulé vide ou une société absente", () => {
    expect(dealSubtitle("", "Oxance")).toBeNull();
    expect(dealSubtitle(null, "Oxance")).toBeNull();
    // Sans société, l'intitulé est déjà le titre : rien à compléter.
    expect(dealSubtitle("Oxance", null)).toBeNull();
  });
});
