/**
 * ---------------------------------------------------------------------------
 * Rattraper les liens de mot de passe avant que le routeur ne les jette
 * ---------------------------------------------------------------------------
 * Constaté le 07/09/2026 sur le compte d'Alexandre Cavaillon Pinod : cliquer
 * sur « Réinitialiser votre mot de passe » ramenait à l'écran de connexion,
 * sans message, et le jeton était perdu. Trois utilisateurs s'y sont heurtés en
 * deux jours — Julie, puis Alexandre deux fois — et chacun a d'abord cru à une
 * erreur de sa part.
 *
 * ## La cause
 *
 * Supabase renvoie le jeton dans le FRAGMENT de l'URL :
 *
 *     https://crm.nosho.cc/#access_token=ey...&refresh_token=...&type=recovery
 *
 * L'application est servie en `HashRouter` : elle lit ce même fragment comme
 * une route. `access_token=ey...` ne correspond à aucune page, le routeur
 * bascule sur la connexion, et `history.replaceState` efface le fragment au
 * passage. Le jeton disparaît avant que `SetPasswordPage` n'ait pu le lire.
 *
 * Le jeton de vérification étant à usage unique, la victime ne peut même pas
 * recliquer : elle doit demander un nouveau mail, et se heurte alors au quota
 * de deux mails par heure. C'est ainsi qu'un compte devient inaccessible.
 *
 * ## Le correctif
 *
 * On réécrit l'URL vers la route attendue AVANT que React ne rende quoi que ce
 * soit, en déplaçant les paramètres derrière un `?` :
 *
 *     https://crm.nosho.cc/#/set-password?access_token=ey...&refresh_token=...
 *
 * `getSearchString()` de `ra-supabase-core` sait lire cette forme : il coupe le
 * fragment sur le `?` et rend la partie droite. C'est exactement le même
 * rattrapage que celui déjà en place pour le retour Google dans `main.tsx`,
 * qui souffrait du même conflit entre chemin et fragment.
 */

/**
 * L'URL corrigée, ou `null` s'il n'y a rien à corriger.
 *
 * Rendre `null` plutôt que l'URL inchangée est délibéré : l'appelant ne doit
 * toucher à l'historique que lorsqu'il y a une raison. Réécrire l'URL à chaque
 * chargement casserait la navigation arrière.
 */
export function corrigerLienRecuperation(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  const fragment = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  if (fragment === "") return null;

  // Déjà une route de l'application (`#/login`, `#/set-password?...`) : c'est
  // la navigation normale, on n'y touche pas.
  if (fragment.startsWith("/")) return null;

  const parametres = new URLSearchParams(fragment);

  /*
   * Le lien a echoue cote Supabase (jeton deja consomme, ou perime).
   *
   * Le fragment ressemble alors a
   * `#error=access_denied&error_code=otp_expired&error_description=...`.
   * Sans ce traitement il ne porte pas d'`access_token`, tombe donc dans le
   * `return null` plus bas, et le routeur depose l'utilisateur sur l'ecran de
   * connexion SANS UN MOT. C'est ce qu'ont vu Julie puis Alexandre : ils ont
   * cru s'etre trompes de mot de passe, alors que leur lien etait mort.
   *
   * On aiguille donc vers la page « mot de passe oublie », qui est l'action
   * utile, en emportant le code d'erreur pour qu'elle puisse l'expliquer.
   *
   * Cause la plus frequente du jeton mort : Slack et WhatsApp PRECHARGENT les
   * liens pour en afficher l'apercu. Cet appel automatique consomme le jeton a
   * usage unique avant meme que le destinataire n'ait clique.
   */
  const erreur = parametres.get("error_code") ?? parametres.get("error");
  if (erreur) {
    return `${url.origin}${url.pathname}#/forgot-password?${fragment}`;
  }

  const jeton = parametres.get("access_token");
  if (!jeton) return null;

  /*
   * Le fragment est réutilisé tel quel, sans être reconstruit.
   *
   * `URLSearchParams.toString()` ré-encoderait les valeurs, et un jeton JWT
   * contient des points et des tirets que le ré-encodage laisse intacts —
   * mais le refresh_token, lui, peut porter des caractères que Supabase
   * attend inchangés. Recopier évite d'avoir à le vérifier.
   */
  return `${url.origin}${url.pathname}#/set-password?${fragment}`;
}

/**
 * Applique la correction sur la page courante, s'il y a lieu.
 *
 * `replaceState` et non `assign` : on ne recharge pas la page — le rattrapage
 * doit se faire avant le premier rendu de React, pas après un aller-retour
 * réseau qui laisserait entrevoir l'écran de connexion.
 */
export function rattraperLienRecuperation(): boolean {
  if (typeof window === "undefined") return false;
  const corrigee = corrigerLienRecuperation(window.location.href);
  if (!corrigee) return false;
  window.history.replaceState(null, "", corrigee);
  return true;
}
