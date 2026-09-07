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
    // Un retour d'erreur de Supabase ne porte pas de jeton : on le laisse
    // suivre son chemin plutôt que de l'aiguiller vers un formulaire vide.
    expect(
      corrigerLienRecuperation(
        "https://crm.nosho.cc/#error=access_denied&error_description=expired",
      ),
    ).toBeNull();
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
