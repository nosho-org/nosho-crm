import { AlertTriangle } from "lucide-react";
import { type Identifier, useGetList, useGetOne } from "ra-core";
import { useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Link } from "react-router-dom";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { formatCurrencyCompact } from "../misc/formatCurrency";
import {
  type OpportuniteExistante,
  aDesDoublons,
  detecterDoublons,
  resumerDoublons,
} from "./doublonOpportunite";

/**
 * Le garde-fou anti-doublon du formulaire d'opportunité (NOS-1384).
 *
 * Simon : « je veux un garde-fou qui t'avertit si tu crées une opportunité et
 * que la société ou le contact existe déjà ».
 *
 * On ouvre une affaire pour un établissement qu'un collègue suit déjà, rien ne
 * le signale, et le doublon se découvre des semaines plus tard — quand deux
 * commerciaux se croisent chez le même client. Le pipeline a compté l'ARR deux
 * fois entre-temps.
 *
 * ## Il avertit, il ne bloque pas
 *
 * Deux opportunités sur une même société sont souvent légitimes : Hôpital
 * Européen en porte deux, « appel sortant » et « déploiement entrant ».
 * Bloquer refuserait un cas courant et pousserait à contourner — on créerait
 * la société en double pour passer, ce qui est le problème qu'on veut éviter.
 *
 * ## Deux requêtes, pas une
 *
 * PostgREST ne compose pas un `OR` entre deux colonnes sans passer par la
 * syntaxe brute `or=(...)`, illisible et fragile. Deux `useGetList` distincts
 * coûtent un aller-retour de plus et se lisent d'un coup d'œil ; à cette
 * échelle — quelques dizaines de lignes — la lisibilité vaut mieux que
 * l'économie.
 *
 * Les deux requêtes sont **désactivées** tant que rien n'est choisi : sans
 * cela, ouvrir le formulaire déclencherait un `contact_ids=ov.{}` que
 * PostgREST rejette, et une requête société sur `undefined`.
 */
export const DealDoublonAlerte = () => {
  const { dealStages, dealPipelineStatuses } = useConfigurationContext();
  const companyId = useWatch({ name: "company_id" });
  const contactIds: Identifier[] = useWatch({ name: "contact_ids" }) ?? [];

  /*
   * L'identifiant de l'opportunité en cours d'édition, s'il y en a une : une
   * fiche ouverte ne doit pas s'avertir elle-même. `getValues` plutôt que
   * `useRecordContext` — le formulaire porte la valeur dans les deux modes.
   */
  const { getValues } = useFormContext();
  const dealActuelId = getValues("id") as Identifier | undefined;

  const { data: parSociete } = useGetList<OpportuniteExistante & { id: Identifier }>(
    "deals_summary",
    {
      pagination: { page: 1, perPage: 20 },
      sort: { field: "id", order: "DESC" },
      filter: { company_id: companyId, "archived_at@is": null },
    },
    { enabled: companyId != null },
  );

  const { data: parContact } = useGetList<OpportuniteExistante & { id: Identifier }>(
    "deals_summary",
    {
      pagination: { page: 1, perPage: 20 },
      sort: { field: "id", order: "DESC" },
      filter: {
        "contact_ids@ov": `{${contactIds.join(",")}}`,
        "archived_at@is": null,
      },
    },
    { enabled: contactIds.length > 0 },
  );

  const { data: societe } = useGetOne(
    "companies",
    { id: companyId },
    { enabled: companyId != null },
  );

  const doublons = useMemo(
    () =>
      detecterDoublons([...(parSociete ?? []), ...(parContact ?? [])], companyId, contactIds, {
        pipelineStatuses: dealPipelineStatuses,
        dealActuelId,
      }),
    [parSociete, parContact, companyId, contactIds, dealPipelineStatuses, dealActuelId],
  );

  if (!aDesDoublons(doublons)) return null;

  const libelleEtape = (slug: string | null | undefined) =>
    dealStages.find((s) => s.value === slug)?.label ?? slug ?? "—";

  const ligne = (deal: OpportuniteExistante) => (
    <li key={String(deal.id)} className="flex items-baseline gap-2 min-w-0">
      <Link
        to={`/deals/${deal.id}/show`}
        className="truncate hover:underline"
        title={deal.name ?? undefined}
      >
        {deal.name || "Sans nom"}
      </Link>
      <span className="text-muted-foreground shrink-0">
        · {libelleEtape(deal.stage)}
        {typeof deal.amount === "number"
          ? ` · ${formatCurrencyCompact(deal.amount)}`
          : ""}
      </span>
    </li>
  );

  return (
    <div
      role="status"
      className="rounded-md border border-[var(--deal-status-warning)]/45 bg-[color-mix(in_oklch,var(--deal-status-warning)_10%,transparent)] px-3 py-2 text-sm flex gap-2"
    >
      <AlertTriangle
        className="w-4 h-4 mt-0.5 shrink-0 text-[var(--deal-status-warning)]"
        aria-hidden
      />
      <div className="min-w-0 flex flex-col gap-1">
        <span className="font-medium">
          {resumerDoublons(doublons, societe?.name)}
        </span>

        {doublons.parSociete.length > 0 ? (
          <ul className="flex flex-col gap-0.5 text-xs">
            {doublons.parSociete.map(ligne)}
          </ul>
        ) : null}

        {doublons.parContact.length > 0 ? (
          <>
            <span className="text-xs text-muted-foreground mt-1">
              Sur une autre société, avec un contact en commun :
            </span>
            <ul className="flex flex-col gap-0.5 text-xs">
              {doublons.parContact.map(ligne)}
            </ul>
          </>
        ) : null}

        {/* Le ton compte : ceci n'interdit rien, et doit le dire. */}
        <span className="text-xs text-muted-foreground mt-1">
          Vérifiez qu'il ne s'agit pas de la même affaire. Vous pouvez continuer.
        </span>
      </div>
    </div>
  );
};
