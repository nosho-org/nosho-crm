import { getDefaultExpectedClosingDate } from "./dealUtils";

/**
 * NOS-1014. Fichier séparé de `dealUtils.test.ts` à dessein : celui-ci tourne
 * en mode navigateur (il importe `vitest/browser`), et cette fonction n'a
 * besoin d'aucun DOM. Un test exécutable partout vaut mieux qu'un test bien
 * rangé.
 *
 * Pas d'`import ... from "vitest"` non plus, malgré l'habitude : `globals: true`
 * suffit, et surtout le `vitest.d.ts` à la racine du dépôt masque le paquet aux
 * yeux de TypeScript. Chaque fichier qui importe explicitement `vitest` ajoute
 * donc une erreur `TS2306` à la compilation — il y en a déjà six.
 */
describe("getDefaultExpectedClosingDate", () => {
  // Le formulaire proposait « aujourd'hui », soit la même valeur que la date
  // d'entrée en pipeline : une opportunité créée et close le jour même.
  it("adds six weeks to the given day", () => {
    expect(getDefaultExpectedClosingDate(new Date(2026, 7, 26))).toBe(
      "2026-10-07",
    );
  });

  it("reads local calendar fields, not UTC", () => {
    // 23h30 le 31 décembre : `toISOString()` bascule sur l'année suivante pour
    // quiconque est à l'est de Greenwich, et décalerait la date d'un jour.
    // Même piège que `dealFilterContract` documente en tête de fichier.
    expect(getDefaultExpectedClosingDate(new Date(2026, 11, 31, 23, 30))).toBe(
      "2027-02-11",
    );
  });

  it("crosses a month boundary without drifting", () => {
    expect(getDefaultExpectedClosingDate(new Date(2026, 0, 30))).toBe(
      "2026-03-13",
    );
  });
});
