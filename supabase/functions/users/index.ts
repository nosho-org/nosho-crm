import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { getUserSale } from "../_shared/getUserSale.ts";
import {
  accorder,
  ATTACHES,
  messageDeBlocage,
  type Blocage,
} from "./deletionGuard.ts";

async function updateSaleDisabled(user_id: string, disabled: boolean) {
  return await supabaseAdmin
    .from("sales")
    .update({ disabled: disabled ?? false })
    .eq("user_id", user_id);
}

async function updateSaleAdministrator(
  user_id: string,
  administrator: boolean,
) {
  const { data: sales, error: salesError } = await supabaseAdmin
    .from("sales")
    .update({ administrator })
    .eq("user_id", user_id)
    .select("*");

  if (!sales?.length || salesError) {
    console.error("Error updating user:", salesError);
    throw salesError ?? new Error("Failed to update sale");
  }
  return sales.at(0);
}

async function createSale(
  user_id: string,
  data: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    disabled: boolean;
    administrator: boolean;
  },
) {
  const { data: sales, error: salesError } = await supabaseAdmin
    .from("sales")
    .insert({ ...data, user_id })
    .select("*");

  if (!sales?.length || salesError) {
    console.error("Error creating user:", salesError);
    throw salesError ?? new Error("Failed to create sale");
  }
  return sales.at(0);
}

async function updateSaleAvatar(user_id: string, avatar: string) {
  const { data: sales, error: salesError } = await supabaseAdmin
    .from("sales")
    .update({ avatar })
    .eq("user_id", user_id)
    .select("*");

  if (!sales?.length || salesError) {
    console.error("Error updating user:", salesError);
    throw salesError ?? new Error("Failed to update sale");
  }
  return sales.at(0);
}

async function inviteUser(req: Request, currentUserSale: any) {
  const { email, password, first_name, last_name, disabled, administrator } =
    await req.json();

  if (!currentUserSale.administrator) {
    return createErrorResponse(401, "Not Authorized");
  }

  const { data, error: userError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    user_metadata: { first_name, last_name },
  });

  let user = data?.user;

  if (!user && userError?.code === "email_exists") {
    // This may happen if users cleared their database but not the users
    // We have to create the sale directly
    const { data, error } = await supabaseAdmin.rpc("get_user_id_by_email", {
      email,
    });

    if (!data || error) {
      console.error(
        `Error inviting user: error=${error ?? "could not fetch users for email"}`,
      );
      return createErrorResponse(500, "Internal Server Error");
    }

    user = data[0];
    try {
      const { data: existingSale, error: salesError } = await supabaseAdmin
        .from("sales")
        .select("*")
        .eq("user_id", user.id);
      if (salesError) {
        return createErrorResponse(salesError.status, salesError.message, {
          code: salesError.code,
        });
      }
      if (existingSale.length > 0) {
        return createErrorResponse(
          400,
          "A sales for this email already exists",
        );
      }

      const sale = await createSale(user.id, {
        email,
        password,
        first_name,
        last_name,
        disabled,
        administrator,
      });

      return new Response(
        JSON.stringify({
          data: sale,
        }),
        {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    } catch (error) {
      return createErrorResponse(
        (error as any).status ?? 500,
        (error as Error).message,
        {
          code: (error as any).code,
        },
      );
    }
  } else {
    if (userError) {
      console.error(`Error inviting user: user_error=${userError}`);
      return createErrorResponse(userError.status, userError.message, {
        code: userError.code,
      });
    }
    if (!data?.user) {
      console.error("Error inviting user: undefined user");
      return createErrorResponse(500, "Internal Server Error");
    }
    const { error: emailError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email);

    if (emailError) {
      console.error(`Error inviting user, email_error=${emailError}`);
      return createErrorResponse(500, "Failed to send invitation mail");
    }
  }

  try {
    await updateSaleDisabled(user.id, disabled);
    const sale = await updateSaleAdministrator(user.id, administrator);

    return new Response(
      JSON.stringify({
        data: sale,
      }),
      {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (e) {
    console.error("Error patching sale:", e);
    return createErrorResponse(500, "Internal Server Error");
  }
}

async function patchUser(req: Request, currentUserSale: any) {
  const {
    sales_id,
    email,
    first_name,
    last_name,
    avatar,
    administrator,
    disabled,
  } = await req.json();
  const { data: sale } = await supabaseAdmin
    .from("sales")
    .select("*")
    .eq("id", sales_id)
    .single();

  if (!sale) {
    return createErrorResponse(404, "Not Found");
  }

  // Users can only update their own profile unless they are an administrator
  if (!currentUserSale.administrator && currentUserSale.id !== sale.id) {
    return createErrorResponse(401, "Not Authorized");
  }

  const { data, error: userError } =
    await supabaseAdmin.auth.admin.updateUserById(sale.user_id, {
      email,
      ban_duration: disabled ? "87600h" : "none",
      user_metadata: { first_name, last_name },
    });

  if (!data?.user || userError) {
    console.error("Error patching user:", userError);
    return createErrorResponse(500, "Internal Server Error");
  }

  if (avatar) {
    await updateSaleAvatar(data.user.id, avatar);
  }

  // Only administrators can update the administrator and disabled status
  if (!currentUserSale.administrator) {
    const { data: new_sale } = await supabaseAdmin
      .from("sales")
      .select("*")
      .eq("id", sales_id)
      .single();
    return new Response(
      JSON.stringify({
        data: new_sale,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      },
    );
  }

  try {
    await updateSaleDisabled(data.user.id, disabled);
    const sale = await updateSaleAdministrator(data.user.id, administrator);
    return new Response(
      JSON.stringify({
        data: sale,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      },
    );
  } catch (e) {
    console.error("Error patching sale:", e);
    return createErrorResponse(500, "Internal Server Error");
  }
}

/**
 * Supprimer un utilisateur, si son compte est vide (NOS-1233).
 *
 * Simon a tranché : « suppression réelle, si le compte est vide ». La règle
 * est donc stricte — on ne réattribue rien à la volée, on refuse en disant ce
 * qui retient.
 *
 * ## Trois refus avant tout décompte
 *
 * **Non-administrateur** : gérer les comptes est un privilège d'admin, comme
 * pour l'invitation et la modification.
 *
 * **Se supprimer soi-même** : personne ne doit pouvoir se retirer l'accès en
 * un clic, et surtout pas le dernier administrateur.
 *
 * **Le dernier administrateur** : supprimer le dernier compte admin
 * fermerait la porte à clé de l'intérieur — plus personne ne pourrait
 * inviter, promouvoir, ni supprimer.
 *
 * ## L'ordre de suppression
 *
 * La ligne `sales` d'abord, le compte d'authentification ensuite. L'inverse
 * laisserait, si la seconde étape échouait, une fiche CRM rattachée à un
 * compte disparu — un utilisateur fantôme que plus rien ne permet de
 * nettoyer depuis l'écran.
 */
async function deleteUser(req: Request, currentUserSale: any) {
  const { sales_id } = await req.json();

  if (!currentUserSale.administrator) {
    return createErrorResponse(401, "Not Authorized");
  }

  const { data: sale } = await supabaseAdmin
    .from("sales")
    .select("*")
    .eq("id", sales_id)
    .single();

  if (!sale) {
    return createErrorResponse(404, "Utilisateur introuvable");
  }

  if (String(sale.id) === String(currentUserSale.id)) {
    return createErrorResponse(
      400,
      "Vous ne pouvez pas supprimer votre propre compte.",
    );
  }

  if (sale.administrator) {
    const { count } = await supabaseAdmin
      .from("sales")
      .select("id", { count: "exact", head: true })
      .eq("administrator", true);
    if ((count ?? 0) <= 1) {
      return createErrorResponse(
        400,
        "Impossible de supprimer le dernier administrateur : plus personne ne pourrait gérer les comptes.",
      );
    }
  }

  /*
   * Le décompte, table par table.
   *
   * `head: true` ne rapatrie aucune ligne : seul le nombre nous intéresse, et
   * une de ces tables porte plusieurs centaines de milliers de lignes.
   */
  const blocages: Blocage[] = [];
  for (const attache of ATTACHES) {
    const { count, error } = await supabaseAdmin
      .from(attache.table)
      .select("id", { count: "exact", head: true })
      .eq(attache.colonne, sale.id);

    if (error) {
      console.error("deleteUser.count", attache.table, error);
      return createErrorResponse(
        500,
        `Vérification impossible sur ${attache.table}`,
      );
    }
    if ((count ?? 0) > 0) {
      blocages.push({
        libelle: accorder(attache, count ?? 0),
        nombre: count ?? 0,
      });
    }
  }

  if (blocages.length > 0) {
    const nom = `${sale.first_name ?? ""} ${sale.last_name ?? ""}`.trim();
    return createErrorResponse(409, messageDeBlocage(nom, blocages));
  }

  const { error: saleError } = await supabaseAdmin
    .from("sales")
    .delete()
    .eq("id", sale.id);

  if (saleError) {
    console.error("deleteUser.sale", saleError);
    return createErrorResponse(500, "La fiche n'a pas pu être supprimée.");
  }

  if (sale.user_id) {
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(
      sale.user_id,
    );
    /*
     * La fiche est déjà partie : on ne peut plus revenir en arrière, et taire
     * cet échec laisserait un compte capable de se connecter sans fiche. On
     * le dit, avec l'identifiant, pour qu'il soit retiré à la main.
     */
    if (authError) {
      console.error("deleteUser.auth", authError);
      return createErrorResponse(
        500,
        `Fiche supprimée, mais le compte d'authentification subsiste (${sale.user_id}). Retirez-le depuis Supabase.`,
      );
    }
  }

  return new Response(JSON.stringify({ data: { id: sale.id } }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req, user) => {
        const currentUserSale = await getUserSale(user);
        if (!currentUserSale) {
          return createErrorResponse(401, "Unauthorized");
        }

        if (req.method === "POST") {
          return inviteUser(req, currentUserSale);
        }

        if (req.method === "PATCH") {
          return patchUser(req, currentUserSale);
        }

        if (req.method === "DELETE") {
          return deleteUser(req, currentUserSale);
        }

        return createErrorResponse(405, "Method Not Allowed");
      }),
    ),
  ),
);
