import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useGetList } from "ra-core";

import { Card, CardContent } from "@/components/ui/card";

import { STAGE_COLORS } from "../dashboard/stageColors";
import { FilterMultiSelect } from "../filters/FilterMultiSelect";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Company, Deal, Sale } from "../types";
import { CarteFrance } from "./CarteFrance";
import { agreger, type AffaireLocalisable } from "./agregation";

/**
 * ---------------------------------------------------------------------------
 * Mapping — où sont nos prospects (demande de Simon, 18/10/2026)
 * ---------------------------------------------------------------------------
 * « Une vision très schématique des villes dans lesquelles on a des leads, avec
 * un code couleur en fonction des leads, savoir s'il est en qualifié, s'il est
 * lost ou pas. Une carte de France où on peut zoomer, dézoomer. »
 *
 * ## Deux lectures, pas une
 *
 * L'adresse ne vit pas sur l'opportunité mais sur la SOCIÉTÉ, et
 * `deals_summary` n'expose que son nom — ni `city`, ni `zipcode`. Deux chemins
 * s'offraient :
 *
 * - **ajouter les deux colonnes à la vue**, ce qui ferait une seule requête.
 *   Mais `deals_summary` est la vue la plus chaude de l'application — la liste,
 *   le kanban et le tableau de bord la lisent — et la modifier impose un
 *   DROP + CREATE avec ses `grant` à refaire. Un onglet de confort ne justifie
 *   pas ce risque-là ;
 * - **joindre côté navigateur**, ce qui coûte une seconde requête. Mesuré le
 *   18/10/2026 : 727 sociétés, 698 Ko de JSON dont 206 Ko de descriptions. Sur
 *   un écran qu'on ouvre de temps en temps, et à côté des mille opportunités
 *   que la liste charge déjà, c'est le prix le plus bas des deux.
 *
 * Le jour où la ville sert ailleurs — une colonne dans la liste, par exemple —
 * c'est la vue qu'il faudra changer, et cette page la lira sans rien d'autre à
 * modifier.
 *
 * ## Le tiers qu'on ne peut pas placer est AFFICHÉ
 *
 * ⚠️ 145 des 446 opportunités ouvertes n'ont ni code postal ni ville, mesuré le
 * jour de l'écriture. Une carte qui les tairait montrerait les deux tiers
 * restants comme si c'était le pipeline entier — et c'est exactement le genre
 * d'écart qu'on ne remarque jamais. La liste « sans adresse » est donc sous la
 * carte, nominative et cliquable, pas dans une note de bas de page.
 */

/** Les étapes ouvertes, celles sur lesquelles l'écran s'ouvre. */
/**
 * Ce que la carte NE montre PAS tant qu'aucune étape n'est choisie.
 *
 * Les perdues en faisaient partie, et Simon l'a demandé deux fois le
 * 18/10/2026 : « tu ne m'affiches toujours pas les opportunités passées en
 * lost en rouge, je voudrais les voir ». Elles sont donc dans la vue par
 * défaut, en rouge, et l'anneau d'une ville dit la part qu'elles y prennent.
 *
 * Les gagnées et les churns restent dehors : une affaire signée n'est plus un
 * prospect, et cet écran répond à « où travaille-t-on ». Le filtre d'étape les
 * ramène en un clic pour qui veut les voir.
 */
const ETAPES_FERMEES = ["closed-won", "churn"];

export const MappingPage = () => {
  const { dealStages } = useConfigurationContext();
  const [etapes, setEtapes] = useState<string[]>([]);
  const [responsables, setResponsables] = useState<string[]>([]);
  const [selection, setSelection] = useState<string | null>(null);
  const navigate = useNavigate();

  const { data: affaires, isPending: affairesEnCours } = useGetList<Deal>(
    "deals",
    {
      pagination: { page: 1, perPage: 1000 },
      sort: { field: "id", order: "ASC" },
      filter: { "archived_at@is": null },
    },
  );

  const { data: societes, isPending: societesEnCours } = useGetList<Company>(
    "companies",
    {
      pagination: { page: 1, perPage: 1000 },
      sort: { field: "id", order: "ASC" },
    },
  );

  const { data: commerciaux } = useGetList<Sale>("sales", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "last_name", order: "ASC" },
    filter: { "disabled@neq": true },
  });

  const adresses = useMemo(() => {
    const index = new Map<string, { city?: string; zipcode?: string }>();
    for (const societe of societes ?? []) {
      index.set(String(societe.id), {
        city: societe.city ?? undefined,
        zipcode: societe.zipcode ?? undefined,
      });
    }
    return index;
  }, [societes]);

  const ordreDesEtapes = useMemo(
    () => dealStages.map((etape) => etape.value),
    [dealStages],
  );

  const nomsDesEtapes = useMemo(
    () => new Map(dealStages.map((etape) => [etape.value, etape.label])),
    [dealStages],
  );

  const nomsDesCommerciaux = useMemo(
    () =>
      new Map(
        (commerciaux ?? []).map((commercial) => [
          String(commercial.id),
          `${commercial.first_name} ${commercial.last_name}`.trim(),
        ]),
      ),
    [commerciaux],
  );

  const retenues = useMemo<AffaireLocalisable[]>(() => {
    const voulues = new Set(etapes);
    const proprietaires = new Set(responsables);
    return (affaires ?? [])
      .filter((affaire) => {
        // Sans filtre d'étape : les affaires ouvertes ET les perdues. Voir
        // ETAPES_FERMEES pour ce qui reste dehors, et pourquoi.
        if (voulues.size === 0 && ETAPES_FERMEES.includes(affaire.stage)) {
          return false;
        }
        if (voulues.size > 0 && !voulues.has(affaire.stage)) return false;
        if (
          proprietaires.size > 0 &&
          !proprietaires.has(String(affaire.sales_id))
        ) {
          return false;
        }
        return true;
      })
      .map((affaire) => {
        const adresse = adresses.get(String(affaire.company_id));
        return {
          id: affaire.id,
          name: affaire.name,
          stage: affaire.stage,
          amount: affaire.amount,
          company_name: affaire.company_name,
          company_city: adresse?.city ?? null,
          company_zipcode: adresse?.zipcode ?? null,
          priority: affaire.priority ?? null,
          sales_id: affaire.sales_id ?? null,
          expected_closing_date: affaire.expected_closing_date ?? null,
          next_task_date: affaire.next_task_date ?? null,
          next_task_text: affaire.next_task_text ?? null,
        };
      });
  }, [affaires, adresses, etapes, responsables]);

  const mapping = useMemo(
    () => agreger(retenues, ordreDesEtapes),
    [retenues, ordreDesEtapes],
  );

  const pastilleChoisie =
    mapping.pastilles.find((pastille) => pastille.cle === selection) ?? null;

  const enCours = affairesEnCours || societesEnCours;

  /*
   * « X sur Y » et non « X » : le total est ce qui rend le trou visible. Un
   * compteur qui n'annonce que les placees laisse croire qu'elles sont tout.
   */
  const placees =
    retenues.length - mapping.sansAdresse.length - mapping.nonPlacees.length;

  const etapesPresentes = useMemo(() => {
    const vues = new Set(retenues.map((affaire) => affaire.stage));
    return dealStages.filter((etape) => vues.has(etape.value));
  }, [retenues, dealStages]);

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="flex flex-wrap items-end gap-3">
        <FilterMultiSelect
          label="Étape"
          selected={etapes}
          onToggle={(valeur) =>
            setEtapes((courant) =>
              courant.includes(valeur)
                ? courant.filter((e) => e !== valeur)
                : [...courant, valeur],
            )
          }
          onClear={() => setEtapes([])}
          allLabel="Ouvertes et perdues"
          choices={dealStages}
        />
        <FilterMultiSelect
          label="Responsable"
          selected={responsables}
          onToggle={(valeur) =>
            setResponsables((courant) =>
              courant.includes(valeur)
                ? courant.filter((r) => r !== valeur)
                : [...courant, valeur],
            )
          }
          onClear={() => setResponsables([])}
          allLabel="Tous"
          choices={(commerciaux ?? []).map((commercial) => ({
            value: String(commercial.id),
            label: `${commercial.first_name} ${commercial.last_name}`.trim(),
          }))}
        />

        <p className="text-sm text-muted-foreground mb-1.5">
          {enCours
            ? "Chargement…"
            : `${mapping.pastilles.length} ville${
                mapping.pastilles.length > 1 ? "s" : ""
              } · ${placees} opportunité${placees > 1 ? "s" : ""} placée${
                placees > 1 ? "s" : ""
              } sur ${retenues.length}${
                mapping.deduites > 0
                  ? `, dont ${mapping.deduites} d'après leur intitulé`
                  : ""
              }`}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[3fr_1fr] gap-4 items-start">
        <div className="flex flex-col gap-3 min-w-0">
          <CarteFrance
            pastilles={mapping.pastilles}
            maximum={mapping.maximum}
            selection={selection}
            onSelectionner={setSelection}
            rendreInfobulle={({ affaires }) => (
              <ContenuInfobulle
                affaires={affaires}
                nomsDesEtapes={nomsDesEtapes}
                nomsDesCommerciaux={nomsDesCommerciaux}
                onOuvrir={(id) => navigate(`/deals/${id}/show`)}
              />
            )}
          />

          {/* La légende ne liste que les étapes RÉELLEMENT dessinées : une
              légende qui annonce neuf couleurs pour trois pastilles fait
              chercher six teintes qui ne sont nulle part. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {etapesPresentes.map((etape) => (
              <span key={etape.value} className="flex items-center gap-1.5">
                <span
                  className="inline-block w-3 h-3 rounded-full"
                  style={{ background: STAGE_COLORS[etape.value] }}
                  aria-hidden
                />
                {etape.label}
              </span>
            ))}
            <span className="text-muted-foreground">
              La taille d'une pastille suit le nombre d'opportunités.
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-4 min-w-0">
          {pastilleChoisie ? (
            <DetailVille pastille={pastilleChoisie} />
          ) : (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                Cliquez une pastille pour voir les opportunités de la ville.
              </CardContent>
            </Card>
          )}

          <HorsCarte
            titre="opportunité(s) non placée(s)"
            explication="Une adresse est renseignée, mais la ville ou le code postal n'a pas été reconnu — une région saisie dans le champ ville, une adresse hors de France, une faute de frappe. Celles-là se corrigent sur la fiche société."
            affaires={mapping.nonPlacees}
            total={retenues.length}
            montrerLAdresse
          />
          <HorsCarte
            titre="opportunité(s) sans adresse"
            explication="Leur société n'a ni code postal ni ville. Rien à corriger tant que personne ne l'a renseignée."
            affaires={mapping.sansAdresse}
            total={retenues.length}
          />
        </div>
      </div>
    </div>
  );
};

/**
 * Ce que montre l'infobulle, et pourquoi pas plus.
 *
 * Simon : « une infobulle avec les informations clés de l'opportunité, et si
 * on clique ensuite dessus ça renvoie vers la page de l'opportunité ».
 *
 * Les informations clés sont celles qui décident si l'on ouvre la fiche :
 * l'étape et sa couleur, l'ARR, qui la suit, quand elle doit se conclure, et
 * la prochaine action s'il y en a une. Tout le reste est à un clic ; une bulle
 * qui recopierait l'opportunité entière ferait un second CRM dans une bulle,
 * et il faudrait la refermer pour travailler.
 *
 * La ligne entière est un bouton, pas seulement le titre : viser un lien de
 * trois mots à la souris sur une carte où l'on vient de zoomer est un exercice
 * qu'on rate une fois sur deux.
 */
const ContenuInfobulle = ({
  affaires,
  nomsDesEtapes,
  nomsDesCommerciaux,
  onOuvrir,
}: {
  affaires: ReturnType<typeof agreger>["pastilles"][number]["affaires"];
  nomsDesEtapes: Map<string, string>;
  nomsDesCommerciaux: Map<string, string>;
  onOuvrir: (id: string | number) => void;
}) => {
  const { currency } = useConfigurationContext();
  const devise = currency === "USD" ? "$" : "€";
  return (
    <>
      {affaires.length > 1 && (
        <p className="text-xs text-muted-foreground mb-1.5">
          {affaires.length} opportunités — cliquez pour ouvrir la fiche
        </p>
      )}
      {/* Au-delà de six, on déroule : une bulle plus haute que la carte la
          cacherait entièrement. */}
      <ul className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
        {affaires.map((affaire) => {
          const responsable =
            affaire.sales_id != null
              ? nomsDesCommerciaux.get(String(affaire.sales_id))
              : undefined;
          return (
            <li key={affaire.id}>
              <button
                type="button"
                onClick={() => onOuvrir(affaire.id)}
                className="w-full text-left rounded-md p-1.5 -m-0.5 hover:bg-muted transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-2 h-2 rounded-full shrink-0"
                    style={{
                      background:
                        STAGE_COLORS[affaire.stage] ??
                        "var(--muted-foreground)",
                    }}
                    aria-hidden
                  />
                  <span className="text-sm font-medium truncate">
                    {affaire.name}
                  </span>
                  {affaire.deduite && (
                    <span
                      className="text-muted-foreground shrink-0"
                      title="Placée d'après son intitulé, pas d'après une adresse"
                    >
                      ≈
                    </span>
                  )}
                </span>
                {affaire.company_name && (
                  <span className="block text-xs text-muted-foreground truncate pl-3.5">
                    {affaire.company_name}
                  </span>
                )}
                <span className="block text-xs text-muted-foreground pl-3.5">
                  {[
                    nomsDesEtapes.get(affaire.stage) ?? affaire.stage,
                    affaire.amount
                      ? `${affaire.amount.toLocaleString("fr-FR")} ${devise}`
                      : null,
                    responsable,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {affaire.next_task_text ? (
                  <span className="block text-xs text-muted-foreground pl-3.5 truncate">
                    ⏱ {affaire.next_task_text}
                    {affaire.next_task_date
                      ? ` — ${new Date(affaire.next_task_date).toLocaleDateString("fr-FR")}`
                      : ""}
                  </span>
                ) : (
                  affaire.expected_closing_date && (
                    <span className="block text-xs text-muted-foreground pl-3.5">
                      Clôture prévue le{" "}
                      {new Date(
                        affaire.expected_closing_date,
                      ).toLocaleDateString("fr-FR")}
                    </span>
                  )
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
};

const DetailVille = ({
  pastille,
}: {
  pastille: ReturnType<typeof agreger>["pastilles"][number];
}) => {
  const { currency } = useConfigurationContext();
  return (
    <Card>
      <CardContent className="p-4 flex flex-col gap-2">
        <div>
          <p className="font-semibold text-sm">{pastille.ville}</p>
          <p className="text-xs text-muted-foreground">
            {pastille.nombre} opportunité{pastille.nombre > 1 ? "s" : ""}
            {pastille.arr > 0 &&
              ` · ${pastille.arr.toLocaleString("fr-FR")} ${currency === "USD" ? "$" : "€"}`}
          </p>
          {/*
            Dit à qui ouvre la ville ce qui s'y trouve de supposé, et où aller
            le réparer : c'est l'adresse de la SOCIÉTÉ qui manque ou qui n'est
            pas lisible, pas quelque chose sur l'affaire.
          */}
          {pastille.deduites > 0 && (
            <p className="text-xs text-muted-foreground italic mt-0.5">
              {pastille.deduites === pastille.nombre
                ? pastille.nombre > 1
                  ? "Toutes placées d'après leur intitulé, faute d'adresse exploitable sur les sociétés."
                  : "Placée d'après son intitulé, faute d'adresse exploitable sur la société."
                : `${pastille.deduites} placée${
                    pastille.deduites > 1 ? "s" : ""
                  } d'après leur intitulé, faute d'adresse exploitable sur la société.`}
            </p>
          )}
        </div>
        <ul className="flex flex-col gap-1">
          {pastille.affaires.map((affaire) => (
            <li key={affaire.id} className="text-xs">
              <Link
                to={`/deals/${affaire.id}/show`}
                className="hover:underline inline-flex items-center gap-1.5"
              >
                <span
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{
                    background:
                      STAGE_COLORS[affaire.stage] ?? "var(--muted-foreground)",
                  }}
                  aria-hidden
                />
                <span className="truncate">
                  {affaire.company_name || affaire.name}
                </span>
                {affaire.deduite && (
                  <span
                    className="text-muted-foreground shrink-0"
                    title="Placée d'après son intitulé, pas d'après une adresse"
                  >
                    ≈
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};

/**
 * Ce que la carte ne montre pas, et pourquoi.
 *
 * Le bloc est plié par défaut mais son COMPTE est toujours visible : c'est le
 * chiffre qui dit combien la carte ne montre pas, et le cacher derrière un clic
 * reviendrait à le taire.
 *
 * `montrerLAdresse` sur les NON PLACÉES : on affiche ce qui a été lu —
 * « 13090 / Aix En Provence » — parce que c'est là que se voit ce qui cloche.
 * Sur les sans-adresse il n'y a rien à montrer, par définition.
 */
const HorsCarte = ({
  titre,
  explication,
  affaires,
  total,
  montrerLAdresse = false,
}: {
  titre: string;
  explication: string;
  affaires: AffaireLocalisable[];
  total: number;
  montrerLAdresse?: boolean;
}) => {
  const [deplie, setDeplie] = useState(false);
  if (affaires.length === 0) return null;
  const part = total > 0 ? Math.round((affaires.length / total) * 100) : 0;

  return (
    <Card className="border-[var(--deal-status-warning)]/50">
      <CardContent className="p-4 flex flex-col gap-2">
        <p className="text-sm font-medium">
          {affaires.length}{" "}
          {titre.replace("(s)", affaires.length > 1 ? "s" : "")}
        </p>
        <p className="text-xs text-muted-foreground">
          {part} % des opportunités affichées. {explication}
        </p>
        <button
          type="button"
          onClick={() => setDeplie((courant) => !courant)}
          className="text-xs underline self-start hover:no-underline"
        >
          {deplie ? "Masquer la liste" : "Voir lesquelles"}
        </button>
        {deplie && (
          <ul className="flex flex-col gap-1 max-h-64 overflow-y-auto">
            {affaires.map((affaire) => (
              <li key={affaire.id} className="text-xs">
                <Link
                  to={`/deals/${affaire.id}/show`}
                  className="hover:underline truncate block"
                >
                  {affaire.company_name || affaire.name}
                  {montrerLAdresse && (
                    <span className="text-muted-foreground">
                      {" — "}
                      {[affaire.company_zipcode, affaire.company_city]
                        .filter(Boolean)
                        .join(" ")}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

MappingPage.path = "/mapping";
