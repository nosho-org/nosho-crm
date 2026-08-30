/**
 * ---------------------------------------------------------------------------
 * Le rendu des gabarits de contrat (NOS-1185)
 * ---------------------------------------------------------------------------
 * Les gabarits `contrat-poc.html` et `contrat-cadre.html` sont écrits en
 * moustaches. Ce module les rend, et rien d'autre.
 *
 * ## Pourquoi pas Mustache ou Handlebars
 *
 * Trois constructions sont utilisées par les deux gabarits — la variable, la
 * section, la section inversée. C'est tout. Importer une bibliothèque dans une
 * fonction Deno pour trois constructions coûterait plus en surface de
 * dépendance qu'en lignes économisées, et Handlebars apporte un compilateur de
 * templates dont on ne veut justement pas dans un document contractuel.
 *
 * ## L'échappement est le point sérieux
 *
 * Un nom de société contenant `&` ou `<` casserait le document. Pire, une
 * valeur venant de la base et recopiée telle quelle dans du HTML est une
 * injection. Tout est donc échappé par défaut — il n'existe volontairement
 * aucune syntaxe « brut » : un contrat n'a aucune raison de porter du HTML
 * saisi par un commercial.
 *
 * ## Ce qui reste non résolu est signalé, pas silencieux
 *
 * Une variable absente rend une chaîne vide ET est retournée dans `missing`.
 * Un contrat qui part avec « Entre les soussignés : et » est un incident ;
 * l'appelant doit pouvoir refuser d'envoyer plutôt que de le découvrir chez le
 * client. C'est précisément ce qui est arrivé au contrat HEM, parti avec un
 * `[SIREN / FINESS HEM]` non remplacé.
 */

export interface RenderResult {
  html: string;
  /** Les variables référencées par le gabarit et absentes du contexte. */
  missing: string[];
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** `client.name` → la valeur, en descendant les points. */
function lookup(context: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (node, key) =>
        node != null && typeof node === "object"
          ? (node as Record<string, unknown>)[key]
          : undefined,
      context,
    );
}

/**
 * Vrai au sens des moustaches : `false`, `null`, `undefined`, `0`, `""` et le
 * tableau vide sont faux.
 *
 * Le tableau vide compte, et c'est le cas qui importe : un contrat sans ligne
 * de service ne doit pas afficher un tableau de prix vide avec ses en-têtes.
 */
function truthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value == null) return false;
  if (typeof value === "string") return value.trim() !== "";
  return value !== false && value !== 0;
}

const SECTION = /\{\{([#^])\s*([\w.]+)\s*\}\}([\s\S]*?)\{\{\/\s*\2\s*\}\}/;
const VARIABLE = /\{\{\s*([\w.]+)\s*\}\}/g;

export function renderTemplate(
  template: string,
  context: Record<string, unknown>,
): RenderResult {
  const missing = new Set<string>();

  const walk = (input: string, scope: unknown): string => {
    /*
     * Les sections d'abord, une par une, en repartant du début à chaque fois.
     *
     * Une boucle sur un `replace` global échouerait sur les sections
     * imbriquées : la regex non gourmande fermerait la section extérieure sur
     * la première balise fermante rencontrée, qui appartient à l'intérieure.
     * Traiter la première occurrence puis recommencer laisse la récursion
     * s'occuper de l'intérieur.
     */
    let output = input;
    for (;;) {
      const match = SECTION.exec(output);
      if (!match) break;

      const [full, kind, path, body] = match;
      const value = lookup(scope, path);
      const isTruthy = truthy(value);

      let rendered: string;
      if (kind === "^") {
        rendered = isTruthy ? "" : walk(body, scope);
      } else if (!isTruthy) {
        rendered = "";
      } else if (Array.isArray(value)) {
        // Chaque élément devient la portée : `{{label}}` dans une section
        // `{{#services}}` désigne le label de la ligne courante.
        rendered = value.map((item) => walk(body, item)).join("");
      } else if (typeof value === "object") {
        rendered = walk(body, value);
      } else {
        rendered = walk(body, scope);
      }

      output =
        output.slice(0, match.index) +
        rendered +
        output.slice(match.index + full.length);
    }

    return output.replace(VARIABLE, (_full, path: string) => {
      // La portée courante d'abord, la racine ensuite : dans une ligne de
      // service, `{{contractRef}}` doit rester accessible.
      let value = lookup(scope, path);
      if (value === undefined && scope !== context) {
        value = lookup(context, path);
      }
      if (value === undefined || value === null) {
        missing.add(path);
        return "";
      }
      return escapeHtml(String(value));
    });
  };

  return { html: walk(template, context), missing: [...missing].sort() };
}
