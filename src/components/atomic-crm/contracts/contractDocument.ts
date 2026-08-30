/**
 * ---------------------------------------------------------------------------
 * Du fragment au document signable (NOS-1186)
 * ---------------------------------------------------------------------------
 * Les gabarits sont des fragments `<article>` : ils ont été écrits pour que
 * `doc.nosho.org` les habille. Simon veut désormais les télécharger depuis le
 * CRM et les envoyer en signature lui-même — il manquait donc l'enveloppe.
 *
 * ## Pourquoi du HTML et pas un PDF
 *
 * Produire un PDF dans le navigateur demanderait une bibliothèque de plusieurs
 * centaines de kilooctets, qui rendrait le texte en pixels ou en polices
 * embarquées, avec ses propres bugs de césure et de saut de page. Le navigateur
 * sait déjà faire : « Imprimer → Enregistrer au format PDF » produit un PDF
 * vectoriel, sélectionnable et cherchable, à partir de ce fichier.
 *
 * D'où deux sorties : le fichier, et l'impression directe.
 *
 * ## Les sauts de page sont le vrai sujet
 *
 * Un contrat coupé entre un article et son titre, ou pire entre la mention
 * « Fait à Marseille » et les cases de signature, est un document qu'on ne
 * signe pas. `break-inside: avoid` sur les articles et sur le bloc signature
 * coûte trois lignes de CSS et évite d'avoir à relire chaque génération.
 */

export interface DocumentOptions {
  /** Ce que le fichier portera comme titre, et comme nom. */
  title: string;
}

/*
 * Les constantes Nosho vivent dans le document, pas dans la base.
 *
 * Le README des gabarits pose la règle et elle est juste : « les faire
 * transiter par le CRM ferait de chaque contrat une occasion de les
 * contredire ». Reprises du contrat Aboulker du 25 août 2026.
 */
const NOSHO_PIED =
  "Nosho SAS · 390 avenue du Prado, 13008 Marseille · " +
  "RCS Marseille 990 546 418";

const STYLES = `
  @page { size: A4; margin: 18mm 16mm 20mm; }

  :root { color-scheme: light; }

  body {
    margin: 0;
    background: #fff;
    color: #1c1c1b;
    font-family: "Inter", "Helvetica Neue", Arial, sans-serif;
    font-size: 10.5pt;
    line-height: 1.55;
  }

  .page { max-width: 190mm; margin: 0 auto; padding: 12mm 10mm 0; }

  h1 { font-size: 17pt; line-height: 1.2; margin: 0 0 4pt; text-wrap: balance; }
  h2 {
    font-size: 11.5pt;
    margin: 16pt 0 5pt;
    padding-bottom: 3pt;
    border-bottom: 0.6pt solid #d8d8d4;
    text-wrap: balance;
  }
  h3 { font-size: 10.5pt; margin: 10pt 0 3pt; }
  p, li { margin: 0 0 6pt; }
  ul, ol { margin: 0 0 6pt; padding-left: 16pt; }
  .sous-titre { color: #55554f; font-size: 11pt; margin-bottom: 12pt; }

  table { width: 100%; border-collapse: collapse; margin: 8pt 0; font-size: 10pt; }
  th, td { text-align: left; padding: 5pt 6pt; border-bottom: 0.5pt solid #e2e2de; }
  th { font-weight: 600; background: #f6f6f3; }
  td.montant, th.montant { text-align: right; font-variant-numeric: tabular-nums; }

  /*
    Ce qui ne doit jamais etre coupe par un saut de page : un article separe de
    son titre, et surtout la mention « Fait a » separee des cases de signature.
  */
  section, .signatures, table { break-inside: avoid; }
  h1, h2, h3 { break-after: avoid; }

  .signatures {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10mm;
    margin-top: 14pt;
  }
  .signatures .bloc { border-top: 0.6pt solid #1c1c1b; padding-top: 5pt; }

  footer.pied {
    margin-top: 18pt;
    padding-top: 6pt;
    border-top: 0.5pt solid #e2e2de;
    color: #7a7a72;
    font-size: 8pt;
  }

  /* A l'ecran seulement : l'aide a l'impression ne doit pas finir sur le PDF. */
  .aide {
    max-width: 190mm;
    margin: 8mm auto 0;
    padding: 8pt 10pt;
    background: #f2f6fb;
    border: 0.5pt solid #cfdcec;
    border-radius: 4pt;
    font-size: 9pt;
    color: #33475e;
  }
  @media print { .aide { display: none; } }
`;

/** Enveloppe un fragment rendu dans un document complet, prêt à imprimer. */
export function wrapContractDocument(
  fragment: string,
  options: DocumentOptions,
): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeAttribute(options.title)}</title>
<style>${STYLES}</style>
</head>
<body>
<p class="aide">
  Pour obtenir un PDF : <strong>Imprimer</strong> puis
  <strong>Enregistrer au format PDF</strong>. Ce bandeau ne sera pas imprimé.
</p>
<main class="page">
${fragment}
<footer class="pied">${NOSHO_PIED}</footer>
</main>
</body>
</html>`;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Un nom de fichier qu'un système d'exploitation accepte partout.
 *
 * Les accents partent, pas seulement les caractères interdits : un contrat
 * nommé `Contrat-Hôpital.html` traverse mal un envoi par mail ou un dépôt sur
 * un partage Windows, et se retrouve `Contrat-HÃ´pital.html` chez le client.
 */
export function contractFileName(
  kind: string,
  clientName: string,
  date: Date,
): string {
  const slug = clientName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const jour = date.toISOString().slice(0, 10);
  const type = kind === "cadre" ? "Contrat-cadre" : "Contrat-POC";
  return `${type}-${slug || "client"}-${jour}.html`;
}
