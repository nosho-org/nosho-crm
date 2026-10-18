import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ReactNode,
  PointerEvent as ReactPointerEvent,
  WheelEvent,
} from "react";

import { STAGE_COLORS } from "../dashboard/stageColors";
import departements from "./departements.json";
import { arcs, rayon, type AffairePlacee, type Pastille } from "./agregation";
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
import { reperesVisibles } from "./reperes";
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

/**
 * Le rayon sur lequel les affaires d'une ville se répartissent, en unités du
 * dessin — environ 1,5 km.
 *
 * Mille unités couvrent les quinze degrés de longitude de l'emprise, soit à
 * peu près 1 160 km à la latitude de la France : une unité vaut donc 1,16 km.
 * Le chiffre est choisi pour que l'amas tienne à l'écran au grossissement
 * maximal tout en restant discret à l'échelle du pays.
 */
const RAYON_DISPERSION = 1.3;

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
  rendreInfobulle,
}: {
  pastilles: Pastille[];
  maximum: number;
  selection: string | null;
  onSelectionner: (cle: string | null) => void;
  /*
   * Le contenu de l'infobulle est rendu par la PAGE, pas par la carte : il
   * demande les libellés d'étape, les noms des commerciaux et la devise, que
   * la carte n'a aucune raison de connaître. Elle sait où poser la bulle ; la
   * page sait quoi mettre dedans.
   */
  rendreInfobulle: (contenu: {
    ville: string;
    affaires: AffairePlacee[];
  }) => ReactNode;
}) => {
  const [cadrage, setCadrage] = useState<Cadrage>(CADRAGE_ENTIER);
  /*
   * Simon, le 18/10/2026 : « les opportunités sont toujours pas cliquables, je
   * veux qu'on puisse cliquer dessus et qu'on ait une infobulle avec les
   * informations clés, et que si on clique ensuite dessus ça renvoie vers la
   * page de l'opportunité. »
   *
   * Il avait raison, et la cause est un seuil : les marques d'opportunité
   * n'apparaissaient qu'à partir d'un grossissement de 9, c'est-à-dire presque
   * jamais. L'infobulle s'ouvre désormais sur la PASTILLE, donc à n'importe
   * quel zoom, et les marques éclatées l'ouvrent aussi au lieu de filer droit
   * sur la fiche. Un clic pour voir, un clic pour y aller.
   */
  const [infobulle, setInfobulle] = useState<{
    ville: string;
    affaires: AffairePlacee[];
    x: number;
    y: number;
  } | null>(null);
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

  /**
   * Un point du dessin → sa position en pixels dans le conteneur.
   *
   * Exactement l'inverse de `pointDuPointeur`, bandes vides comprises : c'est
   * ce qui permet à l'infobulle de rester COLLÉE à sa ville pendant qu'on
   * zoome, au lieu de flotter là où le doigt était au moment du clic.
   */
  const positionEcran = useCallback(
    (x: number, y: number) => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      const rapportDessin = cadrage.largeur / cadrage.hauteur;
      const rapportBoite = rect.width / rect.height;
      const largeurUtile =
        rapportBoite > rapportDessin ? rect.height * rapportDessin : rect.width;
      const hauteurUtile =
        rapportBoite > rapportDessin ? rect.height : rect.width / rapportDessin;
      const margeX = (rect.width - largeurUtile) / 2;
      const margeY = (rect.height - hauteurUtile) / 2;
      return {
        gauche: margeX + ((x - cadrage.x) / cadrage.largeur) * largeurUtile,
        haut: margeY + ((y - cadrage.y) / cadrage.hauteur) * hauteurUtile,
        largeurConteneur: rect.width,
      };
    },
    [cadrage],
  );

  /* Échap ferme la bulle : une surcouche qu'on ne sait pas fermer est un piège. */
  useEffect(() => {
    if (!infobulle) return;
    const auClavier = (evenement: KeyboardEvent) => {
      if (evenement.key === "Escape") setInfobulle(null);
    };
    window.addEventListener("keydown", auClavier);
    return () => window.removeEventListener("keydown", auClavier);
  }, [infobulle]);

  const molette = (evenement: WheelEvent<SVGSVGElement>) => {
    const ancre = pointDuPointeur(evenement);
    if (!ancre) return;
    // Vers le haut (deltaY négatif) = on se rapproche.
    const facteur = Math.exp(-evenement.deltaY * 0.0015);
    setCadrage((courant) => zoomer(courant, facteur, ancre.x, ancre.y));
  };

  /**
   * ⚠️ On ne capture PAS le pointeur ici, et c'est tout sauf un détail.
   *
   * `setPointerCapture` dès l'appui retargette les événements suivants vers
   * l'élément capturant : le `pointerup` et donc le `click` arrivent sur le
   * SVG au lieu de la pastille. Mesuré le 18/10/2026 sur un vrai clic :
   * `pointerdown:circle`, puis `pointerup:svg`, `click:svg`. Résultat, le
   * gestionnaire de la pastille ne se déclenchait jamais, et celui du fond
   * effaçait la sélection dans la foulée — « c'est toujours pas cliquable ».
   *
   * La capture ne sert qu'à poursuivre un GLISSEMENT quand le doigt sort du
   * dessin. On la prend donc au premier mouvement réel, dans `deplacement`,
   * et jamais pour un simple clic.
   *
   * (Mes tests précédents simulaient le clic avec `dispatchEvent` sur le
   * cercle, ce qui court-circuite exactement la partie cassée. Un vrai clic
   * aurait montré le bug tout de suite.)
   */
  const appui = (evenement: ReactPointerEvent<SVGSVGElement>) => {
    glissement.current = { x: evenement.clientX, y: evenement.clientY };
    aGlisse.current = false;
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
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      // Le mouvement est franc : c'est un glissement, on peut capturer sans
      // sacrifier le clic.
      if (!aGlisse.current) {
        aGlisse.current = true;
        evenement.currentTarget.setPointerCapture(evenement.pointerId);
      }
    }
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
    // Relâcher une capture qu'on n'a pas prise lève une exception.
    if (evenement.currentTarget.hasPointerCapture(evenement.pointerId)) {
      evenement.currentTarget.releasePointerCapture(evenement.pointerId);
    }
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

    /*
     * Les villes reperes en DERNIER : elles ne prennent que la place dont nos
     * prospects n'ont pas voulu. Voir `reperes.ts` pour les trois regles qui
     * les tiennent a leur rang.
     */
    const reperesPlaces = placerLesEtiquettes(
      reperesVisibles(
        cadrage,
        new Set(pastillesProjetees.map(({ pastille }) => pastille.cle)),
      ).map((repere) => ({
        cle: repere.cle,
        x: repere.x,
        y: repere.y + 2.5 * echelle,
        texte: repere.nom,
        poids: repere.population,
        valeur: repere,
      })),
      {
        largeurParCaractere: largeurCaractere * 0.9,
        hauteur: hauteurTexte,
        deja: prises,
      },
    );

    return {
      departements: departementsPlaces,
      villes: villesPlacees,
      reperes: reperesPlaces,
      hauteurTexte,
    };
  }, [
    montrerDepartements,
    montrerVilles,
    pastillesProjetees,
    cadrage,
    echelle,
  ]);

  /*
   * Les affaires éclatées autour de leur ville.
   *
   * Simon, le 18/10/2026 : « dans les villes où il y a plein d'opportunités,
   * faudrait aller au niveau du quartier et de la rue au niveau du zoom ».
   *
   * La dispersion est désormais GÉOGRAPHIQUE et non plus à taille d'écran
   * constante : `RAYON_DISPERSION` vaut 1,3 unité de dessin, soit environ
   * 1,5 km. Elle ne bouge donc pas quand on zoome, ce qui veut dire qu'à
   * l'écran les affaires s'ÉCARTENT — un amas illisible à l'échelle du
   * département devient, à fond de zoom, une poignée de points qu'on vise
   * sans effort. C'est exactement ce qui manquait : avant, le rayon était
   * multiplié par `echelle`, donc zoomer ne séparait jamais rien.
   *
   * Le plancher garde les marques hors de la pastille aux zooms faibles, où
   * la dispersion géographique serait plus petite que le disque lui-même.
   *
   * ⚠️ Ces positions restent INVENTÉES : la base ne porte que le code postal.
   * Une couronne régulière le dit — un nuage de points dispersés au hasard
   * ressemblerait à de vraies adresses, ce qui serait un mensonge.
   */
  const affairesEclatees = useMemo(() => {
    if (!montrerOpportunites) return [];
    return pastillesProjetees.flatMap(({ pastille, x, y, r }) => {
      const nombre = pastille.affaires.length;
      const rayonCouronne = Math.max(RAYON_DISPERSION, (r + 9) * echelle);
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
          if (aGlisse.current) return;
          onSelectionner(null);
          setInfobulle(null);
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

        {/*
          Les villes reperes : un point gris et un nom, sous nos pastilles.
          Elles disent ou l'on est, elles ne disent rien de commercial — d'ou
          le gris, la petite taille, et le fait qu'elles cedent la place.
        */}
        <g aria-hidden className="pointer-events-none">
          {etiquettes.reperes.map((etiquette) => (
            <g key={etiquette.cle}>
              <circle
                cx={etiquette.valeur.x}
                cy={etiquette.valeur.y}
                r={1.5 * echelle}
                className="fill-muted-foreground"
                opacity={0.65}
              />
              <text
                x={etiquette.x}
                y={etiquette.y + etiquettes.hauteurTexte * 0.75}
                textAnchor="middle"
                fontSize={9.5 * echelle}
                className="fill-muted-foreground"
                style={{
                  paintOrder: "stroke",
                  stroke: "var(--card)",
                  strokeWidth: 2.5 * echelle,
                  strokeLinejoin: "round",
                }}
              >
                {etiquette.texte}
              </text>
            </g>
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
                  if (aGlisse.current) return;
                  onSelectionner(pastille.cle);
                  setInfobulle({
                    ville: pastille.ville,
                    affaires: pastille.affaires,
                    x,
                    y,
                  });
                }}
                className="cursor-pointer"
              >
                <title>
                  {`${pastille.ville} — ${pastille.nombre} opportunité${
                    pastille.nombre > 1 ? "s" : ""
                  }${
                    pastille.deduites > 0
                      ? ` (dont ${pastille.deduites} d'après l'intitulé)`
                      : ""
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
                {/*
                  Un cercle POINTILLÉ quand la ville tient au moins une affaire
                  placée d'après son intitulé. Le pointillé dit « supposé » sans
                  qu'on ait à l'écrire : c'est la convention de tous les tracés
                  incertains, et elle se lit sans légende.
                */}
                {pastille.deduites > 0 && (
                  <circle
                    cx={x}
                    cy={y}
                    r={rayonAffiche + 2.5 * echelle}
                    fill="none"
                    className="stroke-muted-foreground"
                    strokeWidth={0.9 * echelle}
                    strokeDasharray={`${2.5 * echelle} ${2 * echelle}`}
                  />
                )}
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
          {affairesEclatees.map(({ affaire, ville, x, y }) => (
            <g
              key={affaire.id}
              className="cursor-pointer"
              onClick={(evenement) => {
                evenement.stopPropagation();
                if (aGlisse.current) return;
                // Une marque éclatée désigne UNE affaire : la bulle ne montre
                // qu'elle, et le clic suivant mène à sa fiche.
                setInfobulle({ ville, affaires: [affaire], x, y });
              }}
            >
              <title>
                {affaire.company_name
                  ? `${affaire.name} — ${affaire.company_name}`
                  : affaire.name}
              </title>
              {/* Creuse quand le point vient de l'intitulé, pleine sinon. */}
              <circle
                cx={x}
                cy={y}
                r={4 * echelle}
                fill={
                  affaire.deduite
                    ? "var(--card)"
                    : (STAGE_COLORS[affaire.stage] ?? "var(--muted-foreground)")
                }
                stroke={
                  STAGE_COLORS[affaire.stage] ?? "var(--muted-foreground)"
                }
                strokeWidth={(affaire.deduite ? 1.6 : 1.2) * echelle}
                strokeDasharray={
                  affaire.deduite
                    ? `${2 * echelle} ${1.5 * echelle}`
                    : undefined
                }
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

      {infobulle &&
        (() => {
          const position = positionEcran(infobulle.x, infobulle.y);
          if (!position) return null;
          const LARGEUR_BULLE = 272;
          /*
           * Collée au bord, la bulle sortirait du cadre et se couperait. On
           * la ramène dans le conteneur plutôt que de la laisser déborder :
           * une info qu'on ne peut pas lire ne vaut pas mieux qu'une absente.
           */
          const gauche = Math.min(
            Math.max(position.gauche, LARGEUR_BULLE / 2 + 8),
            position.largeurConteneur - LARGEUR_BULLE / 2 - 8,
          );
          // Trop haut, la bulle sortirait par le dessus : elle passe dessous.
          const dessous = position.haut < 200;
          return (
            <div
              role="dialog"
              aria-label={`Opportunités de ${infobulle.ville}`}
              className="absolute z-20 rounded-lg border bg-popover shadow-lg p-3 text-popover-foreground"
              style={{
                left: gauche,
                top: position.haut + (dessous ? 14 : -14),
                width: LARGEUR_BULLE,
                transform: `translate(-50%, ${dessous ? "0" : "-100%"})`,
              }}
              onClick={(evenement) => evenement.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <p className="font-semibold text-sm leading-tight">
                  {infobulle.ville}
                </p>
                <button
                  type="button"
                  onClick={() => setInfobulle(null)}
                  aria-label="Fermer"
                  className="text-muted-foreground hover:text-foreground leading-none text-base -mt-0.5"
                >
                  ×
                </button>
              </div>
              {rendreInfobulle({
                ville: infobulle.ville,
                affaires: infobulle.affaires,
              })}
            </div>
          );
        })()}

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
