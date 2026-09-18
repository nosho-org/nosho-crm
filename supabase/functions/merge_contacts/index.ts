import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { sql, type Selectable } from "https://esm.sh/kysely@0.27.2";
import { db, type ContactsTable, CompiledQuery } from "../_shared/db.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";

type Contact = Selectable<ContactsTable>;

// Helper functions to merge arrays
function mergeArraysUnique<T>(arr1: T[], arr2: T[]): T[] {
  return [...new Set([...arr1, ...arr2])];
}

function mergeObjectArraysUnique<T>(
  arr1: T[],
  arr2: T[],
  getKey: (item: T) => string,
): T[] {
  const map = new Map<string, T>();

  arr1.forEach((item) => {
    const key = getKey(item);
    if (key) map.set(key, item);
  });

  arr2.forEach((item) => {
    const key = getKey(item);
    if (key && !map.has(key)) {
      map.set(key, item);
    }
  });

  return Array.from(map.values());
}

function mergeContactData(winner: Contact, loser: Contact) {
  // Merge emails
  const mergedEmails = mergeObjectArraysUnique(
    winner.email_jsonb || [],
    loser.email_jsonb || [],
    (email: any) => email.email,
  );

  // Merge phones
  const mergedPhones = mergeObjectArraysUnique(
    winner.phone_jsonb || [],
    loser.phone_jsonb || [],
    (phone: any) => phone.number,
  );

  const selectedAvatar =
    winner.avatar && winner.avatar.src ? winner.avatar : loser.avatar;

  return {
    avatar: selectedAvatar ? (JSON.stringify(selectedAvatar) as any) : null,
    gender: winner.gender ?? loser.gender,
    first_name: winner.first_name ?? loser.first_name,
    last_name: winner.last_name ?? loser.last_name,
    title: winner.title ?? loser.title,
    company_id: winner.company_id ?? loser.company_id,
    email_jsonb: JSON.stringify(mergedEmails) as any,
    phone_jsonb: JSON.stringify(mergedPhones) as any,
    linkedin_url: winner.linkedin_url || loser.linkedin_url,
    background: winner.background ?? loser.background,
    has_newsletter: winner.has_newsletter ?? loser.has_newsletter,
    first_seen: winner.first_seen ?? loser.first_seen,
    last_seen:
      winner.last_seen && loser.last_seen
        ? winner.last_seen > loser.last_seen
          ? winner.last_seen
          : loser.last_seen
        : (winner.last_seen ?? loser.last_seen),
    sales_id: winner.sales_id ?? loser.sales_id,
    tags: mergeArraysUnique(winner.tags || [], loser.tags || []),
  };
}

async function mergeContacts(
  loserId: number,
  winnerId: number,
  userId: string,
) {
  try {
    return await db.transaction().execute(async (trx) => {
      // Enable RLS by switching to authenticated role and setting user context
      await trx.executeQuery(CompiledQuery.raw("SET LOCAL ROLE authenticated"));
      await trx.executeQuery(
        CompiledQuery.raw(
          `SELECT set_config('request.jwt.claim.sub', '${userId}', true)`,
        ),
      );

      // 1. Fetch both contacts
      const [winner, loser] = await Promise.all([
        trx
          .selectFrom("contacts")
          .selectAll()
          .where("id", "=", winnerId)
          .executeTakeFirstOrThrow(),
        trx
          .selectFrom("contacts")
          .selectAll()
          .where("id", "=", loserId)
          .executeTakeFirstOrThrow(),
      ]);

      // 2. Reassign tasks from loser to winner
      await trx
        .updateTable("tasks")
        .set({ contact_id: winnerId })
        .where("contact_id", "=", loserId)
        .execute();

      // 3. Reassign notes from loser to winner
      await trx
        .updateTable("contact_notes")
        .set({ contact_id: winnerId })
        .where("contact_id", "=", loserId)
        .execute();

      // 4. Update deals - replace loserId with winnerId in contact_ids array
      const deals = await trx
        .selectFrom("deals")
        .selectAll()
        .where(sql`contact_ids @> ARRAY[${loserId}]::bigint[]`)
        .execute();

      for (const deal of deals) {
        const newContactIds = [
          ...new Set(
            deal.contact_ids.filter((id) => id !== loserId).concat(winnerId),
          ),
        ];
        await trx
          .updateTable("deals")
          .set({ contact_ids: newContactIds })
          .where("id", "=", deal.id)
          .execute();
      }

      /*
       * 4 bis. Les appels, les SMS et le lien Allo suivent le contact
       * (NOS-1622).
       *
       * Sans cela, la suppression du perdant plus bas detruit ce que la fusion
       * servait a sauver :
       *
       *   call_logs         `on delete set null` -- l'appel perd son contact,
       *                     et sa transcription devient orpheline ;
       *   sms_messages      idem ;
       *   allo_contact_links `on delete CASCADE` -- le pivot Allo disparait, et
       *                     le prochain appel du meme numero recree un contact
       *                     fantome. Celui-la ne fait pas qu'oublier le passe :
       *                     il condamne l'avenir a repeter l'erreur.
       *
       * Mesure avant ecriture : 83 des 104 appels de production sont tombes sur
       * un contact cree automatiquement par Allo, et aucun n'est rattache a une
       * opportunite. La reconciliation manuelle est la seule voie de rattrapage,
       * et elle passe par cette fusion.
       *
       * Le pivot se deplace par un simple UPDATE : `uq_allo_contact_links_allo_id`
       * rend un identifiant Allo unique toutes lignes confondues, donc le
       * gagnant ne peut pas deja porter celui du perdant.
       */
      await trx
        .updateTable("call_logs")
        .set({ contact_id: winnerId })
        .where("contact_id", "=", loserId)
        .execute();

      await trx
        .updateTable("sms_messages")
        .set({ contact_id: winnerId })
        .where("contact_id", "=", loserId)
        .execute();

      await trx
        .updateTable("allo_contact_links")
        .set({ contact_id: winnerId })
        .where("contact_id", "=", loserId)
        .execute();

      /*
       * 4 ter. Rattacher a une opportunite les appels qui n'en avaient pas.
       *
       * `process_allo_call` calcule ce lien UNE FOIS, a l'arrivee du webhook.
       * Un appel passe avant que l'opportunite n'existe -- le cas normal en
       * prospection -- reste donc sans rattachement pour toujours.
       *
       * Meme regle que la fonction SQL, volontairement : affaire non archivee
       * contenant le contact, la plus recemment modifiee d'abord. En ecrire une
       * seconde, differente, ferait diverger deux definitions du meme lien.
       *
       * `deal_id is null` seulement : un rattachement deja etabli, fut-il a une
       * autre affaire, a ete decide ailleurs et n'est pas a rediscuter ici.
       */
      await sql`
        update public.call_logs cl
           set deal_id = (
                 select d.id
                   from public.deals d
                  where d.archived_at is null
                    and d.contact_ids @> array[${winnerId}]::bigint[]
                  order by d.updated_at desc, d.id desc
                  limit 1
               )
         where cl.contact_id = ${winnerId}
           and cl.deal_id is null
      `.execute(trx);

      // 5. Merge and update winner contact
      const mergedData = mergeContactData(winner as Contact, loser as Contact);
      await trx
        .updateTable("contacts")
        .set(mergedData)
        .where("id", "=", winnerId)
        .execute();

      // 6. Delete loser contact
      await trx.deleteFrom("contacts").where("id", "=", loserId).execute();

      return { success: true, winnerId };
    });
  } catch (error) {
    console.error("Transaction failed:", error);
    throw error;
  }
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req, user) => {
        // Handle POST request
        if (req.method === "POST") {
          try {
            const { loserId, winnerId } = await req.json();

            if (!loserId || !winnerId) {
              return createErrorResponse(400, "Missing loserId or winnerId");
            }

            const result = await mergeContacts(loserId, winnerId, user.id);

            return new Response(JSON.stringify(result), {
              headers: { "Content-Type": "application/json", ...corsHeaders },
            });
          } catch (error) {
            console.error("Merge failed:", error);
            return createErrorResponse(
              500,
              `Failed to merge contacts: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            );
          }
        }

        return createErrorResponse(405, "Method Not Allowed");
      }),
    ),
  ),
);
