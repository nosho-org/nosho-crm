#!/usr/bin/env node
/**
 * ---------------------------------------------------------------------------
 * Collecter les encaissements Qonto (NOS-1237)
 * ---------------------------------------------------------------------------
 * Simon : « maj avec les infos mollie uniquement et tjrs ».
 *
 * Le « toujours » est le vrai sujet. Jusqu'ici la collecte se faisait à la
 * main, par un script jetable écrit dans un dossier temporaire : la table
 * `revenue_actuals` s'est donc arrêtée au 29 août, et le tableau de bord
 * annonçait en septembre un ARR calculé sur juillet. Un chiffre qui ne se
 * rafraîchit que si quelqu'un y pense finit toujours par mentir.
 *
 * Ce script est versionné pour cette raison, et se relance sans risque : il
 * écrase le mois qu'il recalcule (`on conflict`) au lieu d'ajouter des lignes.
 *
 * ## Mollie, plus une liste blanche de virements clients
 *
 * Simon : « remonte les virements de Hôpital Européen et de Breizh Clinique
 * aussi ». Ces deux-là paient par virement bancaire direct, pas par Mollie.
 *
 * On ne les reconnaît PAS par rapprochement avec les sociétés du CRM : cette
 * approche, essayée puis abandonnée, comptait 15 000 EUR d'apports personnels
 * d'avril 2026 — « M. ALEXANDRE BEAUDOUX », « Sylvain Beaudoux » — comme du
 * chiffre d'affaires. Le compte reçoit en effet des apports fondateurs, des
 * levées (SOGECARE, MARANANT, AUCTEO…) et des remboursements, tous crédités
 * comme un paiement client le serait.
 *
 * D'où `VIREMENTS_CLIENTS` : une liste nommée, tenue à la main. Un virement ne
 * compte que si son libellé contient l'un de ces motifs. C'est le seul filtre
 * qui ne peut pas confondre une levée de fonds avec une vente — au prix d'une
 * ligne à ajouter ici quand un nouveau client se met à payer par virement.
 *
 * Le risque assumé : un client qui paierait par virement sans figurer dans la
 * liste ne serait pas compté. C'est le bon sens du compromis — mieux vaut un
 * encaissement manquant, qui se corrige en ajoutant une ligne, qu'un apport en
 * capital gonflant le revenu récurrent.
 *
 * ## Usage
 *
 *   doppler run --project nosho-crm --config prd -- \
 *     node scripts/collect-revenue.mjs [--mois=2026-08] [--apercu]
 *
 * Sans `--mois`, le script reprend les douze derniers mois : rattraper est le
 * cas courant, pas l'exception.
 */

const QONTO_BASE = "https://thirdparty.qonto.com/v2";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

const APERCU = args.apercu === true || args["dry-run"] === true;

function moisCibles() {
  if (typeof args.mois === "string") return [args.mois];
  const liste = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    liste.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return liste.reverse();
}

/** Bornes UTC du mois, en ISO — l'API Qonto filtre sur `settled_at`. */
function bornes(mois) {
  const [an, m] = mois.split("-").map(Number);
  return {
    debut: new Date(Date.UTC(an, m - 1, 1)).toISOString(),
    fin: new Date(Date.UTC(an, m, 1)).toISOString(),
  };
}

async function qonto(chemin) {
  const cle = process.env.QONTO_API_KEY;
  if (!cle) throw new Error("QONTO_API_KEY absente (lancer via doppler run)");
  const r = await fetch(`${QONTO_BASE}${chemin}`, {
    headers: { Authorization: cle },
  });
  if (!r.ok) throw new Error(`Qonto ${r.status} sur ${chemin}`);
  return r.json();
}

async function supabase(sql) {
  const ref = process.env.SUPABASE_PROJECT_ID;
  const tok = process.env.SUPABASE_ACCESS_TOKEN;
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tok}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  const data = await r.json();
  if (!r.ok) throw new Error(`Supabase: ${JSON.stringify(data)}`);
  return data;
}

/** Un credit Mollie se reconnait a sa contrepartie. */
const estMollie = (t) => /mollie/i.test(`${t.label ?? ""} ${t.counterparty_name ?? ""}`);

/*
 * Les clients qui paient par virement direct, nommement (NOS-1245).
 *
 * `motif` est cherche dans le libelle, accents et casse ignores. Il doit etre
 * assez distinctif pour ne pas accrocher un apport ou un remboursement :
 * "hopital europeen", pas "hopital".
 *
 * Constate dans Qonto :
 *   GIE HOPITAL EUROPEEN            -> juillet 2026, 708 EUR
 *   S.A.S. BREIZH CLINIC RENNES...  -> aout 2026, 151,80 EUR
 *
 * Simon ecrit "brezi clinique" : c'est Breizh (la Bretagne), oriente Rennes.
 */
const VIREMENTS_CLIENTS = [
  { motif: "hopital europeen", nom: "Hopital Europeen" },
  { motif: "breizh clinic", nom: "Breizh Clinic" },
];

const sansAccentBas = (v) =>
  (v ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Un virement compte s'il figure dans la liste blanche, et seulement alors. */
const estVirementClient = (t) => {
  if (estMollie(t)) return false;
  const libelle = sansAccentBas(`${t.label ?? ""} ${t.counterparty_name ?? ""}`);
  return VIREMENTS_CLIENTS.some((c) => libelle.includes(c.motif));
};

async function main() {
  const comptes = await qonto("/bank_accounts");
  const iban = comptes.bank_accounts?.[0]?.iban;
  if (!iban) throw new Error("aucun compte bancaire lisible");

  for (const mois of moisCibles()) {
    const { debut, fin } = bornes(mois);
    const params = new URLSearchParams({
      iban,
      "settled_at_from": debut,
      "settled_at_to": fin,
      "side": "credit",
      "per_page": "100",
    });
    const { transactions = [] } = await qonto(`/transactions?${params}`);

    const mollie = transactions.filter(estMollie);
    const virements = transactions.filter(estVirementClient);

    const somme = (liste) =>
      Math.round(liste.reduce((t, x) => t + Number(x.amount ?? 0), 0) * 100) / 100;

    const lignes = [
      { source: "mollie", montant: somme(mollie), n: mollie.length },
      { source: "virement", montant: somme(virements), n: virements.length },
    ].filter((l) => l.n > 0);

    const total = lignes.reduce((t, l) => t + l.montant, 0);
    console.log(
      `${mois}  ${String(total.toFixed(2)).padStart(10)} EUR  ` +
        lignes.map((l) => `${l.source} ${l.montant} (${l.n})`).join(", "),
    );

    if (APERCU) continue;

    /*
     * On efface le mois avant de le reecrire.
     *
     * Les lignes `virement` posees par la collecte precedente doivent
     * disparaitre : sans ce menage, le total continuerait d'additionner une
     * source qu'on vient justement de retirer.
     */
    await supabase(
      `delete from revenue_actuals where month = '${mois}-01'`,
    );
    for (const l of lignes) {
      await supabase(
        `insert into revenue_actuals (month, source, amount, transaction_count, updated_at)
         values ('${mois}-01', '${l.source}', ${l.montant}, ${l.n}, now())`,
      );
    }
  }
}

main().catch((e) => {
  console.error("Echec:", e.message);
  process.exit(1);
});
