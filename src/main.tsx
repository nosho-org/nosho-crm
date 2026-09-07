import "./sentry";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { rattraperLienRecuperation } from "./components/atomic-crm/providers/supabase/lienRecuperation";

// After a new deploy, the service worker may replace its pre-cache while
// the page still holds old chunk references. A reload picks up the new
// HTML + new SW cache. A sessionStorage guard prevents infinite loops.
// See https://vite.dev/guide/build.html#load-error-handling
window.addEventListener("vite:preloadError", () => {
  const key = "chunk-reload";
  if (!sessionStorage.getItem(key)) {
    sessionStorage.setItem(key, "1");
    window.location.reload();
  }
});

/*
 * Supabase renvoie les jetons de mot de passe dans le FRAGMENT
 * (`/#access_token=...`), que le HashRouter lit comme une route inconnue :
 * l'utilisateur atterrissait sur l'ecran de connexion, jeton perdu, et le
 * jeton etant a usage unique il ne pouvait plus recliquer (NOS-1381).
 *
 * Meme rattrapage que pour Google ci-dessous, et pour la meme raison.
 */
rattraperLienRecuperation();

// Google redirects to /google-oauth-callback?code=xxx but the app uses HashRouter.
// Convert to /#/google-oauth-callback?code=xxx before React renders.
if (window.location.pathname === "/google-oauth-callback") {
  const query = window.location.search || "";
  // Set hash and clear pathname — this doesn't trigger a page reload
  window.history.replaceState(null, "", `/#/google-oauth-callback${query}`);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
