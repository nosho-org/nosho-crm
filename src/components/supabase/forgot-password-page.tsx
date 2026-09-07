import { useState } from "react";
import { useResetPassword } from "ra-supabase-core";
import { Form, required, useNotify, useRedirect, useTranslate } from "ra-core";
import { Layout } from "@/components/supabase/layout";
import type { FieldValues, SubmitHandler } from "react-hook-form";
import { TextInput } from "@/components/admin/text-input";
import { Button } from "@/components/ui/button";

interface FormData {
  email: string;
}

/**
 * Ce que Supabase renvoie quand un lien ne marche plus, traduit.
 *
 * Sans cela, l'utilisateur atterrissait ici — ou pire, sur l'écran de
 * connexion — sans la moindre explication, et concluait qu'il se trompait de
 * mot de passe. Julie, puis Alexandre deux fois : trois personnes qui ont cru
 * à leur propre erreur alors que leur lien était mort.
 */
const MESSAGES_ERREUR: Record<string, string> = {
  otp_expired:
    "Ce lien a expiré ou a déjà été utilisé. Demandez-en un nouveau ci-dessous.",
  access_denied:
    "Ce lien n'est plus valable. Demandez-en un nouveau ci-dessous.",
};

export const ForgotPasswordPage = () => {
  const [loading, setLoading] = useState(false);

  const notify = useNotify();

  /*
   * Le code d'erreur arrive dans le fragment, réaiguillé ici par
   * `corrigerLienRecuperation` — voir ce module pour la mécanique complète.
   */
  const erreurLien = (() => {
    if (typeof window === "undefined") return null;
    const fragment = window.location.hash.replace(/^#/, "");
    const requete = fragment.includes("?") ? fragment.split("?")[1] : "";
    const p = new URLSearchParams(requete);
    const code = p.get("error_code") ?? p.get("error");
    if (!code) return null;
    return (
      MESSAGES_ERREUR[code] ??
      p.get("error_description") ??
      "Ce lien n'est plus valable. Demandez-en un nouveau ci-dessous."
    );
  })();
  const redirect = useRedirect();
  const translate = useTranslate();
  const [, { mutateAsync: resetPassword }] = useResetPassword({
    onSuccess: () => {
      redirect("/login?passwordRecoveryEmailSent=1");
    },
    onError: () => undefined,
  });

  const submit = async (values: FormData) => {
    try {
      setLoading(true);
      await resetPassword({
        email: values.email,
      });
    } catch (error: any) {
      notify(
        typeof error === "string"
          ? error
          : typeof error === "undefined" || !error.message
            ? "ra.auth.sign_in_error"
            : error.message,
        {
          type: "warning",
          messageArgs: {
            _:
              typeof error === "string"
                ? error
                : error && error.message
                  ? error.message
                  : undefined,
          },
        },
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="flex flex-col space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {translate("ra-supabase.reset_password.forgot_password", {
            _: "Forgot password?",
          })}
        </h1>
        <p>
          {translate("ra-supabase.reset_password.forgot_password_details", {
            _: "Enter your email to receive a reset password link.",
          })}
        </p>
      </div>
      {erreurLien ? (
        <p
          role="alert"
          className="rounded-md border border-[var(--deal-status-lost)]/40 bg-[color-mix(in_oklch,var(--deal-status-lost)_10%,transparent)] px-3 py-2 text-sm text-[var(--deal-status-lost)]"
        >
          {erreurLien}
        </p>
      ) : null}
      <Form<FormData>
        className="space-y-8"
        onSubmit={submit as SubmitHandler<FieldValues>}
      >
        <TextInput
          source="email"
          label={translate("ra.auth.email", {
            _: "Email",
          })}
          autoComplete="email"
          validate={required()}
        />
        <Button type="submit" className="cursor-pointer" disabled={loading}>
          {translate("ra.action.reset_password", {
            _: "Reset password",
          })}
        </Button>
      </Form>
    </Layout>
  );
};

ForgotPasswordPage.path = "forgot-password";
