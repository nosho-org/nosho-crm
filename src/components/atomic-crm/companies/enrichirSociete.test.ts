import {
  type AppelFonction,
  championsAEcrire,
  enrichirSociete,
} from "./enrichirSociete";

/** Un faux `functions.invoke` qui note ce qu'on lui a demandé. */
const faux = (reponse: { data?: unknown; error?: unknown }) => {
  const appels: { nom: string; body: Record<string, unknown> }[] = [];
  const invoquer: AppelFonction = async (nom, options) => {
    appels.push({ nom, body: options.body });
    return reponse;
  };
  return { invoquer, appels };
};

describe("enrichirSociete — l'appel", () => {
  it("interroge la bonne fonction, nom nettoyé", async () => {
    const { invoquer, appels } = faux({ data: { website: "https://x.fr" } });
    await enrichirSociete(invoquer, "  Hôpital Européen  ");
    expect(appels[0].nom).toBe("enrich-company-ai");
    expect(appels[0].body.name).toBe("Hôpital Européen");
  });

  it("transmet secteurs et types pour que le modèle classe dans la maison", async () => {
    const { invoquer, appels } = faux({ data: {} });
    await enrichirSociete(invoquer, "X", {
      sectors: [{ value: "pharmacie", label: "Pharmacie" }],
      types: [{ value: "client", label: "Client" }],
    });
    expect(appels[0].body.sectors).toEqual([
      { value: "pharmacie", label: "Pharmacie" },
    ]);
    expect(appels[0].body.types).toHaveLength(1);
  });

  it("n'envoie le siren que lorsqu'un établissement a été choisi", async () => {
    const sans = faux({ data: {} });
    await enrichirSociete(sans.invoquer, "X");
    expect(sans.appels[0].body).not.toHaveProperty("siren");

    const avec = faux({ data: {} });
    await enrichirSociete(avec.invoquer, "X", { siren: "123456789" });
    expect(avec.appels[0].body.siren).toBe("123456789");
  });

  it("refuse un nom vide sans appeler quoi que ce soit", async () => {
    const { invoquer, appels } = faux({ data: {} });
    await expect(enrichirSociete(invoquer, "   ")).rejects.toThrow();
    expect(appels).toHaveLength(0);
  });
});

describe("enrichirSociete — les échecs", () => {
  it("lève sur une erreur de transport", async () => {
    const { invoquer } = faux({ error: new Error("réseau") });
    await expect(enrichirSociete(invoquer, "X")).rejects.toThrow("réseau");
  });

  it("lève aussi quand la panne arrive dans le corps", async () => {
    // La fonction rend ses pannes en 200 avec un champ `error` : ne lire que
    // le statut HTTP laisserait passer un échec pour une réussite vide.
    const { invoquer } = faux({ data: { error: "clé absente" } });
    await expect(enrichirSociete(invoquer, "X")).rejects.toThrow("clé absente");
  });

  it("ne confond pas « introuvable » avec une erreur", async () => {
    // Une société inconnue du registre est une réponse, pas une panne :
    // l'écran doit pouvoir proposer de créer avec le seul nom.
    const { invoquer } = faux({ data: { not_found: true } });
    await expect(enrichirSociete(invoquer, "X")).resolves.toEqual({
      not_found: true,
    });
  });

  it("ne confond pas « modèle muet » avec « introuvable »", async () => {
    /*
     * Le défaut de NOS-1211 : le registre répondait, le modèle non, et l'écran
     * affichait un enrichissement d'apparence réussie — avec une adresse, sans
     * description, et sans rien qui dise pourquoi.
     */
    const { invoquer } = faux({
      data: { qualitative_unavailable: true, city: "Marseille" },
    });
    const r = await enrichirSociete(invoquer, "X");
    expect(r.qualitative_unavailable).toBe(true);
    expect(r.not_found).toBeUndefined();
    expect(r.city).toBe("Marseille");
  });
});

describe("championsAEcrire", () => {
  it("retire les messages d'écran, qui ne sont pas des colonnes", () => {
    // Les laisser passer les enverrait dans un INSERT.
    const patch = championsAEcrire({
      not_found: false,
      qualitative_unavailable: true,
      legal_candidates: [{ siren: "1", name: "X" }],
      website: "https://x.fr",
    });
    expect(patch).toEqual({ website: "https://x.fr" });
  });

  it("n'écrase jamais le nom saisi", () => {
    /*
     * Le registre rend parfois une raison sociale que personne ne reconnaît —
     * « SELARL DU DOCTEUR X » pour un cabinet connu autrement. Le nom cherché
     * est celui que l'utilisateur retrouvera dans sa liste.
     */
    const patch = championsAEcrire({
      name: "SELARL DU DOCTEUR MARTIN",
      city: "Lyon",
    });
    expect(patch).not.toHaveProperty("name");
    expect(patch.city).toBe("Lyon");
  });

  it("ignore les champs vides plutôt que d'effacer une saisie", () => {
    const patch = championsAEcrire({
      website: "",
      phone_number: null as unknown as string,
      city: "Nice",
    });
    expect(patch).toEqual({ city: "Nice" });
  });

  it("rend un objet vide quand il n'y a rien à écrire", () => {
    expect(championsAEcrire({ not_found: true })).toEqual({});
  });
});
