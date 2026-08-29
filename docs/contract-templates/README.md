# Gabarits de contrat

Destinés à **`doc.nosho.org`**, pas au CRM. Ils vivent ici le temps d'être
posés sur le service documentaire, pour être versionnés quelque part et relus.

Le CRM appelle `POST /api/contracts` avec le payload décrit ci-dessous, sur le
modèle de `/api/proposals` qu'utilise déjà « Générer la proposition ». Le
service choisit le gabarit d'après `kind` et rend `{ editUrl, publicUrl }`.

## Convention

Variables en `{{ chemin.pointé }}`, sections conditionnelles en
`{{#clé}}…{{/clé}}`. Syntaxe Mustache, la plus portable — à adapter si
`doc.nosho.org` emploie autre chose, les noms de variables restant identiques.

La source de vérité des noms est
[`contractPayload.ts`](../../src/components/atomic-crm/contracts/contractPayload.ts),
testé. Tout nom écrit dans un gabarit doit y exister, et réciproquement.

## Ce que le CRM n'envoie pas, à dessein

**Les constantes Nosho** : raison sociale, capital, RCS, adresse du siège,
adresse de contact, DPO, ICS du mandat SEPA. Elles appartiennent au gabarit.
Les faire transiter par le CRM ferait de chaque contrat une occasion de les
contredire.

**Aucune date de fin sur le contrat cadre.** Son article 7 pose une période
ferme comptée depuis la mise en production, puis une tacite reconduction : une
date de fin serait un chiffre faux. Le POC, lui, a bien un début et une fin —
deux semaines fermes — d'où `trial`.

**Forme juridique, capital, RCS et code APE du client** arrivent de Pappers au
moment de la génération, jamais du stock CRM : ils changent sans que le CRM en
soit informé, et un contrat doit porter l'état du registre le jour où il est
édité.

## Les variables

| Variable | Exemple | Présente sur |
|---|---|---|
| `kind` | `poc` \| `cadre` | les deux |
| `contractRef` | `NSH-C-2026-42` | les deux |
| `contractDate` | `28 août 2026` | les deux |
| `client.name` | `Hôpital Européen` | les deux |
| `client.qualification` | `Établissement de santé` | les deux |
| `client.siret` | `12345678900011` | les deux |
| `client.vatNumber` | `FR12345678900` | cadre |
| `client.address` `.zipcode` `.city` | | les deux |
| `client.legalForm` | `SAS` | les deux |
| `client.shareCapital` | `822 €` | les deux |
| `client.rcsNumber` `.rcsCity` | | les deux |
| `client.apeCode` | `86.23Z` | les deux |
| `signatory.firstName` `.lastName` | `Virginie` `Roger` | les deux |
| `signatory.jobTitle` | `Directrice de la Transition Numérique` | les deux |
| `signatory.email` | | les deux |
| `referentEmail` | | cadre |
| `noshoSignatoryName` | `Thomas Guillaumin` | les deux |
| `noshoSignatoryJobTitle` | `Président` | les deux |
| `offer.label` | `Forfait confirmation` | les deux |
| `offer.detail` | `Appel sortant de confirmation…` | les deux |
| `offer.unitPrice` | `0,25 €` — **déjà formaté** | les deux |
| `offer.unit` | `confirmation` | les deux |
| `commitmentMonths` | `12` | cadre |
| `renewalMonths` | `12` | cadre |
| `noticeDays` | `30` | cadre |
| `trial.startDate` | `lundi 31 août 2026` | poc |
| `trial.endDate` | `dimanche 13 septembre 2026` | poc |
| `trial.weeks` | `deux (2)` | poc |
| `sepaMandateReference` | `NOSHO-2026-042` | cadre |

`client.isIndividual` vaut vrai quand le client signe en nom propre — un
praticien en entreprise individuelle, comme dans le contrat POC de référence.
Le bloc « parties » s'écrit alors sans capital ni représentant.

## État des trois gabarits

| Fichier | État |
|---|---|
| `contrat-poc.html` | **Complet.** Texte repris mot pour mot du `.docx`, qui en contenait une couche exploitable. |
| `mandat-sepa.html` | **Complet.** Texte repris du PDF de référence, ICS et RUM en place. |
| `contrat-cadre.html` | **Structure et variables seulement.** Voir ci-dessous. |

### Pourquoi le contrat cadre est incomplet

Ses 26 pages n'existent qu'en **images**, dans le PDF comme dans le `.docx` :
35 fichiers média, aucune police embarquée, 320 caractères de texte
extractibles pour 8,9 Mo. Word n'en est que l'emballage.

Le squelette ci-joint — les 13 articles, les 7 annexes, l'emplacement de chaque
variable — a été relevé en lisant les pages rendues à l'écran. Il est fiable
sur la **structure**. Le **texte juridique**, lui, n'a pas été transcrit :
recopier 26 pages de clauses à l'œil expose à une erreur de chiffre ou de
formulation que personne ne rattraperait avant l'envoi à un client.

Deux façons de le compléter, par ordre de préférence :

1. **Retrouver la source.** Le pied de page dit « nosho.ai — CONTRAT DE
   RÉFÉRENCE · HEM · JUILLET 2026 », la mise en page est aux couleurs Nosho, et
   le producteur du PDF est « Chrome Helper » sur macOS : ce document a très
   probablement été imprimé depuis `doc.nosho.org` lui-même. Si c'est le cas,
   le gabarit existe déjà et il ne reste qu'à y poser les variables.
2. **Transcrire les 26 pages**, à faire relire ensuite contre l'original.

## Un défaut relevé dans le contrat de référence

Page 3 du contrat HEM, la carte Client porte `[SIREN / FINESS HEM]` : le champ
n'a jamais été rempli et est parti tel quel chez le client. Le gabarit ci-joint
n'expose pas de FINESS — Simon a tranché qu'il n'était pas nécessaire — mais le
contrat signé, lui, porte toujours cette mention.
