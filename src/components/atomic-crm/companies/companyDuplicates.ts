import type { Company } from "../types";

/**
 * ---------------------------------------------------------------------------
 * Détecter les sociétés en double (NOS-1176)
 * ---------------------------------------------------------------------------
 * L'audit du 29 août 2026 relevait six doublons sur les dix-huit premières
 * cartes. La mesure en production est bien pire : **85 groupes, 172 fiches** —
 * Biotech Dental et Clikodoc existent en trois exemplaires.
 *
 * « Un CRM avec des doublons visibles perd la confiance du commercial en une
 * semaine. » C'est le constat le plus coûteux de l'audit, parce qu'il ne
 * s'agit pas d'apparence : chaque doublon coupe en deux l'historique d'un
 * compte, et un commercial qui ouvre la mauvaise fiche croit parler à un
 * prospect froid.
 *
 * ## Le SIRET d'abord, le nom ensuite
 *
 * Deux fiches partageant un SIRET sont **le même établissement**, quoi que
 * disent leurs noms : c'est un identifiant légal, pas une ressemblance. Ce
 * signal est donc traité à part, et présenté comme certain.
 *
 * Le rapprochement par nom, lui, est une **hypothèse**. « Biton » et « Biton »
 * peuvent être deux cabinets sans lien. D'où le vocabulaire de l'interface —
 * « doublons probables » — et le fait que rien ne fusionne sans un clic humain.
 *
 * ## La normalisation est volontairement modeste
 *
 * Accents, casse, ponctuation et espaces multiples sont ignorés. Ce qui n'est
 * PAS fait : retirer les formes juridiques (SAS, SARL), les articles, ou
 * appliquer une distance d'édition. Chacune de ces astuces rapproche de vrais
 * doublons — et en fabrique de faux, qu'un humain fatigué finit par fusionner.
 * Sur des données de santé, deux établissements confondus est un incident bien
 * plus coûteux qu'un doublon laissé en place.
 */

const COMBINING_MARKS = /[̀-ͯ]/g;

/** Minuscules sans accent, ponctuation réduite à des espaces simples. */
export function normalizeCompanyName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Chiffres seuls : un SIRET se saisit avec ou sans espaces. */
export function normalizeSiret(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export interface DuplicateGroup {
  /** `siret` = certain, `name` = probable. */
  kind: "siret" | "name";
  key: string;
  /** Au moins deux, la plus anciennement créée en tête. */
  companies: Company[];
}

/**
 * L'ordre de fusion suggéré : la fiche qui gagne est la mieux renseignée.
 *
 * Le critère n'est pas l'ancienneté. Une fiche créée par erreur puis enrichie
 * vaut mieux qu'une fiche d'origine restée vide, et c'est celle qui porte le
 * SIRET, l'adresse et le descriptif qu'on veut garder. À complétude égale, la
 * plus ancienne l'emporte — elle a le plus de chances d'être celle que les
 * liens externes désignent.
 */
export function completenessScore(company: Company): number {
  const fields = [
    company.tax_identifier,
    company.vat_number,
    company.address,
    company.zipcode,
    company.city,
    company.website,
    company.phone_number,
    company.linkedin_url,
    company.description,
    company.sector,
    company.establishment_type,
  ];
  const filled = fields.filter(
    (value) => typeof value === "string" && value.trim() !== "",
  ).length;

  // Les rattachements pèsent lourd : une fiche qui porte des opportunités et
  // des contacts est celle que l'équipe utilise réellement.
  return filled + (company.nb_deals ?? 0) * 2 + (company.nb_contacts ?? 0);
}

function sortForMerge(companies: Company[]): Company[] {
  return [...companies].sort((a, b) => {
    const byCompleteness = completenessScore(b) - completenessScore(a);
    if (byCompleteness !== 0) return byCompleteness;
    return String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
  });
}

/**
 * Regroupe les sociétés en double.
 *
 * Un groupe par SIRET partagé, puis un groupe par nom normalisé — les fiches
 * déjà regroupées par SIRET n'y réapparaissent pas. Sans cette exclusion, un
 * même trio serait proposé deux fois à la fusion, et l'écran donnerait deux
 * chiffres différents pour le même problème.
 */
export function findDuplicateGroups(companies: Company[]): DuplicateGroup[] {
  const bySiret = new Map<string, Company[]>();
  for (const company of companies) {
    const siret = normalizeSiret(company.tax_identifier);
    // Un SIRET tronqué n'identifie rien : 14 chiffres, ou rien.
    if (siret.length !== 14) continue;
    bySiret.set(siret, [...(bySiret.get(siret) ?? []), company]);
  }

  const siretGroups: DuplicateGroup[] = [];
  const claimed = new Set<string>();

  for (const [key, group] of bySiret) {
    if (group.length < 2) continue;
    siretGroups.push({ kind: "siret", key, companies: sortForMerge(group) });
    group.forEach((company) => claimed.add(String(company.id)));
  }

  const byName = new Map<string, Company[]>();
  for (const company of companies) {
    if (claimed.has(String(company.id))) continue;
    const name = normalizeCompanyName(company.name);
    if (!name) continue;
    byName.set(name, [...(byName.get(name) ?? []), company]);
  }

  const nameGroups: DuplicateGroup[] = [];
  for (const [key, group] of byName) {
    if (group.length < 2) continue;
    nameGroups.push({ kind: "name", key, companies: sortForMerge(group) });
  }

  // Les certitudes d'abord, puis les groupes les plus nombreux : un triplet
  // fait plus de dégâts qu'une paire et se traite en une fois.
  return [
    ...siretGroups.sort((a, b) => b.companies.length - a.companies.length),
    ...nameGroups.sort((a, b) => b.companies.length - a.companies.length),
  ];
}

/** Combien de fiches disparaîtraient si tout était fusionné. */
export function countRedundant(groups: DuplicateGroup[]): number {
  return groups.reduce((sum, group) => sum + group.companies.length - 1, 0);
}
