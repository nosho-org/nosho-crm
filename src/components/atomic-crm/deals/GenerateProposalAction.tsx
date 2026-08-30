import { useState } from "react";
import {
  ChevronDown,
  Download,
  FileText,
  Loader2,
  Printer,
} from "lucide-react";
import { useGetList, useGetOne, useNotify, useRecordContext } from "ra-core";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  contractFileName,
  wrapContractDocument,
} from "../contracts/contractDocument";
import { renderTemplate } from "../contracts/renderTemplate";
import { isClosedStage } from "./cockpit/dealFields";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Company, Contact, Deal, Sale } from "../types";
import { buildProposalPayload } from "./proposalPayload";

// Le gabarit est importé en brut : il reste un document versionné dans `docs/`,
// relisible hors du code, et Vite l'embarque au build.
import gabaritProposition from "../../../../docs/contract-templates/proposition.html?raw";

/**
 * ---------------------------------------------------------------------------
 * La proposition, produite par le CRM (NOS-1192)
 * ---------------------------------------------------------------------------
 * Elle passait par `doc.nosho.org`. Simon : « je ne veux plus du tout qu'on
 * soit connecté à cette url ».
 *
 * ## Ce que la coupure règle au passage
 *
 * Le CRM n'envoyait que six champs au générateur : nom du client, secteur,
 * contact, référence, date, commercial. **Tout le reste était inventé.** Le
 * document parti chez la clinique de Bonneveine affichait 400 rendez-vous par
 * mois, 12 % de no-shows, 80 € le rendez-vous et un gain de 32 256 € — sous la
 * mention « estimation basée sur vos volumes déclarés », alors qu'aucun volume
 * n'avait jamais été saisi.
 *
 * Le gabarit local ne rend que ce que la base porte. La section « bénéfices
 * attendus » n'apparaît que si les trois hypothèses existent ; elles
 * n'existent pas encore, donc elle ne s'affiche pas. Mieux vaut une
 * proposition sans chiffrage qu'une proposition qui en invente un.
 *
 * ## Plus de document stocké
 *
 * Une proposition se regénère à la demande, comme un contrat. Il n'y a donc
 * plus d'URL à conserver, ni de document qui vieillit en base pendant que
 * l'opportunité change.
 */
export const GenerateProposalAction = ({
  variant = "outline",
}: {
  /** `default` quand c'est l'action principale de l'étape (NOS-1172). */
  variant?: "outline" | "default";
} = {}) => {
  const record = useRecordContext<Deal>();
  const notify = useNotify();
  const { dealProducts, dealPipelineStatuses } = useConfigurationContext();
  const [busy, setBusy] = useState<"download" | "print" | null>(null);

  const { data: company } = useGetOne<Company>(
    "companies",
    { id: record?.company_id as number },
    { enabled: record?.company_id != null },
  );
  const { data: sales } = useGetOne<Sale>(
    "sales",
    { id: record?.sales_id as number },
    { enabled: record?.sales_id != null },
  );
  const { data: contacts } = useGetList<Contact>(
    "contacts",
    {
      pagination: { page: 1, perPage: 1 },
      sort: { field: "last_name", order: "ASC" },
      filter: { "id@in": `(${(record?.contact_ids ?? []).join(",")})` },
    },
    { enabled: (record?.contact_ids ?? []).length > 0 },
  );

  if (!record) return null;

  /*
   * Rien a proposer sur une affaire close (NOS-1197).
   *
   * Simon : "tu penses pas que le bouton proposition il sert a rien ?".
   * Pas en Demo/POC, ou c est justement l action principale -- mais en
   * Close Won, Lost et Churn, si : on ne propose rien a un client deja
   * signe, ni a une affaire perdue. Le CRM ne faisait que le METTRE EN
   * AVANT selon l etape, sans jamais le cacher.
   */
  if (isClosedStage(record.stage, dealPipelineStatuses)) return null;

  const construire = (): { html: string; nom: string } | null => {
    if (!company) {
      notify("La fiche société n'est pas chargée.", { type: "warning" });
      return null;
    }

    const payload = buildProposalPayload({
      deal: record,
      company,
      contact: contacts?.[0] ?? null,
      sales: sales ?? null,
      productLabels: (record.products ?? []).map(
        (valeur) =>
          dealProducts.find((p) => p.value === valeur)?.label ?? valeur,
      ),
      now: new Date(),
    });

    const { html, missing } = renderTemplate(
      gabaritProposition,
      payload as unknown as Record<string, unknown>,
    );

    if (missing.length > 0) {
      /*
       * Même règle que pour les contrats : on refuse, et on nomme. Une
       * proposition trouée part chez un prospect et ne se rattrape pas.
       */
      notify(
        `Proposition incomplète, rien n'a été généré. À renseigner : ${missing.join(" · ")}.`,
        { type: "warning", autoHideDuration: 12000 },
      );
      return null;
    }

    return {
      html: wrapContractDocument(html, {
        title: `Proposition — ${company.name}`,
        kicker: "Proposition commerciale",
        clientName: company.name,
        contractDate: payload.proposalDate,
      }),
      nom: contractFileName("proposition", company.name, new Date()).replace(
        "Contrat-POC",
        "Proposition",
      ),
    };
  };

  const telecharger = () => {
    setBusy("download");
    try {
      const doc = construire();
      if (!doc) return;

      const url = URL.createObjectURL(
        new Blob([doc.html], { type: "text/html;charset=utf-8" }),
      );
      const lien = document.createElement("a");
      lien.href = url;
      lien.download = doc.nom;
      lien.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      notify("Proposition générée.", { type: "success" });
    } finally {
      setBusy(null);
    }
  };

  const imprimer = () => {
    setBusy("print");
    try {
      const doc = construire();
      if (!doc) return;

      const onglet = window.open("", "_blank");
      if (!onglet) {
        notify(
          "Le navigateur a bloqué l'ouverture. Autorisez les fenêtres, ou utilisez Télécharger.",
          { type: "warning" },
        );
        return;
      }
      onglet.document.write(doc.html);
      onglet.document.close();
    } finally {
      setBusy(null);
    }
  };

  /*
   * Un menu, pas deux boutons.
   *
   * Le second n etait qu une icone d imprimante sans libelle -- illisible.
   * Et « Editer un contrat », juste en dessous, est deja un menu : deux
   * documents, deux menus, meme forme.
   */
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant={variant}
          disabled={busy !== null || !company}
          className="h-9"
        >
          {busy !== null ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          ) : (
            <FileText className="w-4 h-4" aria-hidden />
          )}
          Proposition
          <ChevronDown className="w-3.5 h-3.5 opacity-50" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={telecharger}>
          <Download className="w-4 h-4" aria-hidden />
          Télécharger
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={imprimer}>
          <Printer className="w-4 h-4" aria-hidden />
          PDF
          <span className="ml-2 text-xs text-muted-foreground">
            via Imprimer
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
