import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { googleFetch } from "../_shared/googleAuth.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { fusionnerMessages, type MessageDeBoite } from "./fusionnerMessages.ts";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

interface GmailMessageHeader {
  name: string;
  value: string;
}

interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  internalDate: string;
  payload?: {
    headers?: GmailMessageHeader[];
  };
}

function getHeader(
  headers: GmailMessageHeader[] | undefined,
  name: string,
): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/**
 * Les boîtes à interroger : toutes celles connectées, sur un compte actif.
 *
 * Un compte désactivé est un départ : sa boîte n'a plus à être lue, même si son
 * jeton dort encore en base. Vérifié en production — une des trois connexions
 * appartient à un compte désactivé.
 */
async function boitesAInterroger(viewerUserId: string): Promise<Boite[]> {
  /*
   * Deux requêtes plutôt qu'une jointure imbriquée PostgREST.
   *
   * `select("... sales!inner(...)")` avec un `.not("sales.disabled", ...)`
   * ferait le travail en un aller-retour, mais sa syntaxe ne se vérifie qu'en
   * l'exécutant — et une erreur de forme y passe la relecture pour échouer à
   * l'exécution. Deux `select` plats contre la même base, dans la même région,
   * coûtent quelques millisecondes et ne peuvent pas se tromper.
   */
  const { data: jetons, error: erreurJetons } = await supabaseAdmin
    .from("google_oauth_tokens")
    .select("user_id, sales_id, google_email");

  if (erreurJetons) {
    console.error("Lecture des boites connectees impossible:", erreurJetons.message);
    throw new Error("MAILBOXES_UNAVAILABLE");
  }

  const salesIds = (jetons ?? []).map((j: any) => j.sales_id).filter(Boolean);
  if (salesIds.length === 0) return [];

  const { data: commerciaux, error: erreurSales } = await supabaseAdmin
    .from("sales")
    .select("id, first_name, last_name, disabled")
    .in("id", salesIds);

  if (erreurSales) {
    console.error("Lecture des commerciaux impossible:", erreurSales.message);
    throw new Error("MAILBOXES_UNAVAILABLE");
  }

  const parId = new Map<number, any>(
    (commerciaux ?? []).map((s: any) => [s.id as number, s]),
  );

  return (jetons ?? [])
    .map((jeton: any) => {
      const commercial = parId.get(jeton.sales_id);
      return { jeton, commercial };
    })
    // Un compte désactivé est un départ : sa boîte n'a plus à être lue, même
    // si son jeton dort encore en base. Un jeton orphelin — plus de ligne dans
    // `sales` — est écarté pour la même raison.
    .filter(({ commercial }) => commercial && commercial.disabled !== true)
    .map(({ jeton, commercial }) => ({
      userId: jeton.user_id as string,
      salesId: jeton.sales_id as number,
      email: (jeton.google_email ?? null) as string | null,
      name: `${commercial.first_name ?? ""} ${commercial.last_name ?? ""}`.trim(),
      own: jeton.user_id === viewerUserId,
    }));
}

interface Boite {
  userId: string;
  salesId: number;
  name: string;
  email: string | null;
  own: boolean;
}

/** Interroge UNE boîte. Rend une liste vide plutôt que de lever : voir plus bas. */
async function listerDansUneBoite(
  boite: Boite,
  query: string,
  maxResults: number,
): Promise<{ messages: MessageDeBoite[]; estimate: number }> {
  const queryParams = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
  });

  const listResponse = await googleFetch(
    boite.userId,
    `${GMAIL_API_BASE}/messages?${queryParams}`,
  );

  if (!listResponse.ok) {
    const errorBody = await listResponse.text();
    console.error(
      `Gmail list error (${boite.email}):`,
      listResponse.status,
      errorBody,
    );
    throw new Error(`Gmail API error: ${listResponse.status}`);
  }

  const listData = await listResponse.json();
  const messageIds: Array<{ id: string; threadId: string }> =
    listData.messages ?? [];

  if (messageIds.length === 0) {
    return { messages: [], estimate: listData.resultSizeEstimate ?? 0 };
  }

  const messages = await Promise.all(
    messageIds.slice(0, maxResults).map(async (msg) => {
      /*
       * `Message-ID` s'ajoute aux en-têtes demandés (NOS-1607) : c'est la seule
       * clé stable d'une boîte à l'autre, l'`id` de Gmail étant propre à chaque
       * boîte. Sans lui, un courriel où deux collègues sont en copie
       * s'afficherait deux fois.
       */
      const msgUrl = `${GMAIL_API_BASE}/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date&metadataHeaders=Message-ID`;
      const msgResponse = await googleFetch(boite.userId, msgUrl);

      if (!msgResponse.ok) return null;

      const msgData: GmailMessage = await msgResponse.json();
      const headers = msgData.payload?.headers;

      return {
        id: msgData.id,
        threadId: msgData.threadId,
        subject: getHeader(headers, "Subject"),
        from: getHeader(headers, "From"),
        to: getHeader(headers, "To"),
        date: getHeader(headers, "Date"),
        snippet: msgData.snippet,
        internalDate: msgData.internalDate,
        messageId: getHeader(headers, "Message-ID"),
        mailbox: {
          salesId: boite.salesId,
          name: boite.name,
          email: boite.email,
          own: boite.own,
        },
      } as MessageDeBoite;
    }),
  );

  return {
    messages: messages.filter(Boolean) as MessageDeBoite[],
    estimate: listData.resultSizeEstimate ?? 0,
  };
}

/**
 * ---------------------------------------------------------------------------
 * Les mails d'un contact, vus de TOUTES les boîtes de l'équipe (NOS-1607)
 * ---------------------------------------------------------------------------
 * Simon : « si un user a envoyé un mail à une opportunité, les autres users ne
 * voient pas les mails hormis ceux envoyés par eux-mêmes ».
 *
 * Cette fonction appelait `users/me` avec le jeton de la personne qui regarde,
 * donc chacun ne voyait que sa propre correspondance. Elle balaie désormais
 * toutes les boîtes connectées des comptes actifs.
 *
 * ## Ce que cela rend visible, et ce que cela ne rend pas
 *
 * Seuls remontent les messages dont l'expéditeur ou le destinataire est une
 * adresse du contact : le filtre Gmail est inchangé. Et seules les
 * **métadonnées** traversent — objet, extrait, expéditeur, date. Le corps du
 * message n'est jamais lu (`format=metadata`).
 *
 * ## Une boîte muette n'emporte pas les autres
 *
 * Un jeton expiré dont le rafraîchissement échoue levait, et l'écran restait
 * vide. Avec plusieurs boîtes, ce serait pire : la panne d'une seule masquerait
 * la correspondance de toute l'équipe. Chaque boîte est donc isolée, et celles
 * qui échouent sont **nommées** dans la réponse plutôt que tues — un bloc vide
 * sans explication est exactement ce que NOS-1069 avait déjà corrigé ici.
 */
async function listMessages(
  viewerUserId: string,
  params: {
    emails: string[];
    maxResults?: number;
  },
) {
  const maxResults = params.maxResults ?? 15;

  // Build Gmail search query: from/to any of the contact's emails
  const emailQueries = params.emails
    .map((email) => `from:${email} OR to:${email}`)
    .join(" OR ");
  const query = `(${emailQueries})`;

  const boites = await boitesAInterroger(viewerUserId);

  const resultats = await Promise.all(
    boites.map(async (boite) => {
      try {
        const { messages, estimate } = await listerDansUneBoite(
          boite,
          query,
          maxResults,
        );
        return { boite, messages, estimate, enPanne: false };
      } catch (error) {
        console.error(
          `Boite ${boite.email ?? boite.salesId} injoignable:`,
          error instanceof Error ? error.message : error,
        );
        return { boite, messages: [], estimate: 0, enPanne: true };
      }
    }),
  );

  return {
    messages: fusionnerMessages(
      resultats.map((r) => r.messages),
      maxResults,
    ),
    /*
     * Plus de curseur : il n'y a pas de pagination commune à plusieurs boîtes,
     * et le client n'en demandait aucune. Le champ reste pour ne pas casser la
     * forme de la réponse.
     */
    nextPageToken: null,
    // La somme des estimations, qui n'est qu'un ordre de grandeur -- Gmail ne
    // promet pas l'exactitude, et les doublons entre boites y sont comptes deux
    // fois. Il ne sert qu'a ecrire « + N autres ».
    totalEstimate: resultats.reduce((somme, r) => somme + r.estimate, 0),
    boitesInterrogees: boites.length,
    boitesEnPanne: resultats
      .filter((r) => r.enPanne)
      .map((r) => r.boite.name || r.boite.email || `#${r.boite.salesId}`),
  };
}

async function getMessage(
  userId: string,
  params: { messageId: string },
) {
  const url = `${GMAIL_API_BASE}/messages/${params.messageId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date&metadataHeaders=Cc`;
  const response = await googleFetch(userId, url);

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Gmail get error:", response.status, errorBody);
    throw new Error(`Gmail API error: ${response.status}`);
  }

  const msgData: GmailMessage = await response.json();
  const headers = msgData.payload?.headers;

  return {
    id: msgData.id,
    threadId: msgData.threadId,
    subject: getHeader(headers, "Subject"),
    from: getHeader(headers, "From"),
    to: getHeader(headers, "To"),
    cc: getHeader(headers, "Cc"),
    date: getHeader(headers, "Date"),
    snippet: msgData.snippet,
    internalDate: msgData.internalDate,
  };
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req, user) => {
        if (req.method !== "POST") {
          return createErrorResponse(405, "Method Not Allowed");
        }

        try {
          const { action, ...params } = await req.json();

          let result: unknown;

          switch (action) {
            case "list-messages":
              if (!params.emails?.length) {
                return createErrorResponse(400, "Missing emails parameter");
              }
              result = await listMessages(user!.id, params);
              break;

            case "get-message":
              if (!params.messageId) {
                return createErrorResponse(400, "Missing messageId parameter");
              }
              result = await getMessage(user!.id, params);
              break;

            default:
              return createErrorResponse(400, `Unknown action: ${action}`);
          }

          return new Response(JSON.stringify({ data: result }), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        } catch (e) {
          console.error("google-gmail error:", e);
          const message = e instanceof Error ? e.message : "Internal error";
          if (message === "GOOGLE_NOT_CONNECTED" || message === "GOOGLE_TOKEN_EXPIRED") {
            return createErrorResponse(401, message);
          }
          return createErrorResponse(500, message);
        }
      }),
    ),
  ),
);
