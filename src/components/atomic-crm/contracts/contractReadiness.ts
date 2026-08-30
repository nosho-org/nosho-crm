import type { Contract, Sale } from "../types";
import { buildContractPayload } from "./contractPayload";
import { renderTemplate } from "./renderTemplate";

import gabaritPoc from "../../../../docs/contract-templates/contrat-poc.html?raw";
import gabaritCadre from "../../../../docs/contract-templates/contrat-cadre.html?raw";

/**
 * ---------------------------------------------------------------------------
 * Ce qui manque pour générer, dit AVANT d'essayer (NOS-1194)
 * ---------------------------------------------------------------------------
 * Simon : « je viens de cliquer sur télécharger et j'ai ce message […] c'est
 * con, faudrait que ça bloque avant la génération du document ».
 *
 * Il a raison. Un contrat s'enregistrait, semblait complet, et ne révélait ses
 * trous qu'au clic sur Télécharger — parfois des jours plus tard, devant un
 * client qui attend.
 *
 * Ce module porte la règle, et **une seule fois**. La fenêtre de saisie s'en
 * sert pour prévenir pendant qu'on saisit ; l'action de génération s'en sert
 * pour refuser. Deux écrans, une définition : ils ne peuvent pas diverger.
 *
 * ## La règle n'est pas écrite à la main
 *
 * Elle est **déduite du gabarit** : on rend le document et on regarde ce qui
 * n'a pas pu être rempli. Une liste de champs obligatoires maintenue à côté du
 * gabarit se serait désynchronisée dès la première clause ajoutée — et
 * personne ne l'aurait vu avant l'envoi.
 */

export const GABARITS: Record<string, string> = {
  poc: gabaritPoc,
  cadre: gabaritCadre,
};

/**
 * Ce que `missing` renvoie, traduit en ce que l'utilisateur doit corriger.
 *
 * Le chemin technique ne dit pas où agir : `client.rcsCity` ne se saisit pas
 * dans la fenêtre de contrat mais se rapatrie du registre, et
 * `signatory.jobTitle` est à deux champs de là. Sans cette traduction, le
 * message renvoie à une chasse au trésor.
 */
const OU_CORRIGER: Record<string, string> = {
  "client.name": "le nom de la société",
  "client.siret": "le SIRET, sur la fiche société",
  "client.address": "l'adresse, sur la fiche société",
  "client.zipcode": "le code postal, sur la fiche société",
  "client.city": "la ville, sur la fiche société",
  "client.legalForm": "la forme juridique — bouton Compléter depuis le registre",
  "client.shareCapital":
    "le capital social — bouton Compléter depuis le registre",
  "client.rcsCity": "la ville du RCS — bouton Compléter depuis le registre",
  "client.rcsNumber": "le numéro RCS, déduit du SIRET",
  "client.apeCode": "le code APE — bouton Compléter depuis le registre",
  "signatory.firstName": "le prénom du signataire client",
  "signatory.lastName": "le nom du signataire client",
  "signatory.jobTitle": "la fonction du signataire client",
  noshoSignatoryName: "le signataire Nosho",
  noshoSignatoryJobTitle: "la fonction du signataire Nosho",
  "trial.startDate": "la date de début de la période d'essai",
  "trial.endDate": "la date de fin de la période d'essai",
  "trial.weeks": "la durée de la période d'essai",
  commitmentMonths: "la durée d'engagement",
  renewalMonths: "la durée de reconduction",
  noticeDays: "le préavis de résiliation",
  referentEmail: "l'e-mail du référent client",
  sepaMandateReference: "la référence du mandat SEPA",
  contractDate: "la date du contrat",
  contractRef: "la référence du contrat",
};

/** Traduit et dédoublonne — deux chemins peuvent viser la même correction. */
export function describeMissing(missing: string[]): string[] {
  return missing
    .map((cle) => OU_CORRIGER[cle] ?? cle)
    .filter((valeur, index, toutes) => toutes.indexOf(valeur) === index);
}

export interface ReadinessInput {
  contract: Partial<Contract>;
  company: Parameters<typeof buildContractPayload>[0]["company"];
  noshoSignatory: Pick<Sale, "first_name" | "last_name"> & {
    job_title?: string | null;
  };
  dealId: number;
  now?: Date;
}

export interface Readiness {
  /** Les chemins bruts, pour les tests et le débogage. */
  missing: string[];
  /** Les corrections à faire, en français, dédoublonnées. */
  aCorriger: string[];
  /** Articles du gabarit restés à rédiger — voir ci-dessous. */
  articlesVides: string[];
  ready: boolean;
}

/*
 * Les sections jamais rédigées.
 *
 * `renderTemplate` ne signale que les VARIABLES non résolues. Un article dont
 * la prose n'a jamais été reprise n'en porte aucune : il porte un commentaire,
 * que le rendu laisse passer sans rien dire. Un contrat sans article de
 * responsabilité se signe tout aussi bien qu'un autre, jusqu'au litige.
 */
const NON_REDIGE = /TEXTE\s+[ÀA]\s+REPRENDRE/i;
const ARTICLE_VIDE = /<h2>([^<]*)<\/h2>\s*<!--\s*TEXTE\s+[ÀA]\s+REPRENDRE/gi;

/** Rend le gabarit à blanc et rapporte tout ce qui empêcherait de le livrer. */
export function checkContractReadiness(input: ReadinessInput): Readiness {
  const { contract, company, noshoSignatory, dealId, now = new Date() } = input;

  const gabarit = GABARITS[contract.kind ?? "poc"];
  if (!gabarit) {
    return {
      missing: [],
      aCorriger: [`aucun gabarit pour « ${contract.kind} »`],
      articlesVides: [],
      ready: false,
    };
  }

  const payload = buildContractPayload({
    contract,
    company,
    noshoSignatory,
    dealId,
    now,
  });

  const { html, missing } = renderTemplate(
    gabarit,
    payload as unknown as Record<string, unknown>,
  );

  const articlesVides = [...html.matchAll(ARTICLE_VIDE)].map((m) =>
    m[1].replace(/&amp;/g, "&").trim(),
  );

  return {
    missing,
    aCorriger: describeMissing(missing),
    articlesVides,
    ready: missing.length === 0 && !NON_REDIGE.test(html),
  };
}
