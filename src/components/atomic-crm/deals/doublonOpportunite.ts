import type { Identifier } from "ra-core";

/**
 * ---------------------------------------------------------------------------
 * Prévenir avant de créer une opportunité en double (NOS-1397)
 * ---------------------------------------------------------------------------
 * Simon, le 07/09/2026 : « je veux un garde-fou qui t'avertit si tu crées une
 * opportunité et que la société ou le contact existe déjà ».
 *
 * Le cas visé : on ouvre une affaire pour un établissement qu'un collègue suit
 * déjà. Rien ne l'empêche aujourd'hui, et rien ne le signale — le doublon se
 * découvre des semaines plus tard, quand deux commerciaux se croisent chez le
 * même client. Le pipeline, lui, a compté l'ARR deux fois entre-temps.
 *
 * ## Un avertissement, jamais un blocage
 *
 * Deux opportunités sur une même société sont souvent légitimes : Hôpital
 * Européen en porte deux, « appel sortant » et « déploiement entrant », qui ne
 * parlent pas de la même chose. Un contrôle bloquant refuserait un cas courant
 * et pousserait à contourner — on créerait la société en double pour passer,
 * ce qui est exactement le problème qu'on cherche à éviter.
 *
 * Ce module rend donc ce qu'il a trouvé, et laisse l'interface le montrer. La
 * décision reste à la personne qui saisit ; on lui donne seulement de quoi la
 * prendre.
 *
 * ## Ce qui compte comme doublon
 *
 * Uniquement les opportunités **ouvertes**. Une affaire gagnée l'an dernier
 * chez le même client n'est pas un doublon, c'est un historique ; la signaler
 * transformerait l'alerte en bruit de fond, et une alerte qu'on apprend à
 * ignorer ne protège plus de rien.
 */

/** Le strict nécessaire pour juger d'un doublon. */
export interface OpportuniteExistante {
  id: Identifier;
  name?: string | null;
  stage?: string | null;
  amount?: number | null;
  company_id?: Identifier | null;
  company_name?: string | null;
  contact_ids?: Identifier[] | null;
  sales_id?: Identifier | null;
}

export interface Doublons {
  /** Opportunités ouvertes portées par la même société. */
  parSociete: OpportuniteExistante[];
  /**
   * Opportunités ouvertes partageant un contact, sur une AUTRE société.
   *
   * Le signal le plus interessant des deux : le même interlocuteur suivi sur
   * deux societes differentes revele soit un doublon de societe, soit un
   * contact rattache au mauvais etablissement.
   */
  parContact: OpportuniteExistante[];
}

const VIDE: Doublons = { parSociete: [], parContact: [] };

const memeId = (a: Identifier | null | undefined, b: Identifier | null | undefined) =>
  a != null && b != null && String(a) === String(b);

export interface OptionsDoublon {
  /** Étapes terminales : `closed-won`, `lost`, `churn`. */
  pipelineStatuses: string[];
  /**
   * L'opportunité en cours d'édition, à ne jamais signaler comme son propre
   * doublon. Absent à la création.
   */
  dealActuelId?: Identifier | null;
}

/**
 * Les opportunités ouvertes qui ressemblent à celle qu'on s'apprête à créer.
 *
 * `candidats` est ce que la requête a ramené : on ne suppose pas qu'elle a
 * déjà filtré. Le filtrage vit ici, avec les tests, plutôt que dispersé dans
 * une chaîne de requête que personne ne relit.
 */
export function detecterDoublons(
  candidats: OpportuniteExistante[],
  societeId: Identifier | null | undefined,
  contactIds: Identifier[] | null | undefined,
  options: OptionsDoublon,
): Doublons {
  if (!societeId && !contactIds?.length) return VIDE;

  const terminales = new Set(options.pipelineStatuses);
  const contactsChoisis = new Set((contactIds ?? []).map(String));

  const parSociete: OpportuniteExistante[] = [];
  const parContact: OpportuniteExistante[] = [];

  for (const candidat of candidats) {
    // Une opportunité ne se signale pas elle-même.
    if (memeId(candidat.id, options.dealActuelId)) continue;
    // Close Won, Lost et Churn sont de l'historique, pas des doublons.
    if (candidat.stage && terminales.has(candidat.stage)) continue;

    if (memeId(candidat.company_id, societeId)) {
      parSociete.push(candidat);
      continue; // Déjà signalée : ne pas la compter deux fois.
    }

    if (contactsChoisis.size === 0) continue;
    const partage = (candidat.contact_ids ?? []).some((id) =>
      contactsChoisis.has(String(id)),
    );
    if (partage) parContact.push(candidat);
  }

  return { parSociete, parContact };
}

/** Y a-t-il quelque chose à montrer ? */
export function aDesDoublons(doublons: Doublons): boolean {
  return doublons.parSociete.length > 0 || doublons.parContact.length > 0;
}

/**
 * La phrase d'alerte.
 *
 * Elle nomme ce qui est trouvé plutôt que d'avertir dans le vide : « cette
 * société a déjà 2 opportunités ouvertes » se vérifie d'un coup d'œil, là où
 * « attention, doublon possible » oblige à chercher soi-même.
 */
export function resumerDoublons(
  doublons: Doublons,
  nomSociete?: string | null,
): string {
  const morceaux: string[] = [];
  const n = doublons.parSociete.length;
  if (n > 0) {
    const sujet = nomSociete ? `« ${nomSociete} »` : "Cette société";
    morceaux.push(
      `${sujet} a déjà ${n} opportunité${n > 1 ? "s" : ""} ouverte${n > 1 ? "s" : ""}`,
    );
  }
  const m = doublons.parContact.length;
  if (m > 0) {
    morceaux.push(
      m > 1
        ? `${m} contacts choisis suivent déjà une opportunité ailleurs`
        : `un contact choisi suit déjà une opportunité ailleurs`,
    );
  }
  return `${morceaux.join(", et ")}.`;
}
