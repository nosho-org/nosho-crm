/**
 * ---------------------------------------------------------------------------
 * Fusionner les messages venus de plusieurs boîtes (NOS-1607)
 * ---------------------------------------------------------------------------
 * Simon, le 16/09/2026 : « si un user a envoyé un mail à une opportunité, les
 * autres users ne voient pas les mails hormis ceux envoyés par eux-mêmes ».
 *
 * La cause n'était pas un défaut d'affichage : `google-gmail` interrogeait
 * `users/me` avec le jeton de la personne qui regarde. Chacun voyait sa propre
 * boîte, et rien d'autre. La fonction interroge désormais toutes les boîtes
 * connectées des comptes actifs — ce module range ce qu'elles rendent.
 *
 * Il est séparé de `index.ts` parce que c'est la seule partie qui se teste sans
 * Gmail : le reste est de l'appel réseau.
 */

/** Ce qu'on sait de la boîte d'où vient un message. */
export interface Boite {
  salesId: number;
  /** Le nom du commercial, pour l'afficher sur la ligne. */
  name: string;
  email: string | null;
  /** Vrai quand c'est la boîte de la personne qui regarde. */
  own: boolean;
}

export interface MessageDeBoite {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  internalDate: string;
  /**
   * L'en-tête RFC 5322 `Message-ID`, stable d'une boîte à l'autre.
   *
   * L'`id` de Gmail, lui, est **propre à chaque boîte** : le même courriel
   * porte deux identifiants différents chez l'expéditeur et chez le
   * destinataire. Dédoublonner dessus ne dédoublonnerait rien.
   */
  messageId?: string;
  mailbox: Boite;
}

/**
 * La clé de dédoublonnage.
 *
 * `Message-ID` quand il est là — c'est sa raison d'être. Le repli sur
 * « objet + horodatage » couvre les rares messages qui n'en portent pas : deux
 * courriels distincts ayant le même objet à la milliseconde près n'existent
 * pas en pratique, et les confondre coûterait une ligne affichée en moins,
 * jamais une donnée fausse.
 */
function cle(message: MessageDeBoite): string {
  const rfc = message.messageId?.trim();
  if (rfc) return `rfc:${rfc}`;
  return `approx:${message.subject}|${message.internalDate}`;
}

function quand(message: MessageDeBoite): number {
  const brut = Number(message.internalDate);
  if (Number.isFinite(brut) && brut > 0) return brut;
  const date = message.date ? Date.parse(message.date) : Number.NaN;
  return Number.isNaN(date) ? 0 : date;
}

/**
 * Rassemble les lots, retire les doublons, et rend les plus récents d'abord.
 *
 * ## Le doublon garde la version de celui qui regarde
 *
 * Un courriel où deux collègues sont en copie existe dans les deux boîtes. La
 * ligne affichée porte un lien « ouvrir dans Gmail » construit sur le
 * `threadId`, et un `threadId` d'une autre boîte n'existe pas dans la sienne :
 * garder sa propre copie quand elle existe, c'est garder le lien cliquable.
 */
export function fusionnerMessages(
  lots: MessageDeBoite[][],
  max: number,
): MessageDeBoite[] {
  const parCle = new Map<string, MessageDeBoite>();

  for (const lot of lots) {
    for (const message of lot) {
      const k = cle(message);
      const connu = parCle.get(k);
      // Sa propre copie l'emporte ; à défaut, la première vue suffit.
      if (!connu || (message.mailbox.own && !connu.mailbox.own)) {
        parCle.set(k, message);
      }
    }
  }

  return [...parCle.values()]
    .sort((a, b) => quand(b) - quand(a))
    .slice(0, max);
}
