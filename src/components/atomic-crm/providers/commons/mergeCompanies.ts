import type { DataProvider, Identifier } from "ra-core";

import type { Company } from "../../types";

/**
 * Fusion de sociétés pour le fournisseur FakeRest (NOS-1169).
 *
 * Reprend ce que fait `supabase/functions/merge_companies` — réaffecter les
 * références, fusionner les champs, supprimer la perdante — sans la
 * transaction : FakeRest n'en a pas, et la démo n'a rien à protéger.
 *
 * Ce n'est donc PAS la même implémentation, et c'est assumé : la version
 * serveur est celle qui compte, celle-ci existe pour que le parcours soit
 * vérifiable en local. Les règles de fusion, elles, sont volontairement
 * identiques — un écart ici ferait valider en démo un comportement qui n'est
 * pas celui de la production.
 */
export const mergeCompanies = async (
  loserId: Identifier,
  winnerId: Identifier,
  dataProvider: DataProvider,
) => {
  if (String(loserId) === String(winnerId)) {
    throw new Error("Une société ne peut pas être fusionnée avec elle-même");
  }

  const { data: winner } = await dataProvider.getOne<Company>("companies", {
    id: winnerId,
  });
  const { data: loser } = await dataProvider.getOne<Company>("companies", {
    id: loserId,
  });
  if (!winner || !loser) throw new Error("Société introuvable");

  // Les tables qui pointent vers la société par `company_id`.
  for (const resource of ["contacts", "deals", "contracts"]) {
    const { data: rows } = await dataProvider.getList(resource, {
      pagination: { page: 1, perPage: 1000 },
      sort: { field: "id", order: "ASC" },
      filter: { company_id: loserId },
    });
    for (const row of rows) {
      await dataProvider.update(resource, {
        id: row.id,
        data: { company_id: winnerId },
        previousData: row,
      });
    }
  }

  const text = (
    own: string | null | undefined,
    other: string | null | undefined,
  ) => (own && own.trim() !== "" ? own : (other ?? own ?? null));

  const hasDescription = !!winner.description?.trim();

  await dataProvider.update("companies", {
    id: winnerId,
    data: {
      name: text(winner.name, loser.name),
      sector: text(winner.sector, loser.sector),
      website: text(winner.website, loser.website),
      phone_number: text(winner.phone_number, loser.phone_number),
      address: text(winner.address, loser.address),
      zipcode: text(winner.zipcode, loser.zipcode),
      city: text(winner.city, loser.city),
      country: text(winner.country, loser.country),
      linkedin_url: text(winner.linkedin_url, loser.linkedin_url),
      tax_identifier: text(winner.tax_identifier, loser.tax_identifier),
      vat_number: text(winner.vat_number, loser.vat_number),
      // Le descriptif et sa provenance voyagent ensemble : garder la source de
      // la gagnante sur le texte de la perdante présenterait une inference
      // comme une donnée vérifiée.
      description: hasDescription ? winner.description : loser.description,
      description_source: hasDescription
        ? winner.description_source
        : loser.description_source,
      size: winner.size ?? loser.size,
      sales_id: winner.sales_id ?? loser.sales_id,
    },
    previousData: winner,
  });

  await dataProvider.delete("companies", { id: loserId, previousData: loser });

  return { success: true, winnerId };
};
