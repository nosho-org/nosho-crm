import { useState } from "react";
import { FileSignature, Landmark, Pencil, Trash2 } from "lucide-react";
import {
  useDelete,
  useGetList,
  useNotify,
  useRecordContext,
  useRefresh,
  useUpdate,
} from "ra-core";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import type { Contract, Deal } from "../types";
import { ContractDialog } from "./ContractDialog";
import { formatUnitPrice } from "./contractPayload";

/**
 * ---------------------------------------------------------------------------
 * Les contrats d'une opportunité (NOS-1156)
 * ---------------------------------------------------------------------------
 * Sans ce bloc, un contrat enregistré n'apparaissait nulle part : on pouvait
 * en créer un, il partait en base, et plus rien ne le montrait. La saisie
 * existait, le suivi non.
 *
 * Le bloc ne s'affiche pas quand l'opportunité n'a aucun contrat. Une carte
 * « Aucun contrat » sur chacune des 116 opportunités serait du bruit : le
 * bouton « Éditer un contrat » de l'en-tête dit déjà que la chose est
 * possible.
 */

const KIND_LABELS: Record<string, string> = {
  poc: "Contrat POC",
  cadre: "Contrat cadre",
};

/**
 * Les états d'un contrat, et leur couleur.
 *
 * `signed` reprend le vert du gagné, `sent` l'orange de l'attente. Les teintes
 * de cette interface portent un sens fixe — vert gagné, orange attention — et
 * en inventer d'autres ici les diluerait.
 */
const STATUS = {
  draft: { label: "Brouillon", className: "text-muted-foreground" },
  generated: { label: "Document généré", className: "text-foreground" },
  sent: {
    label: "Envoyé en signature",
    className: "text-[var(--deal-status-warning)]",
  },
  signed: {
    label: "Signé",
    className: "text-[var(--deal-status-won)] font-medium",
  },
} as const;

export const ContractsBlock = () => {
  const record = useRecordContext<Deal>();
  const notify = useNotify();
  const refresh = useRefresh();
  const [update] = useUpdate();
  const [remove] = useDelete();
  const [editing, setEditing] = useState<Contract | null>(null);

  const { data: contracts } = useGetList<Contract>(
    "contracts",
    {
      pagination: { page: 1, perPage: 20 },
      sort: { field: "created_at", order: "DESC" },
      filter: { deal_id: record?.id },
    },
    { enabled: record?.id != null },
  );

  if (!record || !contracts?.length) return null;

  /*
   * Le mandat SEPA B2B impose au client de le transmettre lui-même à sa
   * banque, et rien n'est prélevable avant cet enregistrement. Aucun outil ne
   * peut le savoir : c'est une saisie humaine, sur retour du client.
   *
   * Sans cette date à l'écran, on croirait pouvoir prélever dès la signature.
   */
  const markSepaRegistered = (contract: Contract) => {
    update(
      "contracts",
      {
        id: contract.id,
        data: { sepa_registered_at: new Date().toISOString().slice(0, 10) },
        previousData: contract,
      },
      {
        onSuccess: () => {
          notify("Mandat noté comme enregistré en banque", { type: "info" });
          refresh();
        },
        onError: () => notify("Mise à jour impossible", { type: "error" }),
      },
    );
  };

  const handleDelete = (contract: Contract) => {
    remove(
      "contracts",
      { id: contract.id, previousData: contract },
      {
        onSuccess: () => {
          notify("Contrat supprimé", { type: "info" });
          refresh();
        },
        onError: () => notify("Suppression impossible", { type: "error" }),
      },
    );
  };

  return (
    <>
      <Card className="p-4 flex flex-col gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Contrats
        </span>

        <ul className="flex flex-col gap-3">
          {contracts.map((contract) => {
            const status =
              STATUS[contract.status as keyof typeof STATUS] ?? STATUS.draft;
            const price = formatUnitPrice(contract.unit_price_cents);
            const signatory = [
              contract.signatory_first_name,
              contract.signatory_last_name,
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <li
                key={contract.id}
                className="flex items-start gap-3 min-w-0 border-t pt-3 first:border-t-0 first:pt-0"
              >
                <FileSignature
                  className="w-4 h-4 shrink-0 text-muted-foreground mt-0.5"
                  aria-hidden
                />

                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="text-sm font-medium">
                    {KIND_LABELS[contract.kind] ?? contract.kind}
                    <span className={`ml-2 text-xs ${status.className}`}>
                      {status.label}
                    </span>
                  </span>

                  {contract.offer_label && (
                    <span className="text-xs text-muted-foreground">
                      {contract.offer_label}
                      {price && ` — ${price}`}
                      {price &&
                        contract.price_unit &&
                        ` / ${contract.price_unit}`}
                    </span>
                  )}

                  {signatory && (
                    <span className="text-xs text-muted-foreground">
                      Signataire : {signatory}
                      {contract.signatory_email &&
                        ` · ${contract.signatory_email}`}
                    </span>
                  )}

                  {/* Le mandat n'est montré que sur le contrat cadre : le POC
                      est gratuit, il n'y a rien à prélever. */}
                  {contract.kind === "cadre" &&
                    contract.sepa_mandate_reference && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Landmark className="w-3 h-3 shrink-0" aria-hidden />
                        Mandat {contract.sepa_mandate_reference} —{" "}
                        {contract.sepa_registered_at ? (
                          <span className="text-[var(--deal-status-won)]">
                            enregistré en banque le{" "}
                            {contract.sepa_registered_at}
                          </span>
                        ) : (
                          <span className="text-[var(--deal-status-warning)]">
                            pas encore enregistré en banque
                          </span>
                        )}
                      </span>
                    )}

                  {contract.kind === "cadre" &&
                    !contract.sepa_registered_at && (
                      <button
                        type="button"
                        onClick={() => markSepaRegistered(contract)}
                        className="text-xs underline hover:no-underline self-start text-muted-foreground hover:text-foreground"
                      >
                        Le client confirme l'enregistrement en banque
                      </button>
                    )}

                  {contract.document_url && (
                    <a
                      href={contract.document_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs underline hover:no-underline self-start"
                    >
                      Ouvrir le document
                    </a>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="Modifier le contrat"
                    onClick={() => setEditing(contract)}
                  >
                    <Pencil className="w-3.5 h-3.5" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="Supprimer le contrat"
                    onClick={() => handleDelete(contract)}
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {editing && (
        <ContractDialog
          deal={record}
          kind={editing.kind as "poc" | "cadre"}
          contract={editing}
          open
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
};
