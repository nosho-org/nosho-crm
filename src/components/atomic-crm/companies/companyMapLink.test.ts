import { describe, expect, it } from "vitest";

import { adresseCartographiable, lienGoogleMaps } from "./companyMapLink";

describe("adresseCartographiable", () => {
  it("assemble nom, rue, code postal et ville", () => {
    expect(
      adresseCartographiable({
        name: "POLYCLINIQUE SAINT PRIVAT",
        address: "RUE DE LA MARGERIDE",
        zipcode: "34760",
        city: "BOUJAN-SUR-LIBRON",
      }),
    ).toBe(
      "POLYCLINIQUE SAINT PRIVAT, RUE DE LA MARGERIDE, 34760, BOUJAN-SUR-LIBRON",
    );
  });

  it("se contente du nom et de la ville", () => {
    expect(
      adresseCartographiable({ name: "CHU de Nantes", city: "NANTES" }),
    ).toBe("CHU de Nantes, NANTES");
  });

  it("refuse une ville seule", () => {
    // Une carte centrée sur la commune n'aide personne à trouver un
    // établissement : mieux vaut pas de lien qu'un lien qui égare.
    expect(adresseCartographiable({ city: "NANTES" })).toBeNull();
  });

  it("refuse un enregistrement sans adresse", () => {
    expect(adresseCartographiable({ name: "CHU de Nantes" })).toBeNull();
    expect(adresseCartographiable({})).toBeNull();
  });

  it("ignore les champs vides ou blancs", () => {
    expect(
      adresseCartographiable({
        name: "  ",
        address: "12 rue des Lilas",
        zipcode: null,
        city: "LYON",
      }),
    ).toBe("12 rue des Lilas, LYON");
  });
});

describe("lienGoogleMaps", () => {
  it("encode la requête", () => {
    expect(lienGoogleMaps("CHU de Nantes, NANTES")).toBe(
      "https://www.google.com/maps/search/?api=1&query=CHU%20de%20Nantes%2C%20NANTES",
    );
  });

  it("échappe les caractères qui casseraient l'URL", () => {
    expect(lienGoogleMaps("Clinique A&B, PARIS")).toContain("A%26B");
  });
});
