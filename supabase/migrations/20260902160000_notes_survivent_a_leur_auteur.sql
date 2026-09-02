-- ---------------------------------------------------------------------------
-- Les notes survivent a leur auteur (NOS-1234)
-- ---------------------------------------------------------------------------
-- Simon voulait supprimer les comptes desactives. Trois d'entre eux sont
-- retenus par des notes qu'ils ont ecrites : Etienne 8, Leo 10, Benjamin 539.
--
-- Arbitrage retenu : detacher l'auteur, garder les notes. Une note dit ce
-- qu'un client a repondu ; elle vaut pour l'affaire, pas pour la personne qui
-- l'a saisie. La reattribuer a un collegue ferait dire a quelqu'un des mots
-- qu'il n'a pas ecrits, et la supprimer viderait le contexte d'affaires
-- toujours en cours.
--
-- Deux corrections, de sens oppose :
--
--   deal_notes    NO ACTION -> SET NULL. La contrainte bloquait la
--                 suppression du compte. Desormais la note reste, sans auteur.
--
--   contact_notes CASCADE   -> SET NULL. Bien pire : la contrainte ne bloquait
--                 rien, elle SUPPRIMAIT les notes avec le compte. Personne ne
--                 l'aurait vu passer -- c'est precisement le genre de perte
--                 muette qu'un decompte applicatif ne rattrape pas, puisque
--                 la base l'execute sans se plaindre.
--
-- Les deux colonnes acceptaient deja NULL : seule la regle de suppression
-- change, aucune donnee n'est touchee.

alter table public.deal_notes
  drop constraint "dealNotes_sales_id_fkey";

alter table public.deal_notes
  add constraint "dealNotes_sales_id_fkey"
  foreign key (sales_id) references public.sales (id)
  on delete set null;

alter table public.contact_notes
  drop constraint "contactNotes_sales_id_fkey";

-- `on update cascade` est conserve : il figurait sur la contrainte d origine,
-- et le perdre ici serait une regression invisible.
alter table public.contact_notes
  add constraint "contactNotes_sales_id_fkey"
  foreign key (sales_id) references public.sales (id)
  on update cascade on delete set null;
