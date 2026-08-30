import { useState } from "react";
import { Download, Loader2, Printer } from "lucide-react";
import { useGetOne, useNotify, useRefresh, useUpdate } from "ra-core";
import { Button } from "@/components/ui/button";

import type { Company, Contract, Sale } from "../types";
import { buildContractPayload } from "./contractPayload";
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

/** Ce que `missing` renvoie, traduit en ce que l'utilisateur doit corriger. */
const OU_CORRIGER: Record<string, string> = {
  "client.name": "le nom de la société",
  "client.siret": "le SIRET, sur la fiche société",
  "client.address": "l'adresse, sur la fiche société",
  "client.zipcode": "le code postal, sur la fiche société",
  "client.city": "la ville, sur la fiche société",
  "client.legalForm": "la forme juridique — bouton Compléter depuis le registre",
  "client.shareCapital": "le capital social — bouton Compléter depuis le registre",
  "client.rcsCity": "la ville du RCS — bouton Compléter depuis le registre",
  "client.rcsNumber": "le numéro RCS, déduit du SIRET",
  "client.apeCode": "le code APE — bouton Compléter depuis le registre",
  "signatory.firstName": "le prénom du signataire",
  "signatory.lastName": "le nom du signataire",
  noshoSignatoryName: "le signataire Nosho",
  noshoSignatoryJobTitle: "la fonction du signataire Nosho",
  "trial.startDate": "la date de début de la période d'essai",
  "trial.endDate": "la date de fin de la période d'essai",
  sepaMandateReference: "la référence du mandat SEPA",
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

    const { html, missing } = renderTemplate(
      gabarit,
      payload as unknown as Record<string, unknown>,
    );

    if (missing.length > 0) {
      /*
       * On refuse, et on nomme. Une notification « document incomplet » sans la
       * liste obligerait à comparer le document au gabarit ligne à ligne.
       */
      const quoi = missing
        .map((cle) => OU_CORRIGER[cle] ?? cle)
        .filter((valeur, index, toutes) => toutes.indexOf(valeur) === index);
      notify(
        `Document incomplet, rien n'a été généré. À renseigner : ${quoi.join(" · ")}.`,
        { type: "warning", autoHideDuration: 12000 },
      );
      return null;
    }

    /*
     * Le second garde-fou : les articles restes vides (NOS-1189).
     *
     * `renderTemplate` ne signale que les VARIABLES non resolues. Un article
     * dont la prose n a jamais ete reprise ne porte aucune variable -- il
     * porte un commentaire "TEXTE A REPRENDRE", que le rendu laisse passer
     * sans rien dire.
     *
     * Le gabarit du contrat cadre est dans ce cas sur six de ses treize
     * articles, securite, continuite, RGPD et responsabilites compris. Sans
     * ce controle, il se telechargerait silencieusement ampute -- et un
     * contrat sans article de responsabilite se signe tout aussi bien qu un
     * autre, jusqu au litige.
     */
    const NON_REDIGE = /TEXTE\s+[ÀA]\s+REPRENDRE/i;
    const vides = [
      ...html.matchAll(
        /<h2>([^<]*)<\/h2>\s*<!--\s*TEXTE\s+[ÀA]\s+REPRENDRE/gi,
      ),
    ].map((m) => m[1].replace(/&amp;/g, "&").trim());

    if (NON_REDIGE.test(html)) {
      notify(
        vides.length > 0
          ? `Gabarit incomplet, rien n a ete genere. Articles sans texte : ${vides.join(" · ")}.`
          : "Gabarit incomplet : il reste des sections non redigees. Rien n a ete genere.",
        { type: "error", autoHideDuration: 15000 },
      );
      return null;
    }

    return {
      html: wrapContractDocument(html, {
        title: `${
          contract.kind === "cadre" ? "Contrat cadre" : "Contrat POC"
        } — ${company.name}`,
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
