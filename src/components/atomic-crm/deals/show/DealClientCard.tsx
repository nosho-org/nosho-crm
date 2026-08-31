import { MapPin } from "lucide-react";
import { useGetOne, useRecordContext } from "ra-core";
import { Card } from "@/components/ui/card";

import type { Company, Deal } from "../../types";
import { AiDescriptionNotice } from "../../companies/AiDescriptionNotice";
import {
  adresseCartographiable,
  lienGoogleMaps,
} from "../../companies/companyMapLink";

/**
 * ---------------------------------------------------------------------------
 * « Le client » — descriptif et ville, sur la fiche opportunité (NOS-1122)
 * ---------------------------------------------------------------------------
 * Demandé par Marc-Henri : « Une fois sur la fiche, peut-on avoir à droite un
 * encadré qui reprend le descriptif de qui est le client ? + la ville. »
 *
 * Le titre de sa demande dit « fiche Société », mais c'est bien ici que le
 * manque était. La fiche société affiche déjà les deux — la ville dans
 * « Adresse », le descriptif dans « Informations complémentaires ». La fiche
 * opportunité, elle, ne montrait de la société que son nom et son groupe
 * parent : rien sur qui elle est ni où elle se trouve. Et c'est là qu'on se
 * pose la question, en ouvrant une affaire dont on ne se souvient plus.
 *
 * ## Pourquoi la carte disparaît plutôt que de s'afficher vide
 *
 * En production, 97 sociétés sur 459 ont un descriptif et 90 une ville — la
 * carte n'aurait donc rien à dire quatre fois sur cinq. Un cadre vide répété
 * sur toutes les fiches deviendrait un bruit qu'on apprend à sauter, et c'est
 * précisément ce qu'on ne veut pas d'un encadré demandé pour être vu.
 *
 * Même parti pris que `AddressInfo` et `AdditionalInfo` sur la fiche société,
 * qui se retirent aussi quand elles n'ont rien à montrer.
 *
 * Le taux montera de lui-même : l'enrichissement Pappers renseigne `city`.
 */
export const DealClientCard = () => {
  const record = useRecordContext<Deal>();

  const { data: company } = useGetOne<Company>(
    "companies",
    { id: record?.company_id as number },
    { enabled: record?.company_id != null },
  );

  const description = company?.description?.trim();
  const city = company?.city?.trim();

  /*
   * La localisation, cliquable (NOS-1211).
   *
   * Simon : « l'adresse qui remonte doit intégrer un lien vers la
   * localisation Google Maps ». L'épingle était là depuis le début, sans
   * rien derrière — un pictogramme qui promet une carte doit y mener.
   *
   * `adresseCartographiable` renvoie `null` quand on n'a que la ville : on
   * garde alors le texte simple. Un lien qui ouvre le centre d'une commune
   * à plusieurs kilomètres de l'établissement est pire qu'aucun lien.
   */
  const requeteCarte = adresseCartographiable({
    name: company?.name,
    address: company?.address,
    zipcode: company?.zipcode,
    city: company?.city,
  });

  // Rien à dire : on ne rend rien. Voir l'en-tête pour le raisonnement.
  if (!description && !city) return null;

  return (
    <Card className="p-4 flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Le client
      </span>

      {description && (
        <p className="text-sm whitespace-pre-line">{description}</p>
      )}

      {/* Même mention que sur la fiche société : le statut du texte ne doit
          pas dépendre de l'écran où on le lit (NOS-1149). */}
      {description && company?.description_source === "ai" && (
        <AiDescriptionNotice />
      )}

      {city &&
        (requeteCarte ? (
          <a
            href={lienGoogleMaps(requeteCarte)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground underline decoration-dotted underline-offset-4 w-fit"
            title={requeteCarte}
          >
            <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden />
            {city}
            <span className="sr-only">— ouvrir dans Google Maps</span>
          </a>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden />
            {city}
          </span>
        ))}
    </Card>
  );
};
