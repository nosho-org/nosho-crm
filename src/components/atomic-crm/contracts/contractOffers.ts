/**
 * La grille tarifaire de référence du contrat cadre (NOS-1156).
 *
 * Reprise telle qu'elle figure à l'article 3, où elle est explicitement
 * qualifiée d'indicative : « le tarif contractuel est celui figurant dans le
 * tableau ci-dessus ». Elle sert donc à **pré-remplir**, jamais à contraindre —
 * l'intitulé et le prix restent libres à la saisie.
 *
 * Les cibles recoupent `establishment_type`, déjà présent dans le CRM et déjà
 * utilisé pour suggérer l'ARR d'une opportunité. On pré-remplit depuis la
 * typologie de la société plutôt que de faire deviner.
 */
export interface ContractOfferPreset {
  value: string;
  label: string;
  detail: string;
  /** En centimes, comme la colonne. */
  unitPriceCents: number;
  unit: string;
}

export const CONTRACT_OFFER_PRESETS: ContractOfferPreset[] = [
  {
    value: "essentiel",
    label: "Essentiel",
    detail:
      "Agent de confirmation des rendez-vous — cabinet ou petite structure.",
    unitPriceCents: 3000,
    unit: "mois",
  },
  {
    value: "avance",
    label: "Avancé",
    detail: "Agent de confirmation des rendez-vous — centre ou groupe.",
    unitPriceCents: 7000,
    unit: "mois",
  },
  {
    value: "etablissement",
    label: "Hôpital / Établissement",
    detail: "Agent de confirmation des rendez-vous — hôpital, clinique ou GHT.",
    unitPriceCents: 40000,
    unit: "mois",
  },
  {
    value: "pay-per-use",
    label: "Forfait confirmation",
    detail:
      "Appel sortant de confirmation, par rendez-vous traité, reprise des créneaux annulés incluse.",
    // Le tarif du contrat HEM.
    unitPriceCents: 25,
    unit: "confirmation",
  },
];

/**
 * Offre suggérée d'après la typologie d'établissement de la société.
 *
 * Volontairement tolérante : la correspondance se fait sur ce que le libellé
 * contient, parce que `establishment_type` est configurable en base et que ses
 * valeurs ont déjà changé une fois. Une typologie inconnue ne suggère rien
 * plutôt que de proposer au hasard — un prix erroné pré-rempli est plus
 * dangereux qu'un champ vide.
 */
export function suggestOffer(
  establishmentTypeLabel: string | null | undefined,
): ContractOfferPreset | null {
  const label = (establishmentTypeLabel ?? "").toLowerCase();
  if (!label) return null;
  if (/(hôpital|hopital|clinique|ght|chu|centre hospitalier)/.test(label)) {
    return CONTRACT_OFFER_PRESETS[2];
  }
  if (/(centre|groupe|réseau|reseau)/.test(label)) {
    return CONTRACT_OFFER_PRESETS[1];
  }
  if (/(cabinet|praticien|libéral|liberal)/.test(label)) {
    return CONTRACT_OFFER_PRESETS[0];
  }
  return null;
}

/** Unités proposées, celles que la grille du contrat emploie. */
export const CONTRACT_PRICE_UNITS = [
  { value: "confirmation", label: "par confirmation" },
  { value: "rendez-vous confirmé", label: "par rendez-vous confirmé" },
  { value: "mois", label: "par mois" },
  { value: "an", label: "par an" },
];
