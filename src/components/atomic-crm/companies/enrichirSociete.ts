import type { Company } from "../types";

/**
 * ---------------------------------------------------------------------------
 * L'appel d'enrichissement, écrit une fois (NOS-1432)
 * ---------------------------------------------------------------------------
 * Simon, le 08/09/2026 : « quand tu crées la société depuis l'opportunité, tu
 * n'as pas le check API Pappers pour remplir automatiquement les infos et
 * générer la présentation ».
 *
 * Il avait raison, et la cause tient en une phrase : l'enrichissement vivait
 * dans la page **complète** de création de société, jamais dans la feuille
 * rapide ouverte depuis une opportunité. Deux formulaires pour le même objet,
 * dont un seul savait interroger le registre.
 *
 * Ce module ne contient que **l'appel et la lecture de sa réponse**. L'interface
 * reste propre à chaque écran — une page a la place d'afficher un choix
 * d'établissements, une feuille latérale non — mais le contrat avec la fonction
 * `enrich-company-ai` est désormais décrit à un seul endroit.
 *
 * ## Trois réponses, pas une
 *
 * La fonction distingue des cas que le mot « échec » confondrait :
 *
 *   * `not_found`  — le registre ne connaît pas cette société ;
 *   * `qualitative_unavailable` — elle existe, mais le modèle n'a rien pu dire
 *     (clé absente, quota, panne). Les données du registre restent valables ;
 *   * `legal_candidates` — le nom ne tranche pas entre plusieurs
 *     établissements, il faut demander lequel.
 *
 * Les confondre produirait exactement le défaut de NOS-1211 : un écran
 * d'enrichissement d'apparence réussie, avec une adresse et sans description,
 * et rien qui dise pourquoi.
 */

/** Un établissement du registre, proposé au choix quand le nom ne tranche pas. */
export interface CandidatLegal {
  siren: string;
  siret?: string;
  name: string;
  city?: string;
  zipcode?: string;
  forme_juridique?: string;
  date_creation?: string;
}

export type Enrichissement = Partial<Company> & {
  not_found?: boolean;
  qualitative_unavailable?: boolean;
  legal_candidates?: CandidatLegal[];
};

/** Ce qu'il faut pour invoquer la fonction. Injecté, pour rester testable. */
export interface AppelFonction {
  (
    nom: string,
    options: { body: Record<string, unknown> },
  ): Promise<{ data?: unknown; error?: unknown }>;
}

export interface OptionsEnrichissement {
  /** Secteurs et types proposés au modèle, pour qu'il classe dans la maison. */
  sectors?: { value: string; label: string }[];
  types?: { value: string; label: string }[];
  /**
   * Un établissement déjà choisi.
   *
   * Second appel, sur le registre seul : le qualitatif est déjà à l'écran, et
   * relancer le modèle coûterait un appel pour réécrire la même chose.
   */
  siren?: string;
}

/**
 * Interroge `enrich-company-ai` et rend sa réponse, ou lève.
 *
 * Lève plutôt que de rendre un objet d'erreur : les deux appelants notifient
 * de la même façon, et un `try`/`catch` se lit mieux qu'un champ à tester à
 * chaque usage. Les cas *métier* — introuvable, modèle muet, choix à faire —
 * ne sont pas des erreurs et reviennent dans la réponse.
 */
export async function enrichirSociete(
  invoquer: AppelFonction,
  nom: string,
  options: OptionsEnrichissement = {},
): Promise<Enrichissement> {
  const propre = nom.trim();
  if (!propre) throw new Error("Le nom de la société est vide");

  const { data, error } = await invoquer("enrich-company-ai", {
    body: {
      name: propre,
      ...(options.siren ? { siren: options.siren } : {}),
      ...(options.sectors ? { sectors: options.sectors } : {}),
      ...(options.types ? { types: options.types } : {}),
    },
  });

  if (error) throw error instanceof Error ? error : new Error(String(error));

  const reponse = (data ?? {}) as Enrichissement & { error?: string };
  // La fonction rend ses pannes dans le corps, pas dans le statut HTTP.
  if (reponse.error) throw new Error(reponse.error);

  return reponse;
}

/**
 * Ce qui est réellement écrit sur la fiche, une fois le bruit retiré.
 *
 * `not_found`, `qualitative_unavailable` et `legal_candidates` sont des
 * messages pour l'écran, jamais des colonnes de `companies`. Les laisser
 * passer les enverrait dans un `INSERT`, où PostgREST les refuserait — ou
 * pire, les accepterait dans une colonne homonyme.
 *
 * Le nom saisi n'est jamais écrasé : c'est celui que l'utilisateur cherchait,
 * et le registre rend parfois une raison sociale que personne ne reconnaît
 * (« SELARL DU DOCTEUR X » pour un cabinet connu sous un autre nom).
 */
export function championsAEcrire(
  enrichissement: Enrichissement,
): Partial<Company> {
  const {
    not_found: _introuvable,
    qualitative_unavailable: _muet,
    legal_candidates: _candidats,
    name: _nom,
    ...reste
  } = enrichissement;

  // Les champs vides du registre n'effacent pas ce qui est déjà saisi.
  return Object.fromEntries(
    Object.entries(reste).filter(
      ([, valeur]) => valeur != null && valeur !== "",
    ),
  ) as Partial<Company>;
}
