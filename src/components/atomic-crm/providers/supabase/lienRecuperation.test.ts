import { corrigerLienRecuperation } from "./lienRecuperation";

const JETON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.charge.signature";

describe("corrigerLienRecuperation", () => {
  it("déplace le jeton de récupération derrière la route set-password", () => {
    /*
     * Le cas d'Alexandre, le 07/09/2026 : ce lien le ramenait à l'écran de
     * connexion, jeton perdu, compte inaccessible.
     */
    const corrigee = corrigerLienRecuperation(
      `https://crm.nosho.cc/#access_token=${JETON}&refresh_token=r-123&expires_in=3600&type=recovery`,
    );
    expect(corrigee).toBe(
      `https://crm.nosho.cc/#/set-password?access_token=${JETON}&refresh_token=r-123&expires_in=3600&type=recovery`,
    );
  });

  it("rattrape aussi une invitation, pas seulement une réinitialisation", () => {
    // Même mécanisme, même perte : c'est ce qui a bloqué Julie le 02/09.
    const corrigee = corrigerLienRecuperation(
      `https://crm.nosho.cc/#access_token=${JETON}&refresh_token=r-9&type=invite`,
    );
    expect(corrigee).toContain("#/set-password?");
    expect(corrigee).toContain("type=invite");
  });

  it("conserve le refresh_token, sans lequel la page refuse de s'afficher", () => {
    // `SetPasswordPage` exige les DEUX jetons : en perdre un rend l'écran
    // « missing_tokens », qui ne dit rien à l'utilisateur.
    const corrigee = corrigerLienRecuperation(
      `https://crm.nosho.cc/#access_token=${JETON}&refresh_token=abc-def_123`,
    );
    expect(corrigee).toContain("refresh_token=abc-def_123");
  });

  it("ne touche pas à une route normale de l'application", () => {
    expect(corrigerLienRecuperation("https://crm.nosho.cc/#/deals")).toBeNull();
    expect(corrigerLienRecuperation("https://crm.nosho.cc/#/login")).toBeNull();
  });

  it("laisse passer une page déjà corrigée, pour ne pas boucler", () => {
    // Sans cette garde, chaque rendu réécrirait l'URL et empilerait les
    // préfixes : `#/set-password?/set-password?...`.
    expect(
      corrigerLienRecuperation(
        `https://crm.nosho.cc/#/set-password?access_token=${JETON}`,
      ),
    ).toBeNull();
  });

  it("ignore une URL sans fragment, ou sans jeton", () => {
    expect(corrigerLienRecuperation("https://crm.nosho.cc/")).toBeNull();
    expect(corrigerLienRecuperation("https://crm.nosho.cc/#")).toBeNull();
    // Un fragment inconnu qui ne porte ni jeton ni erreur suit son chemin.
    expect(
      corrigerLienRecuperation("https://crm.nosho.cc/#quelque-chose-d-autre"),
    ).toBeNull();
    /*
     * Le retour d'erreur, LUI, est desormais aiguille — voir le bloc dedie
     * plus bas. Ce test affirmait l'inverse jusqu'au 07/09/2026 : il encodait
     * le comportement muet qui a bloque trois utilisateurs, en le presentant
     * comme un choix. C'en etait un, et il etait mauvais.
     */
  });

  it("ne casse pas sur une URL illisible", () => {
    expect(corrigerLienRecuperation("pas-une-url")).toBeNull();
    expect(corrigerLienRecuperation("")).toBeNull();
  });

  it("préserve le chemin quand l'application n'est pas à la racine", () => {
    const corrigee = corrigerLienRecuperation(
      `https://crm.nosho.cc/app/#access_token=${JETON}&refresh_token=r`,
    );
    expect(corrigee).toBe(
      `https://crm.nosho.cc/app/#/set-password?access_token=${JETON}&refresh_token=r`,
    );
  });
});

describe("corrigerLienRecuperation — les liens morts ne doivent plus etre muets", () => {
  it("aiguille une erreur Supabase vers la page « mot de passe oublié »", () => {
    /*
     * Ce que renvoie vraiment Supabase quand le jeton est consommé ou périmé,
     * relevé sur la production le 07/09/2026. Sans ce traitement, le fragment
     * ne porte pas d'`access_token`, le routeur dépose l'utilisateur sur
     * l'écran de connexion sans un mot, et il conclut qu'il se trompe de mot
     * de passe.
     */
    const corrigee = corrigerLienRecuperation(
      "https://crm.nosho.cc/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
    );
    expect(corrigee).toContain("#/forgot-password?");
    expect(corrigee).toContain("error_code=otp_expired");
  });

  it("préfère la page de réinitialisation à la connexion", () => {
    // L'action utile est de redemander un lien, pas de retaper un mot de passe
    // qu'on n'a jamais choisi.
    const corrigee = corrigerLienRecuperation(
      "https://crm.nosho.cc/#error=access_denied",
    );
    expect(corrigee).toContain("/forgot-password");
    expect(corrigee).not.toContain("/login");
  });

  it("ne confond pas une erreur avec un jeton valide", () => {
    const corrigee = corrigerLienRecuperation(
      `https://crm.nosho.cc/#access_token=${JETON}&refresh_token=r`,
    );
    expect(corrigee).toContain("/set-password");
  });
});
