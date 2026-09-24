import type { DataProvider, Identifier } from "ra-core";

import type { Deal, DealNote } from "../../types";
import {
  calculerFusion,
  noteDeFusion,
  refusDeFusion,
  type OpportuniteFusionnable,
} from "../../../../../supabase/functions/merge_deals/fusionOpportunites";

/**
 * Fusion d'opportunités pour le fournisseur FakeRest.
 *
 * Même parti pris que `mergeCompanies` : l'orchestration est réécrite ici,
 * sans transaction — FakeRest n'en a pas, et la démo n'a rien à protéger.
 *
 * Les **règles**, elles, ne sont pas réécrites : `calculerFusion` et
 * `noteDeFusion` sont importées du module que la fonction edge utilise. C'est
 * là que se cache le risque réel — additionner deux ARR, écraser une source de
 * lead choisie à la main — et une seconde copie de ces règles finirait par
 * valider en démo un comportement qui n'est pas celui de la production. Le
 * module n'importe rien et ne touche ni Deno ni Postgres : il traverse la
 * frontière sans rien emporter.
 */
export const mergeDeals = async (
  loserId: Identifier,
  winnerId: Identifier,
  dataProvider: DataProvider,
) => {
  const refus = refusDeFusion(winnerId, loserId);
  if (refus) throw new Error(refus);

  const { data: gagnante } = await dataProvider.getOne<Deal>("deals", {
    id: winnerId,
  });
  const { data: perdante } = await dataProvider.getOne<Deal>("deals", {
    id: loserId,
  });
  if (!gagnante || !perdante) throw new Error("Opportunité introuvable");

  // Ce qu'on lit et ce qu'on fait suit la fiche gardée ; le journal des
  // changements reste sur l'absorbée (voir `fusionOpportunites.ts`).
  for (const resource of ["deal_notes", "tasks", "contracts"]) {
    const { data: rows } = await dataProvider.getList(resource, {
      pagination: { page: 1, perPage: 1000 },
      sort: { field: "id", order: "ASC" },
      filter: { deal_id: loserId },
    });
    for (const row of rows ?? []) {
      await dataProvider.update(resource, {
        id: row.id,
        data: { deal_id: winnerId },
        previousData: row,
      });
    }
  }

  const maj = calculerFusion(
    gagnante as unknown as OpportuniteFusionnable,
    perdante as unknown as OpportuniteFusionnable,
  );
  await dataProvider.update<Deal>("deals", {
    id: winnerId,
    data: maj as Partial<Deal>,
    previousData: gagnante,
  });

  await dataProvider.create<DealNote>("deal_notes", {
    data: {
      deal_id: winnerId,
      text: noteDeFusion(
        { id: Number(perdante.id), name: perdante.name },
        gagnante.company_id === perdante.company_id,
      ),
      date: new Date().toISOString(),
      sales_id: gagnante.sales_id,
    } as Partial<DealNote> as DealNote,
  });

  await dataProvider.update<Deal>("deals", {
    id: loserId,
    data: { archived_at: new Date().toISOString() },
    previousData: perdante,
  });

  return { success: true, winnerId };
};
