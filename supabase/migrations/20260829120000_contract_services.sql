-- Lignes de prestation, gratuite et duree du POC (NOS-1156).
--
-- Fichier en ASCII pur : `scripts/supabase-push.sh` passe la migration a
-- `jq --arg` apres un `cat`, et sous Git Bash / Windows tout caractere
-- non-ASCII y devient U+FFFD. Voir 20260827100000.

-- ---------------------------------------------------------------------------
-- 1. Plusieurs lignes de prestation
-- ---------------------------------------------------------------------------
-- Un client peut prendre l'agent de secretariat ET l'agent de confirmation,
-- chacun avec son prix et son unite. Le triplet unique de 20260828170000
-- (offer_label / unit_price_cents / price_unit) ne pouvait en porter qu'une.
--
-- ## Pourquoi du jsonb et non une table `contract_lines`
--
-- Ces lignes n'ont pas de vie propre : elles naissent, changent et meurent
-- avec leur contrat, ne sont jamais filtrees ni agregees a travers plusieurs
-- contrats, et n'ont pas d'identite qu'on voudrait citer ailleurs. Une table
-- fille imposerait un second aller-retour au milieu d'une fenetre d'edition
-- qui doit rester atomique : aujourd'hui, fermer la fenetre sans enregistrer
-- ne laisse rien derriere elle.
--
-- Si un jour on veut savoir quels services se vendent le mieux, c'est une vue
-- avec `jsonb_array_elements` qu'il faudra ecrire, pas une migration.
--
-- Forme de chaque element :
--   {
--     "service": "confirmation-rdv" | "secretariat" | "autre",
--     "label": "Agent de confirmation de rendez-vous",
--     "unitPriceCents": 25,
--     "unit": "rendez-vous traite",
--     "comment": "Reprise des creneaux annulee incluse."
--   }
--
-- `unitPriceCents` en centimes, comme la colonne qu'elle remplace : 0,25 EUR
-- en flottant vaut 0,2500000000000001, et une facture ne se discute pas sur
-- une approximation binaire.
alter table public.contracts
  add column if not exists services jsonb not null default '[]'::jsonb;

comment on column public.contracts.services is
  'Lignes de prestation : service, libelle, prix unitaire en centimes, unite, '
  'commentaire. jsonb et non table fille : ces lignes n''ont pas de vie propre '
  'hors du contrat (NOS-1156).';

-- Les quatre colonnes que `services` remplace. Aucun contrat n'existe en
-- production au moment de cette migration (verifie : 0 ligne), donc pas de
-- reprise a faire -- et les garder en place creerait deux sources de verite
-- pour le meme prix.
alter table public.contracts drop column if exists offer_label;
alter table public.contracts drop column if exists offer_detail;
alter table public.contracts drop column if exists unit_price_cents;
alter table public.contracts drop column if exists price_unit;

-- ---------------------------------------------------------------------------
-- 2. Gratuite
-- ---------------------------------------------------------------------------
-- Le POC de reference est gratuit, et son article 5 l'ecrit noir sur blanc :
-- "Aucun montant, a quelque titre que ce soit, ne pourra etre facture au
-- Client au titre de celle-ci."
--
-- Ce n'est plus une constante : un POC peut se facturer. La consequence est
-- juridique et non cosmetique -- decocher la case change le texte de
-- l'article 5, et la formulation du POC payant n'existe dans aucun contrat
-- signe a ce jour. Le gabarit la porte en branche conditionnelle, a faire
-- relire avant le premier envoi.
--
-- Defaut `false` : la valeur vraie est un choix explicite de l'utilisateur,
-- pose par la fenetre d'edition pour un POC. Un defaut `true` ferait qu'un
-- contrat cadre insere par un script se declarerait gratuit.
alter table public.contracts
  add column if not exists is_free boolean not null default false;

comment on column public.contracts.is_free is
  'Contrat sans facturation. Change le texte de l''article 5 du POC, il ne se '
  'contente pas de masquer un prix (NOS-1156).';

-- ---------------------------------------------------------------------------
-- 3. Duree du POC
-- ---------------------------------------------------------------------------
-- Le contrat cadre n'a pas de date de fin -- sa periode ferme court depuis la
-- mise en production, puis se reconduit tacitement. Le POC, lui, en a une :
-- "prend effet le lundi 31 aout 2026 [...] jusqu'au dimanche 13 septembre
-- 2026 inclus".
--
-- `trial_weeks` est nul quand la duree est personnalisee. Le gabarit ecrit
-- alors les deux dates sans la mention "pour une duree de N semaines" : une
-- periode de dix jours n'est pas un nombre entier de semaines, et l'arrondir
-- donnerait une date de fin en desaccord avec la phrase qui la precede.
alter table public.contracts
  add column if not exists trial_start_date date;
alter table public.contracts
  add column if not exists trial_end_date date;
alter table public.contracts
  add column if not exists trial_weeks integer;

comment on column public.contracts.trial_end_date is
  'Fin de la periode d''essai du POC. Le contrat cadre n''en a pas : sa '
  'periode ferme court depuis la mise en production (NOS-1156).';

comment on column public.contracts.trial_weeks is
  'Duree en semaines quand elle est ronde, nulle quand elle est '
  'personnalisee. Le gabarit omet alors la mention "pour une duree de N '
  'semaines" plutot que d''arrondir (NOS-1156).';
