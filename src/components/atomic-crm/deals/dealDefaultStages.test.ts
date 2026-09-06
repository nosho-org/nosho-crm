import { getDefaultOpenStages } from "./dealUtils";
import {
  defaultDealPipelineStatuses,
  defaultDealStages,
} from "../root/defaultConfiguration";

/**
 * NOS-1062. La liste est dérivée de la configuration, pas écrite en dur : le
 * pipeline a déjà changé deux fois cette année, et une liste figée aurait
 * masqué en silence toute étape ajoutée depuis. Ce test verrouille la règle,
 * pas le contenu.
 */
describe("getDefaultOpenStages", () => {
  it("keeps the stages where a deal is actually worked", () => {
    expect(
      getDefaultOpenStages(defaultDealStages, defaultDealPipelineStatuses),
    ).toEqual(["lead", "qualified", "demo", "poc", "proposal", "negociation"]);
  });

  it("excludes closed stages and the reclassification queue", () => {
    const stages = getDefaultOpenStages(
      defaultDealStages,
      defaultDealPipelineStatuses,
    );
    // Terminales : une affaire signée, perdue ou churnée n'est plus du travail.
    for (const closed of defaultDealPipelineStatuses) {
      expect(stages).not.toContain(closed);
    }
    // Parking en attente de décision humaine, pas une étape commerciale.
    expect(stages).not.toContain("a-reclasser");
  });

  it("adopts a stage added to the configuration", () => {
    const stages = getDefaultOpenStages(
      [...defaultDealStages, { value: "pilote" }],
      defaultDealPipelineStatuses,
    );
    expect(stages).toContain("pilote");
  });
});
