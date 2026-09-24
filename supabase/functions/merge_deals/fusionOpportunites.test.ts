import { describe, expect, it } from "vitest";

import {
  CHAMPS_COMBLES,
  calculerFusion,
  fusionnerDescriptions,
  fusionnerRoles,
  noteDeFusion,
  refusDeFusion,
  type OpportuniteFusionnable,
} from "./fusionOpportunites";

/**
 * Les deux fiches que Simon a donnees en exemple, telles qu'elles sont en
 * production le 24/09/2026. Deux societes distinctes (AP-HM et Hopital Nord),
 * le contact 97 en commun, et la qualification du lead entierement dans la
 * description de celle qu'on absorbe.
 */
const apHm: OpportuniteFusionnable = {
  id: 2,
  name: "Emilie Garrido-Pradalie — Hôpital",
  company_id: 4,
  contact_ids: [97, 241, 337, 352],
  contact_roles: {},
  products: ["no-show", "entrant"],
  description: null,
  category: "hopital",
  motion: "strategic",
  opportunity_type: "nouveau-client",
  company_type: null,
  lead_source: null,
  referrer_id: null,
};

const hopitalNord: OpportuniteFusionnable = {
  id: 360,
  name: "Hôpital Nord (AP-HM)",
  company_id: 534,
  contact_ids: [654, 97],
  contact_roles: {},
  products: ["no-show", "entrant"],
  description:
    "Lead hôpital Nord (AP-HM) ouvert via Paul Sampéret, chirurgien orthopédique.",
  category: "hopital",
  motion: "strategic",
  opportunity_type: "nouveau-client",
  company_type: null,
  lead_source: "recommandation",
  referrer_id: null,
};

describe("calculerFusion", () => {
  it("reunit les contacts sans doublon, gagnante d'abord", () => {
    expect(calculerFusion(apHm, hopitalNord).contact_ids).toEqual([
      97, 241, 337, 352, 654,
    ]);
  });

  it("reunit les produits sans doublon", () => {
    const maj = calculerFusion(
      { ...apHm, products: ["no-show"] },
      { ...hopitalNord, products: ["entrant", "no-show", "data"] },
    );
    expect(maj.products).toEqual(["no-show", "entrant", "data"]);
  });

  /*
   * Le cas reel : la gagnante n'a pas de description, et toute la
   * qualification du lead est dans celle de l'absorbee. La perdre serait
   * perdre la seule chose qui distinguait les deux fiches.
   */
  it("recupere la description quand la gagnante n'en a pas", () => {
    expect(calculerFusion(apHm, hopitalNord).description).toBe(
      hopitalNord.description,
    );
  });

  it("comble les champs vides de la gagnante, et rien d'autre", () => {
    const maj = calculerFusion(apHm, hopitalNord);
    // Vide chez la gagnante, renseigne chez l'absorbee.
    expect(maj.lead_source).toBe("recommandation");
    // Renseigne des deux cotes : la gagnante garde le sien, donc rien n'est
    // ecrit -- la cle est absente, pas egale.
    expect(maj).not.toHaveProperty("category");
    expect(maj).not.toHaveProperty("motion");
  });

  /*
   * Le risque de cette fonction n'est pas d'oublier un champ -- ca se corrige
   * -- mais d'en ecraser un choisi a la main.
   */
  it("n'ecrase jamais une valeur posee sur la gagnante", () => {
    const maj = calculerFusion(
      { ...apHm, lead_source: "salon", motion: "core" },
      { ...hopitalNord, lead_source: "recommandation", motion: "strategic" },
    );
    expect(maj).not.toHaveProperty("lead_source");
    expect(maj).not.toHaveProperty("motion");
  });

  /*
   * Additionner les deux ARR donnerait 48 000 € sur une affaire qui en vaut
   * 24 000 : le pipeline doublerait sur un clic presente comme un rangement.
   * Aucun champ monetaire ne doit sortir d'ici.
   */
  it("ne touche ni au montant, ni a l'etape, ni aux dates", () => {
    const maj = calculerFusion(apHm, hopitalNord);
    for (const champ of [
      "amount",
      "mrr",
      "stage",
      "priority",
      "expected_closing_date",
      "won_at",
      "entered_at",
      "company_id",
      "sales_id",
      "id",
      "name",
    ]) {
      expect(maj).not.toHaveProperty(champ);
    }
  });

  it("ne comble que des champs declares", () => {
    expect(CHAMPS_COMBLES).not.toContain("amount");
    expect(CHAMPS_COMBLES).not.toContain("stage");
  });
});

describe("fusionnerDescriptions", () => {
  it("garde les deux textes, en nommant la provenance du second", () => {
    expect(fusionnerDescriptions("Avant.", "Apres.", "Hôpital Nord")).toBe(
      "Avant.\n\n--- Repris de « Hôpital Nord » ---\nApres.",
    );
  });

  it("ne rend rien de plus quand l'absorbee est vide", () => {
    expect(fusionnerDescriptions("Avant.", null, "X")).toBe("Avant.");
    expect(fusionnerDescriptions("Avant.", "   ", "X")).toBe("Avant.");
    expect(fusionnerDescriptions(null, null, "X")).toBeNull();
  });

  /*
   * Une fusion peut etre rejouee -- un double clic, un renvoi apres erreur
   * reseau. Deux copies du meme paragraphe sont un degat visible.
   */
  it("n'empile pas un texte deja present", () => {
    const deja = "Avant.\n\n--- Repris de « X » ---\nApres.";
    expect(fusionnerDescriptions(deja, "Apres.", "X")).toBe(deja);
  });
});

describe("fusionnerRoles", () => {
  it("la fiche gardee tranche les desaccords", () => {
    expect(
      fusionnerRoles(
        { "97": "decideur" },
        { "97": "utilisateur", "654": "prescripteur" },
      ),
    ).toEqual({ "97": "decideur", "654": "prescripteur" });
  });

  it("supporte l'absence de roles des deux cotes", () => {
    expect(fusionnerRoles(null, null)).toEqual({});
  });
});

describe("refusDeFusion", () => {
  it("refuse une fiche avec elle-meme, quel que soit le type de l'identifiant", () => {
    expect(refusDeFusion(2, 2)).not.toBeNull();
    expect(refusDeFusion("2", 2)).not.toBeNull();
  });

  it("refuse un identifiant manquant", () => {
    expect(refusDeFusion(null, 2)).not.toBeNull();
    expect(refusDeFusion(2, undefined)).not.toBeNull();
  });

  it("laisse passer deux fiches distinctes", () => {
    expect(refusDeFusion(2, 360)).toBeNull();
  });
});

describe("noteDeFusion", () => {
  it("nomme l'absorbee et son numero", () => {
    const note = noteDeFusion(hopitalNord, true);
    expect(note).toContain("Hôpital Nord (AP-HM)");
    expect(note).toContain("#360");
  });

  /*
   * Le cas de Simon justement : AP-HM et Hopital Nord sont deux societes en
   * base. Le taire ferait disparaitre la societe 534 du dossier sans que
   * personne l'ait decide.
   */
  it("signale que les societes differaient", () => {
    expect(noteDeFusion(hopitalNord, false)).toContain("société");
    expect(noteDeFusion(hopitalNord, true)).not.toContain(
      "pas la même société",
    );
  });
});
