import { useCallback, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, WheelEvent } from "react";

import { STAGE_COLORS } from "../dashboard/stageColors";
import departements from "./departements.json";
import { arcs, rayon, type Pastille } from "./agregation";
import {
  SEUIL_DEPARTEMENTS,
  SEUIL_OPPORTUNITES,
  SEUIL_VILLES,
  centreDuPlusGrandAnneau,
  couronne,
  placerLesEtiquettes,
  tronquer,
  type Boite,
} from "./etiquettes";
import {
  CADRAGE_ENTIER,
  HAUTEUR,
  LARGEUR,
  glisser,
  projeter,
  zoomer,
  type Cadrage,
} from "./projection";

/**
 * ---------------------------------------------------------------------------
 * La carte, en SVG et sans fournisseur de tuiles
 * ---------------------------------------------------------------------------
 * Simon : « une carte de France où on peut zoomer, dézoomer et voir un peu
 * quels sont les leads qu'on a ».
 *
 * ## Pourquoi pas Leaflet
 *
 * Une carte à tuiles demande un serveur de tuiles. Chaque déplacement enverrait
 * alors à un tiers la zone que quelqu'un est en train de regarder — c'est-à-dire
 * où sont nos prospects —, et il faudrait une clé, un quota, un contrat. Pour
 * une carte que Simon décrit lui-même comme « très schématique », c'est payer
 * cher une précision qu'on ne demande pas.
 *
 * Le tracé des départements est embarqué, simplifié par Douglas-Peucker à
 * 0,02° : 5 235 points pour 96 départements, 81 Ko. Au zoom maximal la côte
 * est anguleuse ; à ce niveau on regarde les pastilles, pas le littoral.
 *
 * ## Le zoom est un `viewBox`, pas une transformation
 *
 * Grossir par CSS épaissirait les frontières avec le reste. En déplaçant la
 * fenêtre du SVG, c'est le navigateur qui redessine le vectoriel : les traits
 * gardent leur épaisseur, et le texte reste lisible à tous les niveaux. C'est
 * aussi ce qui rend le rayon des pastilles indépendant du zoom — voir
 * `echelle` plus bas, qui les décompense exprès.
 */

interface Departement {
  code: string;
  nom: string;
  /** [polygone][anneau][point][lng, lat] */
  polygones: number[][][][];
}

const DEPARTEMENTS = (departements as { departements: Departement[] })
  .departements;

/** Le tracé d'un département, projeté une fois pour toutes. */
const CHEMINS = DEPARTEMENTS.map((departement) => {
  const d = departement.polygones
    .flatMap((polygone) =>
      polygone.map((anneau) => {
        const points = anneau.map(([lng, lat]) => {
          const { x, y } = projeter({ lat, lng });
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        });
        return `M${points.join("L")}Z`;
      }),
    )
    .join("");
  const centre = centreDuPlusGrandAnneau(departement.polygones);
  return {
    code: departement.code,
    nom: departement.nom,
    d,
    etiquette: centre ? projeter(centre) : null,
  };
});

export const CarteFrance = ({
  pastilles,
  maximum,
  selection,
  onSelectionner,
  onOuvrirAffaire,
}: {
  pastilles: Pastille[];
  maximum: number;
  selection: string | null;
  onSelectionner: (cle: string | null) => void;
  onOuvrirAffaire: (id: string | number) => void;
}) => {
  const [cadrage, setCadrage] = useState<Cadrage>(CADRAGE_ENTIER);
  const svgRef = useRef<SVGSVGElement>(null);
  const glissement = useRef<{ x: number; y: number } | null>(null);
  /*
   * Un glissement ne doit pas valoir un clic. Sans ce témoin, déplacer la carte
   * en partant d'une pastille la sélectionne au relâchement, et on se retrouve
   * dans le détail d'une ville qu'on voulait seulement contourner.
   */
  const aGlisse = useRef(false);

  /**
   * Le rapport entre les unités du dessin et les pixels à l'écran.
   *
   * Il sert à DÉCOMPENSER le zoom sur tout ce qui n'est pas géographique :
   * une pastille doit garder la même taille apparente quel que soit le
   * grossissement, sinon zoomer sur Nice transforme ses vingt-cinq affaires en
   * tache qui couvre la Côte d'Azur.
   */
  const echelle = cadrage.largeur / LARGEUR;

  const pointDuPointeur = useCallback(
    (evenement: { clientX: number; clientY: number }) => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      /*
       * `preserveAspectRatio="xMidYMid meet"` laisse des bandes vides autour du
       * dessin dès que le conteneur n'a pas son rapport. Les ignorer ferait
       * dériver le zoom d'autant, et la carte fuirait sous le curseur.
       */
      const rapportDessin = cadrage.largeur / cadrage.hauteur;
      const rapportBoite = rect.width / rect.height;
      const largeurUtile =
        rapportBoite > rapportDessin ? rect.height * rapportDessin : rect.width;
      const hauteurUtile =
        rapportBoite > rapportDessin ? rect.height : rect.width / rapportDessin;
      const margeX = (rect.width - largeurUtile) / 2;
      const margeY = (rect.height - hauteurUtile) / 2;

      return {
        x:
          cadrage.x +
          ((evenement.clientX - rect.left - margeX) / largeurUtile) *
            cadrage.largeur,
        y:
          cadrage.y +
          ((evenement.clientY - rect.top - margeY) / hauteurUtile) *
            cadrage.hauteur,
      };
    },
    [cadrage],
  );

  const molette = (evenement: WheelEvent<SVGSVGElement>) => {
    const ancre = pointDuPointeur(evenement);
    if (!ancre) return;
    // Vers le haut (deltaY négatif) = on se rapproche.
    const facteur = Math.exp(-evenement.deltaY * 0.0015);
    setCadrage((courant) => zoomer(courant, facteur, ancre.x, ancre.y));
  };

  const appui = (evenement: ReactPointerEvent<SVGSVGElement>) => {
    glissement.current = { x: evenement.clientX, y: evenement.clientY };
    aGlisse.current = false;
    evenement.currentTarget.setPointerCapture(evenement.pointerId);
  };

  const deplacement = (evenement: ReactPointerEvent<SVGSVGElement>) => {
    const depart = glissement.current;
    if (!depart) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    const dx = evenement.clientX - depart.x;
    const dy = evenement.clientY - depart.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) aGlisse.current = true;
    glissement.current = { x: evenement.clientX, y: evenement.clientY };
    setCadrage((courant) =>
      glisser(
        courant,
        (-dx / rect.width) * courant.largeur,
        (-dy / rect.height) * courant.hauteur,
      ),
    );
  };

  const relachement = (evenement: ReactPointerEvent<SVGSVGElement>) => {
    glissement.current = null;
    evenement.currentTarget.releasePointerCapture(evenement.pointerId);
  };

  const recentrer = () => setCadrage(CADRAGE_ENTIER);

  const zoomBouton = (facteur: number) =>
    setCadrage((courant) =>
      zoomer(
        courant,
        facteur,
        courant.x + courant.largeur / 2,
        courant.y + courant.hauteur / 2,
      ),
    );

  /*
   * Le zoom, en « combien de fois la France tient dans la fenetre ». C'est lui
   * qui decide ce qui porte un nom — voir `etiquettes.ts` pour les seuils et
   * la raison de chacun.
   */
  const zoom = LARGEUR / cadrage.largeur;
  const montrerDepartements = zoom >= SEUIL_DEPARTEMENTS;
  const montrerVilles = zoom >= SEUIL_VILLES;
  const montrerOpportunites = zoom >= SEUIL_OPPORTUNITES;

  const pastillesProjetees = useMemo(
    () =>
      pastilles.map((pastille) => ({
        pastille,
        ...projeter(pastille.point),
        r: rayon(pastille.nombre, maximum),
      })),
    [pastilles, maximum],
  );

  /*
   * Les etiquettes se calculent ENSEMBLE et dans cet ordre — departements,
   * villes, opportunites — parce que chaque couche doit eviter les boites deja
   * prises par la precedente. Les calculer separement laisserait un nom de
   * ville sur un nom de departement.
   *
   * Les tailles sont en unites du DESSIN : une etiquette doit garder la meme
   * taille apparente quel que soit le zoom, donc elle retrecit quand on se
   * rapproche. C'est le meme raisonnement que le rayon des pastilles.
   */
  const etiquettes = useMemo(() => {
    const hauteurTexte = 13 * echelle;
    const largeurCaractere = 5.4 * echelle;
    const prises: Boite[] = [];

    const departementsPlaces = montrerDepartements
      ? placerLesEtiquettes(
          CHEMINS.filter((d) => d.etiquette).map((d) => ({
            cle: d.code,
            x: d.etiquette!.x,
            y: d.etiquette!.y,
            texte: d.nom,
            // A egalite de place, un departement en vaut un autre : l'ordre
            // alphabetique de la cle departage, et il ne bouge pas d'un rendu
            // a l'autre.
            poids: 0,
            valeur: d,
          })),
          {
            largeurParCaractere: largeurCaractere,
            hauteur: hauteurTexte,
            deja: prises,
          },
        )
      : [];
    departementsPlaces.forEach((e) => prises.push(e.boite));

    const villesPlacees = montrerVilles
      ? placerLesEtiquettes(
          pastillesProjetees.map(({ pastille, x, y, r }) => ({
            cle: pastille.cle,
            x,
            // Sous la pastille, pas dessus : le nom ne doit pas cacher la
            // couleur, qui est l'information principale.
            y: y + r * echelle + 2 * echelle,
            texte: pastille.ville,
            poids: pastille.nombre,
            valeur: pastille,
          })),
          {
            largeurParCaractere: largeurCaractere,
            hauteur: hauteurTexte,
            deja: prises,
          },
        )
      : [];
    villesPlacees.forEach((e) => prises.push(e.boite));

    return {
      departements: departementsPlaces,
      villes: villesPlacees,
      hauteurTexte,
    };
  }, [montrerDepartements, montrerVilles, pastillesProjetees, echelle]);

  /*
   * Les affaires eclatees en couronne autour de leur ville, au dernier seuil.
   *
   * Le rayon de la couronne grandit avec le nombre pour que deux voisines ne
   * se touchent pas : a douze affaires, un cercle fixe les collerait.
   */
  const affairesEclatees = useMemo(() => {
    if (!montrerOpportunites) return [];
    return pastillesProjetees.flatMap(({ pastille, x, y, r }) => {
      const nombre = pastille.affaires.length;
      const rayonCouronne = (r + 9 + nombre * 1.6) * echelle;
      const positions = couronne(nombre, rayonCouronne);
      return pastille.affaires.map((affaire, index) => ({
        affaire,
        ville: pastille.ville,
        x: x + positions[index].dx,
        y: y + positions[index].dy,
      }));
    });
  }, [montrerOpportunites, pastillesProjetees, echelle]);

  return (
    <div className="relative w-full">
      <svg
        ref={svgRef}
        viewBox={`${cadrage.x} ${cadrage.y} ${cadrage.largeur} ${cadrage.hauteur}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-[min(70vh,700px)] touch-none select-none rounded-lg border bg-card cursor-grab active:cursor-grabbing"
        role="img"
        aria-label={`Carte de France — ${pastilles.length} villes`}
        onWheel={molette}
        onPointerDown={appui}
        onPointerMove={deplacement}
        onPointerUp={relachement}
        onPointerCancel={relachement}
        onClick={() => {
          if (!aGlisse.current) onSelectionner(null);
        }}
      >
        <g>
          {CHEMINS.map((departement) => (
            <path
              key={departement.code}
              d={departement.d}
              className="fill-muted/40 stroke-border"
              strokeWidth={0.6 * echelle}
              /* `vectorEffect` ne convient pas : il fige l'épaisseur en pixels
                 ÉCRAN, donc le trait s'affine quand la carte est petite. On la
                 lie au zoom, pas au conteneur. */
            />
          ))}
        </g>

        {/*
          Les noms des departements SOUS les pastilles : ils situent, ils ne
          designent pas. Un nom de departement par-dessus une pastille cacherait
          ce qu'on vient regarder.
        */}
        <g aria-hidden className="pointer-events-none">
          {etiquettes.departements.map((etiquette) => (
            <text
              key={etiquette.cle}
              x={etiquette.x}
              y={etiquette.y}
              textAnchor="middle"
              fontSize={11 * echelle}
              className="fill-muted-foreground"
            >
              {etiquette.texte}
            </text>
          ))}
        </g>

        <g>
          {pastillesProjetees.map(({ pastille, x, y, r }) => {
            const rayonAffiche = r * echelle;
            const estSelectionnee = selection === pastille.cle;
            const segments = arcs(pastille.parEtape, pastille.nombre);
            // `stroke-dasharray` compte en longueur d'arc : on travaille donc
            // sur la circonférence d'un cercle de rayon moitié, que le trait
            // épaissit jusqu'au bord. Un disque plein, dessiné en un seul
            // trait, sans un seul calcul d'arc.
            const rayonTrait = rayonAffiche / 2;
            const circonference = 2 * Math.PI * rayonTrait;

            return (
              <g
                key={pastille.cle}
                onClick={(evenement) => {
                  evenement.stopPropagation();
                  if (!aGlisse.current) onSelectionner(pastille.cle);
                }}
                className="cursor-pointer"
              >
                <title>
                  {`${pastille.ville} — ${pastille.nombre} opportunité${
                    pastille.nombre > 1 ? "s" : ""
                  }`}
                </title>
                {segments.map(({ stage, part, depart }) => (
                  <circle
                    key={stage}
                    cx={x}
                    cy={y}
                    r={rayonTrait}
                    fill="none"
                    stroke={STAGE_COLORS[stage] ?? "var(--muted-foreground)"}
                    strokeWidth={rayonAffiche}
                    strokeDasharray={`${part * circonference} ${circonference}`}
                    strokeDashoffset={-depart * circonference}
                    opacity={0.85}
                  />
                ))}
                <circle
                  cx={x}
                  cy={y}
                  r={rayonAffiche}
                  fill="none"
                  className={
                    estSelectionnee ? "stroke-foreground" : "stroke-card"
                  }
                  strokeWidth={(estSelectionnee ? 2.2 : 0.8) * echelle}
                />
              </g>
            );
          })}
        </g>

        <g aria-hidden className="pointer-events-none">
          {etiquettes.villes.map((etiquette) => (
            <text
              key={etiquette.cle}
              x={etiquette.x}
              y={etiquette.y + etiquettes.hauteurTexte * 0.8}
              textAnchor="middle"
              fontSize={11 * echelle}
              className="fill-foreground"
              style={{
                /* Un liseré de la couleur du fond : le nom reste lisible
                   quand il tombe sur une frontière ou une autre pastille,
                   sans qu'on ait à poser un rectangle derrière chaque mot. */
                paintOrder: "stroke",
                stroke: "var(--card)",
                strokeWidth: 3 * echelle,
                strokeLinejoin: "round",
              }}
            >
              {etiquette.texte}
            </text>
          ))}
        </g>

        {/*
          Les opportunités, une par marque, nommées et CLIQUABLES — la demande
          de Simon du 18/10/2026. Au-dessus de tout le reste : c'est ce qu'on
          est venu chercher à ce niveau de zoom.
        */}
        <g>
          {affairesEclatees.map(({ affaire, x, y }) => (
            <g
              key={affaire.id}
              className="cursor-pointer"
              onClick={(evenement) => {
                evenement.stopPropagation();
                if (!aGlisse.current) onOuvrirAffaire(affaire.id);
              }}
            >
              <title>
                {affaire.company_name
                  ? `${affaire.name} — ${affaire.company_name}`
                  : affaire.name}
              </title>
              <circle
                cx={x}
                cy={y}
                r={4 * echelle}
                fill={STAGE_COLORS[affaire.stage] ?? "var(--muted-foreground)"}
                className="stroke-card"
                strokeWidth={1.2 * echelle}
              />
              <text
                x={x}
                y={y - 6 * echelle}
                textAnchor="middle"
                fontSize={10 * echelle}
                className="fill-foreground"
                style={{
                  paintOrder: "stroke",
                  stroke: "var(--card)",
                  strokeWidth: 3 * echelle,
                  strokeLinejoin: "round",
                }}
              >
                {tronquer(affaire.name, 28)}
              </text>
            </g>
          ))}
        </g>
      </svg>

      <div className="absolute top-2 right-2 flex flex-col gap-1">
        <BoutonCarte onClick={() => zoomBouton(1.6)} label="Zoomer">
          +
        </BoutonCarte>
        <BoutonCarte onClick={() => zoomBouton(1 / 1.6)} label="Dézoomer">
          −
        </BoutonCarte>
        <BoutonCarte onClick={recentrer} label="Revoir toute la France">
          ⤢
        </BoutonCarte>
      </div>
    </div>
  );
};

const BoutonCarte = ({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={label}
    className="w-8 h-8 rounded-md border bg-card/90 backdrop-blur text-sm font-medium hover:bg-muted transition-colors"
  >
    {children}
  </button>
);

export { HAUTEUR, LARGEUR };
