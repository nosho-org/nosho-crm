# L'encaisse mensuelle — collecte et mise à jour

Le KPI « Encaissé » du tableau de bord lit la table `revenue_actuals`. Cette
table n'est **pas** alimentée automatiquement. Ce document dit pourquoi, et
comment la mettre à jour en attendant.

## Ce que le chiffre mesure

La somme des encaissements clients d'un mois, toutes sources confondues :

| Source | Ce que c'est | Comment on la reconnaît |
|---|---|---|
| `mollie` | Reversements de Mollie, qui collecte les prélèvements SEPA | Crédit dont le libellé est `Stichting Mollie Payments` |
| `virement` | Virement bancaire direct d'un client | Crédit dont la contrepartie est **une société du CRM** |

**La règle de départ était fausse.** La consigne disait que les virements
Mollie équivalaient à tous les paiements clients. Ce n'est pas le cas :
*Hôpital Européen* paie par virement direct. C'est Simon qui l'a vu, sur
l'écart entre les 3 166 € que le filtre Mollie donnait pour juillet et les
3 874 € qu'il attendait — 3 166,31 + 708,00 = 3 874,31.

## Ce qui NE compte pas, et pourquoi

Le compte Qonto reçoit aussi des apports en compte courant des fondateurs, des
remboursements SNCF et Amazon, et des crédits de 5 000 € de SOGECARE, AUCTEO et
MARANANT — **aucune de ces contreparties n'est une société du CRM**.

Le critère « la contrepartie est une société du CRM » est retenu parce qu'il se
vérifie, se re-vérifie à chaque collecte, et ne demande à personne de se
souvenir d'une liste.

Le risque assumé : un client absent du CRM ne serait pas compté. C'est le bon
sens du compromis — mieux vaut manquer un encaissement que gonfler le chiffre
d'affaires avec une subvention.

## Pourquoi ce n'est pas automatique

Qonto est branché sur **Claude**, pas sur le CRM. Le connecteur MCP vit du côté
de l'assistant ; les fonctions edge de Supabase n'y ont aucun accès.

Pour automatiser, il faut trois choses :

1. **une clé API Qonto** (Qonto → Paramètres → Intégrations → API), déposée
   dans Doppler, projet `nosho-crm`, config `prd` — jamais dans le dépôt ;
2. **une fonction edge** `collect-revenue` qui interroge
   `GET /v2/transactions`, filtre comme ci-dessus et écrit dans
   `revenue_actuals` ;
3. **un déclencheur mensuel** — `pg_cron` côté Supabase, ou une tâche planifiée
   externe — le 1er de chaque mois, pour le mois écoulé.

Tant que la clé n'existe pas, la collecte se fait à la main. Elle prend deux
minutes.

## La collecte à la main

Demander à Claude, en début de mois :

> Relève l'encaissé du mois dernier sur Qonto et mets à jour `revenue_actuals`.

Ce qu'il fait, et que vous pouvez refaire :

1. `list_bank_accounts` → l'identifiant du compte principal ;
2. `list_transactions` sur le mois écoulé, **toutes les pages** — c'est l'étape
   qu'on rate : un mois fait 150 à 250 transactions, donc 2 à 3 pages ;
3. garder les crédits `Stichting Mollie Payments`, puis les crédits dont la
   contrepartie correspond à une société du CRM ;
4. écrire une migration `insert … on conflict (month, source) do update`.

`transaction_count` est stocké à côté du montant précisément pour repérer une
collecte partielle : un mois qui passe de huit virements à un seul, pour un
montant proche, signale une pagination interrompue — pas une baisse d'activité.

## La règle d'affichage

Le KPI montre **le dernier mois complet**, jamais le mois en cours, et écrit son
nom à côté du montant.

Un mois entamé au tiers afficherait un tiers du chiffre, ce qui se lirait comme
une chute de 66 % tous les 10 du mois. C'est la règle demandée : « tant que le
mois n'est pas fini, tu conserves le MRR du mois précédent. »

## Relevé au 29 août 2026

| Mois | Mollie | Virements | Total |
|---|---|---|---|
| juin 2026 | 3 123,21 € (5) | — | **3 123,21 €** |
| juillet 2026 | 3 166,31 € (8) | 708,00 € (1) | **3 874,31 €** |

Août n'y figure pas : le mois n'était pas terminé.
