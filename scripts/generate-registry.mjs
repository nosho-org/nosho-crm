#!/usr/bin/env node

import { globSync } from "glob";
import fs from "node:fs";
import path from "node:path";

const registryPath = "registry.json";
const basePath = "src";

/**
 * `path.posix.join`, jamais `path.join` (NOS-1028).
 *
 * Sous Windows, `path.join` rend `src\components\atomic-crm` — et l'antislash
 * est le caractère d'échappement de la syntaxe glob, pas un séparateur. Le
 * motif ne correspondait donc à rien, `globSync` renvoyait une liste vide, et
 * le script réécrivait un `registry.json` amputé de ses 1162 entrées sans une
 * seule erreur. Le hook pre-commit le lance à chaque commit.
 *
 * Les chemins publiés dans le registre sont de toute façon des chemins POSIX :
 * ils sont consommés par `shadcn`, pas par le système de fichiers local.
 */
const atomicCrmComponentsPath = path.posix.join(
  basePath,
  "components",
  "atomic-crm",
);
const supabaseComponentsPath = path.posix.join(
  basePath,
  "components",
  "supabase",
);
const hooksPath = path.posix.join(basePath, "hooks");
const libPath = path.posix.join(basePath, "lib");

const excludedHooks = [
  "filter-context.tsx",
  "saved-queries.tsx",
  "use-mobile.ts",
  "useSupportCreateSuggestion.tsx",
];

const excludedLibFiles = [
  "field.type.ts",
  "genericMemo.ts",
  "i18nProvider.ts",
  "sanitizeInputRestProps.ts",
  "utils.ts",
];

const testFilePattern = "**/*.{test,spec}.*";
const storyFilePattern = "**/*.stories.*";

const atomicCrmComponents = globSync(
  path.posix.join(atomicCrmComponentsPath, "**", "*.ts*"),
  { ignore: [testFilePattern, storyFilePattern] },
);
const supabaseComponents = globSync(
  path.posix.join(supabaseComponentsPath, "**", "*.ts*"),
  { ignore: [testFilePattern, storyFilePattern] },
);
const hooks = globSync(path.posix.join(hooksPath, "**", "*.ts*")).filter((hook) => {
  return !excludedHooks.includes(path.basename(hook));
});
const libFiles = globSync(path.posix.join(libPath, "**", "*.ts*")).filter((file) => {
  return !excludedLibFiles.includes(path.basename(file));
});

const toPosix = (value) => value.split(path.sep).join("/");

const registryContent = JSON.parse(fs.readFileSync(registryPath, "utf-8"));

const files = [
  ...atomicCrmComponents.map((file) => {
    return {
      path: toPosix(file),
      type: "registry:component",
    };
  }),
  ...supabaseComponents.map((file) => {
    return {
      path: toPosix(file),
      type: "registry:component",
    };
  }),
  ...hooks.map((file) => {
    return {
      path: toPosix(file),
      type: "registry:hook",
    };
  }),
  ...libFiles.map((file) => {
    return {
      path: toPosix(file),
      type: "registry:lib",
    };
  }),
];

/**
 * Tri stable (NOS-1028).
 *
 * `glob` ne parcourt pas les répertoires dans le même ordre selon le système.
 * Sans tri, un commit fait sous Windows rejoue tout le fichier par rapport au
 * même commit fait sous macOS : 200 lignes de diff qui ne disent rien, et dans
 * lesquelles une vraie disparition passerait inaperçue.
 */
files.sort((a, b) => a.path.localeCompare(b.path));

/**
 * Garde-fou (NOS-1028).
 *
 * Le hook pre-commit lance ce script avec `|| true` : sans cette vérification,
 * n'importe quelle panne de résolution de chemins réécrit silencieusement un
 * registre vide, et le seul signal est un diff de 1162 suppressions que
 * personne ne lit avant de faire `git add .`. Mieux vaut interrompre.
 *
 * Le seuil est délibérément grossier : on ne cherche pas à valider le contenu,
 * seulement à distinguer « le glob a marché » de « le glob n'a rien trouvé ».
 */
const MINIMUM_EXPECTED_FILES = 100;

if (files.length < MINIMUM_EXPECTED_FILES) {
  console.error(
    `generate-registry: ${files.length} fichier(s) trouvé(s), moins que les ` +
      `${MINIMUM_EXPECTED_FILES} attendus. registry.json n'a pas été touché.\n` +
      `Cause connue : un motif glob contenant des antislashs (Windows).`,
  );
  process.exit(1);
}

const newRegistryContent = {
  ...registryContent,
  items: registryContent.items.map((item) => {
    if (item.name === "atomic-crm") {
      return {
        ...item,
        files,
      };
    }

    return item;
  }),
};

fs.writeFileSync(
  registryPath,
  JSON.stringify(newRegistryContent, null, 2),
  "utf-8",
);
