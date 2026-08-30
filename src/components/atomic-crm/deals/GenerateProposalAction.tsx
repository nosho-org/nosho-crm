import { useState } from "react";
import { Download, FileText, Loader2, Printer } from "lucide-react";
import { useGetList, useGetOne, useNotify, useRecordContext } from "ra-core";
import { Button } from "@/components/ui/button";

import {
  contractFileName,
  wrapContractDocument,
} from "../contracts/contractDocument";
import { renderTemplate } from "../contracts/renderTemplate";
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
  const { dealProducts } = useConfigurationContext();
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

  return (
    <>
      <Button
        size="sm"
        variant={variant}
        onClick={telecharger}
        disabled={busy !== null || !company}
        className="h-9"
      >
        {busy === "download" ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
        ) : (
          <FileText className="w-4 h-4" aria-hidden />
        )}
        Proposition
        <Download className="w-3.5 h-3.5 opacity-60" aria-hidden />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={imprimer}
        disabled={busy !== null || !company}
        className="h-9"
        title="Ouvre la proposition, puis Imprimer → Enregistrer au format PDF"
        aria-label="Proposition en PDF"
      >
        <Printer className="w-3.5 h-3.5" aria-hidden />
      </Button>
    </>
  );
};
