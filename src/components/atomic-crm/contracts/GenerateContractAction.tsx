import { useState } from "react";
import { Download, Loader2, Printer } from "lucide-react";
import { useGetOne, useNotify, useRefresh, useUpdate } from "ra-core";
import { Button } from "@/components/ui/button";

import type { Company, Contract, Sale } from "../types";
import { buildContractPayload } from "./contractPayload";
import { checkContractReadiness } from "./contractReadiness";
import { contractFileName, wrapContractDocument } from "./contractDocument";
import { renderTemplate } from "./renderTemplate";

// Les gabarits sont importés en brut : ils restent des documents versionnés
// dans `docs/`, relisibles hors du code, et Vite les embarque au build.
import gabaritPoc from "../../../../docs/contract-templates/contrat-poc.html?raw";
import gabaritCadre from "../../../../docs/contract-templates/contrat-cadre.html?raw";

/**
 * ---------------------------------------------------------------------------
 * Générer le contrat, et le récupérer (NOS-1186)
 * ---------------------------------------------------------------------------
 * Le CRM saisissait des contrats sans jamais produire de document. Cette action
 * ferme la boucle : elle rend le gabarit, l'enveloppe dans un document
 * imprimable, et le remet à l'utilisateur.
 *
 * ## Elle refuse de générer un contrat troué
 *
 * `renderTemplate` retourne les variables qu'il n'a pas su remplir. Si la liste
 * n'est pas vide, on ne télécharge rien et on NOMME ce qui manque.
 *
 * Ce n'est pas de la prudence abstraite : le contrat de l'Hôpital Européen est
 * parti chez le client avec un « [SIREN / FINESS HEM] » non remplacé. Un
 * document contractuel incomplet ne se rattrape pas par un correctif, il se
 * renvoie.
 *
 * ## Deux sorties, un seul rendu
 *
 * Télécharger donne le fichier. PDF ouvre le document dans un onglet, d'où
 * « Imprimer → Enregistrer au format PDF » produit un PDF vectoriel,
 * sélectionnable et cherchable — sans embarquer une bibliothèque PDF de
 * plusieurs centaines de kilooctets pour un résultat moins bon.
 */

const GABARITS: Record<string, string> = {
  poc: gabaritPoc,
  cadre: gabaritCadre,
};


export const GenerateContractAction = ({
  contract,
  dealId,
}: {
  contract: Contract;
  dealId: number;
}) => {
  const notify = useNotify();
  const refresh = useRefresh();
  const [update] = useUpdate();
  const [busy, setBusy] = useState<"download" | "print" | null>(null);

  const { data: company } = useGetOne<Company>(
    "companies",
    { id: contract.company_id as number },
    { enabled: contract.company_id != null },
  );
  const { data: signatory } = useGetOne<Sale>(
    "sales",
    { id: contract.nosho_signatory_id as number },
    { enabled: contract.nosho_signatory_id != null },
  );

  const construire = (): { html: string; nom: string } | null => {
    if (!company) {
      notify("La fiche société n'est pas chargée.", { type: "warning" });
      return null;
    }

    const gabarit = GABARITS[contract.kind];
    if (!gabarit) {
      notify(`Aucun gabarit pour « ${contract.kind} ».`, { type: "error" });
      return null;
    }

    const payload = buildContractPayload({
      contract,
      company,
      noshoSignatory: {
        // Chaines vides et non `null` : `buildContractPayload` les assemble
        // en un nom complet, et `null` s y imprimerait tel quel.
        first_name: signatory?.first_name ?? "",
        last_name: signatory?.last_name ?? "",
        job_title: contract.nosho_signatory_job_title,
      },
      dealId,
      now: new Date(),
    });

    const { html } = renderTemplate(
      gabarit,
      payload as unknown as Record<string, unknown>,
    );

    /*
     * Le refus, en dernier recours.
     *
     * La fenetre de saisie previent deja pendant qu on remplit -- meme
     * fonction, meme regle (NOS-1194). Ce controle reste parce qu un contrat
     * peut avoir ete enregistre avant qu elle n existe, ou parce que la fiche
     * societe a change depuis.
     */
    const etat = checkContractReadiness({
      contract,
      company,
      noshoSignatory: {
        first_name: signatory?.first_name ?? "",
        last_name: signatory?.last_name ?? "",
        job_title: contract.nosho_signatory_job_title,
      },
      dealId,
    });

    if (!etat.ready) {
      const raison = etat.articlesVides.length
        ? `Articles sans texte : ${etat.articlesVides.join(" · ")}.`
        : `À renseigner : ${etat.aCorriger.join(" · ")}.`;
      notify(`Document incomplet, rien n'a été généré. ${raison}`, {
        type: "warning",
        autoHideDuration: 15000,
      });
      return null;
    }
    const intitule =
      contract.kind === "cadre"
        ? "Contrat de service"
        : "Contrat de service — Période d'essai";

    return {
      html: wrapContractDocument(html, {
        title: `${
          contract.kind === "cadre" ? "Contrat cadre" : "Contrat POC"
        } — ${company.name}`,
        // La charte du contrat de reference : intitule en bandeau, client en
        // gros sur la couverture, date sous le filet (NOS-1191).
        kicker: intitule,
        clientName: company.name,
        contractDate: payload.contractDate,
      }),
      nom: contractFileName(contract.kind, company.name, new Date()),
    };
  };

  /*
   * Le statut ne passe à « généré » QUE si un document est réellement sorti.
   *
   * Le marquer avant le rendu ferait dire au CRM qu'un document existe alors
   * que la génération vient d'être refusée pour champs manquants.
   */
  const marquerGenere = () => {
    if (contract.status !== "draft") return;
    update(
      "contracts",
      {
        id: contract.id,
        data: { status: "generated" },
        previousData: contract,
      },
      { onSuccess: () => refresh() },
    );
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
      // Révoquer tout de suite couperait le téléchargement sur les navigateurs
      // qui lisent le Blob de façon différée.
      setTimeout(() => URL.revokeObjectURL(url), 60000);

      marquerGenere();
      notify("Contrat généré.", { type: "success" });
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
      marquerGenere();
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={telecharger}
        disabled={busy !== null || !company}
      >
        {busy === "download" ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
        ) : (
          <Download className="w-3.5 h-3.5" aria-hidden />
        )}
        Télécharger
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={imprimer}
        disabled={busy !== null || !company}
        title="Ouvre le document, puis Imprimer → Enregistrer au format PDF"
      >
        <Printer className="w-3.5 h-3.5" aria-hidden />
        PDF
      </Button>
    </>
  );
};
