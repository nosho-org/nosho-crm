import { getDealPrimaryAction } from "./dealPrimaryAction";

describe("getDealPrimaryAction", () => {
  it("propose une tâche tant que le deal avance par un contact", () => {
    expect(getDealPrimaryAction("lead")).toBe("task");
    expect(getDealPrimaryAction("qualified")).toBe("task");
  });

  it("propose le contrat dès la démo", () => {
    /*
     * Le contrat POC EST l'offre commerciale chez Nosho (NOS-1198) : il n'y
     * a pas de devis intermédiaire, et cette étape pointait vers une
     * proposition qui n'existe plus.
     */
    expect(getDealPrimaryAction("demo-poc")).toBe("contract");
  });

  it("propose le contrat une fois la proposition partie", () => {
    expect(getDealPrimaryAction("proposal")).toBe("contract");
    expect(getDealPrimaryAction("negociation")).toBe("contract");
  });

  it("ne propose rien sur une affaire close", () => {
    // Un bouton plein sur un dossier perdu invite à agir là où il n'y a plus
    // rien à faire.
    expect(getDealPrimaryAction("lost")).toBeNull();
    expect(getDealPrimaryAction("churn")).toBeNull();
    expect(getDealPrimaryAction("closed-won")).toBeNull();
  });

  it("retombe sur la tâche pour une étape inconnue ou absente", () => {
    // Un slug hérité, ou une étape ajoutée en configuration sans passer ici.
    expect(getDealPrimaryAction("a-reclasser")).toBe("task");
    expect(getDealPrimaryAction(null)).toBe("task");
    expect(getDealPrimaryAction(undefined)).toBe("task");
  });

  it("ne désigne pas le contrat quand il n'y a pas de société", () => {
    // `ContractAction` ne rend rien sans société : la fiche se retrouverait
    // sans aucun bouton plein.
    // Le repli est « tâche » : renvoyer vers la proposition désignerait un
    // bouton qui n'existe plus, donc exactement le vide qu'on évite.
    expect(getDealPrimaryAction("proposal", { hasCompany: false })).toBe(
      "task",
    );
    expect(getDealPrimaryAction("proposal", { hasCompany: true })).toBe(
      "contract",
    );
  });
});
