/**
 * ---------------------------------------------------------------------------
 * Du fragment au document signable, à la charte Nosho (NOS-1191)
 * ---------------------------------------------------------------------------
 * Les gabarits sont des fragments `<article>`. Ce module les habille.
 *
 * Simon : « je n'arrive toujours pas à comprendre pourquoi ça ne reprend pas
 * mes templates de contrat ». La cause n'était pas le texte — il est transcrit
 * mot pour mot — mais la MISE EN FORME : le document sortait en A4 blanc, sans
 * couverture, sans couleur, sans bandeau. Rien à voir avec ses PDF.
 *
 * La charte est reprise du contrat de référence HEM v2 et du contrat Aboulker :
 * couverture en dégradé, numéros d'article en orange, bandeau et pied de page
 * sur chaque page, encadrés crème à filet orange.
 *
 * ## Pourquoi du HTML et pas un PDF
 *
 * Produire un PDF dans le navigateur demanderait une bibliothèque de plusieurs
 * centaines de kilooctets, qui rendrait le texte en pixels ou en polices
 * embarquées, avec ses propres bugs de césure et de saut de page. Le navigateur
 * sait déjà faire : « Imprimer → Enregistrer au format PDF » produit un PDF
 * vectoriel, sélectionnable et cherchable.
 *
 * ## Les sauts de page sont le vrai sujet
 *
 * Un contrat coupé entre un article et son titre, ou pire entre la mention
 * « Fait à Marseille » et les cases de signature, est un document qu'on ne
 * signe pas. D'où `break-inside: avoid` sur les articles et le bloc signature.
 */

export interface DocumentOptions {
  /** Ce que le fichier portera comme titre, et comme nom. */
  title: string;
  /** « Contrat de service — Période d'essai ». Repris dans le bandeau. */
  kicker?: string;
  /** Le nom du client, en gros sur la couverture. */
  clientName?: string;
  /** La date, sur la couverture. */
  contractDate?: string;
}

/*
 * Les constantes Nosho vivent dans le document, pas dans la base.
 *
 * Le README des gabarits pose la règle et elle est juste : « les faire
 * transiter par le CRM ferait de chaque contrat une occasion de les
 * contredire ». Reprises du contrat Aboulker du 25 août 2026.
 */
const NOSHO = {
  raisonSociale: "NOSHO SAS",
  adresse: "390 Avenue du Prado, 13008 Marseille",
  rcs: "Immatriculée au RCS Marseille, numéro 990546418",
  representant: "Représentée par Mr Thomas Guillaumin, Président",
};

const STYLES = `
  @page { size: A4; margin: 16mm 15mm 18mm; }

  :root { color-scheme: light; }

  body {
    margin: 0;
    background: #fff;
    color: #1c1c1b;
    font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.55;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── Couverture ────────────────────────────────────────────────────────── */

  .couverture {
    /* Le degrade du contrat de reference : vert d eau vers orange. */
    background: linear-gradient(160deg, #7ec8b8 0%, #a8cfa0 38%, #f4a25f 100%);
    color: #fff;
    min-height: 247mm;
    padding: 20mm 18mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    break-after: page;
  }
  .couverture .marque { font-size: 22pt; font-weight: 700; letter-spacing: -0.02em; }
  .couverture .marque .barres { letter-spacing: -0.12em; margin-right: 2pt; }
  .couverture .titre {
    font-size: 13pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    line-height: 1.35;
    max-width: 120mm;
  }
  .couverture .client { font-size: 20pt; font-weight: 700; margin-top: 4pt; }
  .couverture .filet {
    border-top: 0.8pt dotted rgba(255, 255, 255, 0.75);
    margin: 10pt 0;
  }
  .couverture .etiquette {
    font-size: 7.5pt;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    opacity: 0.9;
  }
  .couverture .mentions { font-size: 8.5pt; line-height: 1.7; }
  .couverture .mentions strong { font-weight: 700; }

  /* ── Bandeau & pied de page ────────────────────────────────────────────── */

  .bandeau {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding-bottom: 5pt;
    margin-bottom: 10pt;
    font-size: 7pt;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #8a8a82;
  }
  .bandeau .marque {
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: -0.01em;
    text-transform: none;
    color: #1c1c1b;
  }
  .bandeau .marque .barres { color: #f4883c; letter-spacing: -0.12em; }

  .pied {
    margin-top: 16pt;
    padding-top: 6pt;
    border-top: 0.5pt solid #e2e2de;
    display: flex;
    justify-content: space-between;
    font-size: 7pt;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #9a9a92;
  }

  /* ── Corps ─────────────────────────────────────────────────────────────── */

  .page { max-width: 180mm; margin: 0 auto; padding: 10mm 0 0; }

  /*
    Le gabarit porte son propre en-tete -- titre, client, date, reference. La
    couverture les affiche deja, et le contrat de reference attaque sa page 2
    directement sur "Entre les soussignes". On masque donc le doublon plutot
    que de retirer l en-tete du gabarit : celui-ci reste utilisable seul, par
    doc.nosho.org ou par tout autre habillage.
  */
  .contrat > header { display: none; }

  h1 { font-size: 18pt; line-height: 1.15; margin: 0 0 3pt; text-wrap: balance; }
  .sous-titre { color: #55554f; font-size: 11pt; margin: 0 0 14pt; }

  /*
    Le titre d article : gros numero orange, titre sombre, filet epais.
    C est la signature visuelle du contrat de reference.
  */
  h2 {
    font-size: 13pt;
    font-weight: 700;
    margin: 20pt 0 8pt;
    padding-bottom: 5pt;
    border-bottom: 1.4pt solid #1c1c1b;
    text-wrap: balance;
  }
  h3 { font-size: 10.5pt; font-weight: 700; margin: 12pt 0 4pt; color: #1c1c1b; }
  h4 { font-size: 9.5pt; font-weight: 700; margin: 9pt 0 3pt; color: #33332f; }

  p, li { margin: 0 0 6pt; }
  ul, ol { margin: 0 0 8pt; padding-left: 14pt; }
  li { padding-left: 2pt; }
  li::marker { color: #f4883c; }

  strong { font-weight: 700; }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 8pt 0;
    font-size: 9pt;
  }
  th, td {
    text-align: left;
    padding: 5pt 7pt;
    border-bottom: 0.5pt solid #e6e6e1;
    vertical-align: top;
  }
  thead th {
    font-size: 7.5pt;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    background: #f6f6f3;
    border-bottom: 0.8pt solid #d8d8d2;
  }
  tbody th { font-weight: 700; background: transparent; width: 34%; }
  td.montant, th.montant { text-align: right; font-variant-numeric: tabular-nums; }

  .encadre {
    border-left: 2.5pt solid #f4883c;
    background: #fdf4ec;
    padding: 8pt 10pt;
    margin: 10pt 0;
  }
  .encadre-titre {
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #c86a22;
    margin-bottom: 4pt;
  }
  .note { font-size: 8.5pt; color: #6a6a62; font-style: italic; }

  /* ── Sauts de page ─────────────────────────────────────────────────────── */

  section, .signatures, table, .encadre { break-inside: avoid; }
  h1, h2, h3, h4 { break-after: avoid; }

  /*
    L annexe 1 commence page neuve : c est un accord distinct, signe au titre de
    l article 28 du RGPD, et l enchainer au corps le ferait lire comme une suite
    du contrat.
  */
  #annexes { break-before: page; }
  #annexes > section { break-before: page; }
  #annexes > section:first-of-type { break-before: auto; }

  .signatures {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12mm;
    margin-top: 16pt;
  }
  .signatures .bloc { border-top: 0.8pt solid #1c1c1b; padding-top: 6pt; }

  /* ── Aide à l'écran, jamais imprimée ───────────────────────────────────── */

  .aide {
    max-width: 180mm;
    margin: 8mm auto 0;
    padding: 8pt 10pt;
    background: #f2f6fb;
    border: 0.5pt solid #cfdcec;
    border-radius: 4pt;
    font-size: 9pt;
    color: #33475e;
  }
  @media print {
    .aide { display: none; }
    .couverture { min-height: auto; height: 247mm; }
  }
`;

/** La marque, en typographie : le dépôt ne porte pas encore le logo Nosho. */
function marque(): string {
  return `<span class="marque"><span class="barres">|||</span>nosho</span>`;
}

/** Enveloppe un fragment rendu dans un document complet, prêt à imprimer. */
export function wrapContractDocument(
  fragment: string,
  options: DocumentOptions,
): string {
  const kicker = options.kicker ?? options.title;

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

<section class="couverture">
  <div>${marque()}</div>
  <div>
    <p class="titre">${escapeAttribute(kicker)}</p>
    ${
      options.clientName
        ? `<p class="client">${escapeAttribute(options.clientName)}</p>`
        : ""
    }
    <div class="filet"></div>
    ${
      options.contractDate
        ? `<p class="etiquette">Date</p><p>${escapeAttribute(options.contractDate)}</p><div class="filet"></div>`
        : ""
    }
    <p class="mentions">
      <strong>${NOSHO.raisonSociale} :</strong> ${NOSHO.adresse}<br>
      ${NOSHO.rcs}<br>
      ${NOSHO.representant}
    </p>
  </div>
</section>

<main class="page">
  <div class="bandeau">
    ${marque()}
    <span>${escapeAttribute(kicker)}</span>
  </div>
${fragment}
  <div class="pied">
    <span>nosho.ai — ${escapeAttribute(kicker)}</span>
    <span>${escapeAttribute(options.contractDate ?? "")}</span>
  </div>
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
