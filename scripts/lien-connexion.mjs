#!/usr/bin/env node
/**
 * ---------------------------------------------------------------------------
 * Fabriquer un lien de connexion sans passer par l'e-mail (NOS-1382)
 * ---------------------------------------------------------------------------
 * Trois personnes bloquées hors du CRM en deux jours — Julie le 2 septembre,
 * Alexandre deux fois le 7 — pour la même raison : l'expéditeur intégré de
 * Supabase plafonne à **deux e-mails par heure pour tout le projet**.
 *
 * Le piège est mécanique. Inviter quelqu'un consomme un jeton ; s'il demande
 * ensuite un mot de passe dans la même heure, il consomme le second. La
 * troisième tentative — la sienne ou celle d'un collègue — est refusée par un
 * « email rate limit exceeded » qui ne dit pas quand réessayer. La personne
 * reclique, ce qui ne libère rien, et reste dehors.
 *
 * Ce script mint le MÊME jeton que le mail, sans envoyer de mail. Il ne touche
 * donc pas au quota, et débloque quelqu'un immédiatement.
 *
 * ## Ce n'est pas la solution de fond
 *
 * La vraie correction est un SMTP applicatif (Resend, Postmark, Brevo) : le
 * plafond disparaît, la délivrabilité cesse de dépendre d'un domaine partagé,
 * et `rate_limit_email_sent` redevient réglable. Tant qu'il n'y en a pas, ce
 * script est la roue de secours — à utiliser, pas à installer durablement.
 *
 * ## Le lien vaut un accès
 *
 * Ce qu'il affiche ouvre le compte visé. Il se transmet directement à la
 * personne concernée, par un canal privé, et à personne d'autre. Usage unique,
 * validité 24 h (`mailer_otp_exp`).
 *
 * ## Usage
 *
 *   doppler run --project nosho-crm --config prd -- \
 *     node scripts/lien-connexion.mjs <email> [--type=recovery|invite|magiclink]
 *
 * `recovery` par défaut : la personne choisit son mot de passe. `magiclink`
 * ouvre une session sans en définir un — pratique pour un dépannage, moins
 * pour un compte qu'on veut voir servir.
 */

const email = process.argv.find((a) => a.includes("@"));
const type =
  (process.argv.find((a) => a.startsWith("--type=")) ?? "").split("=")[1] ||
  "recovery";

if (!email) {
  console.error(
    "Usage : node scripts/lien-connexion.mjs <email> [--type=recovery|invite|magiclink]",
  );
  process.exit(1);
}

const ref = process.env.SUPABASE_PROJECT_ID;
const tok = process.env.SUPABASE_ACCESS_TOKEN;
if (!ref || !tok) {
  console.error(
    "SUPABASE_PROJECT_ID / SUPABASE_ACCESS_TOKEN absents : lancer via `doppler run`.",
  );
  process.exit(1);
}

/*
 * La clé de service est lue depuis l'API Management plutôt que stockée dans
 * Doppler : une clé de moins à faire tourner, et elle ne vit que le temps du
 * processus. Elle n'est jamais affichée.
 */
const rk = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, {
  headers: { Authorization: `Bearer ${tok}` },
});
if (!rk.ok) {
  console.error("Lecture des cles refusee :", rk.status);
  process.exit(1);
}
const service = (await rk.json()).find(
  (k) => k.name === "service_role" || k.type === "secret",
);
if (!service?.api_key) {
  console.error("Aucune cle de service exploitable sur ce projet.");
  process.exit(1);
}

const r = await fetch(`https://${ref}.supabase.co/auth/v1/admin/generate_link`, {
  method: "POST",
  headers: {
    apikey: service.api_key,
    Authorization: `Bearer ${service.api_key}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    type,
    email,
    options: { redirect_to: "https://crm.nosho.cc" },
  }),
});

const d = await r.json();
if (!r.ok) {
  console.error(`Echec (${r.status}) :`, d.msg ?? d.message ?? JSON.stringify(d));
  process.exit(1);
}

/*
 * L'API REST rend le lien A PLAT, aux cotes des champs de l'utilisateur.
 * `properties.action_link` est la forme du SDK supabase-js, qui reemballe la
 * reponse -- la chercher ici faisait echouer le script sur une reponse
 * pourtant valide.
 */
const lien = d.action_link ?? d.properties?.action_link;
if (!lien) {
  console.error("Reponse sans lien :", JSON.stringify(d).slice(0, 300));
  process.exit(1);
}

console.log(`\nLien ${type} pour ${email} :\n`);
console.log(lien);
console.log(
  "\nUsage unique, valable 24 h. A transmettre directement a la personne,",
);
console.log("par un canal prive : ce lien ouvre son compte.\n");
