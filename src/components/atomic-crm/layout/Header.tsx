import {
  History,
  Import,
  Plus,
  Plug,
  Settings,
  User,
  Users,
  Contact,
  Building2,
  TrendingUp,
  LayoutGrid,
} from "lucide-react";
import { CanAccess, useCanAccess, useGetIdentity, useUserMenu } from "ra-core";
import { useState } from "react";
import { Link, matchPath, useLocation, useNavigate } from "react-router";
import { RefreshButton } from "@/components/admin/refresh-button";
import { ThemeModeToggle } from "@/components/admin/theme-mode-toggle";
import { UserMenu } from "@/components/admin/user-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  useConfigurationContext,
  type CustomView,
} from "../root/ConfigurationContext";
import { ImportPage } from "../misc/ImportPage";
import { CreateViewDialog } from "../deals/CreateViewDialog";
import { APP_VERSION } from "../../../version";
import { NotificationBell } from "../notifications/NotificationBell";
import { GlobalSearchButton } from "./GlobalSearchButton";
import { ChangelogModal } from "./ChangelogModal";

const Header = () => {
  const { darkModeLogo, lightModeLogo, title, customViews } =
    useConfigurationContext();
  const location = useLocation();
  const [createViewOpen, setCreateViewOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const { identity } = useGetIdentity();
  const { canAccess: isAdmin } = useCanAccess({
    resource: "configuration",
    action: "edit",
  });

  // Filter views: admins see all, regular users see views where allowedUserIds is empty or includes them
  const currentSaleId = identity?.id as number | undefined;
  const visibleViews = customViews.filter(
    (view) =>
      isAdmin ||
      !view.allowedUserIds?.length ||
      (currentSaleId != null && view.allowedUserIds.includes(currentSaleId)),
  );

  let currentPath: string | boolean = "/";
  if (matchPath("/", location.pathname)) {
    currentPath = "/";
  } else if (matchPath("/contacts/*", location.pathname)) {
    currentPath = "/contacts";
  } else if (matchPath("/companies/*", location.pathname)) {
    currentPath = "/companies";
  } else if (matchPath("/deals/*", location.pathname)) {
    currentPath = "/deals";
  } else if (matchPath("/views/:viewId/*", location.pathname)) {
    const match = matchPath("/views/:viewId/*", location.pathname);
    currentPath = `/views/${match?.params.viewId}`;
  } else {
    currentPath = false;
  }

  return (
    <>
      <CreateViewDialog
        open={createViewOpen}
        onClose={() => setCreateViewOpen(false)}
      />
      <ChangelogModal
        open={changelogOpen}
        onClose={() => setChangelogOpen(false)}
      />
      <nav className="sticky top-0 z-50 grow">
        <header className="bg-header shadow-sm">
          <div className="px-4">
            <div className="flex justify-between items-center flex-1">
              <div className="flex items-center gap-2">
                <Link
                  to="/"
                  className="flex items-center gap-2 text-header-foreground no-underline"
                >
                  <img
                    className="[.light_&]:hidden h-6"
                    src={darkModeLogo}
                    alt="Nosho"
                  />
                  <img
                    className="[.dark_&]:hidden h-6"
                    src={lightModeLogo}
                    alt="Nosho"
                  />
                  {/*
                    « CRM » et non « Nosho CRM » (NOS-1178).

                    Le logo porte déjà le mot « nosho » : l'écrire à côté le
                    disait deux fois. Le titre reste configurable — c'est sa
                    valeur en base qui a changé, pas ce composant.

                    L'`alt` des deux images, lui, ne suit plus le titre : un
                    logo dont le texte alternatif serait « CRM » ne dirait pas
                    de quelle marque il s'agit, ce qui est précisément ce
                    qu'attend un lecteur d'écran.
                  */}
                  <h1 className="text-xl font-semibold">{title}</h1>
                </Link>
                {/* Le numéro de version est descendu dans le menu profil
                    (NOS-1178) : il occupait la place la plus lisible de
                    l'application pour une information consultée quelques fois
                    par mois, quand on remonte un bug. */}
              </div>
              <div>
                <nav className="flex items-center">
                  {/*
                    Ordre voulu par Simon (NOS-1089) : tableau de bord, puis
                    opportunités, sociétés, contacts.

                    Ce n'est pas de l'esthétique — l'ordre descend du général au
                    particulier, et met l'écran de travail quotidien en deuxième
                    position plutôt qu'en quatrième.
                  */}
                  <NavigationTab
                    label="Tableau de bord"
                    to="/"
                    isActive={currentPath === "/"}
                  />
                  <NavigationTab
                    label="Opportunités"
                    to="/deals"
                    isActive={currentPath === "/deals"}
                  />
                  <NavigationTab
                    label="Sociétés"
                    to="/companies"
                    isActive={currentPath === "/companies"}
                  />
                  <NavigationTab
                    label="Contacts"
                    to="/contacts"
                    isActive={currentPath === "/contacts"}
                  />
                  {visibleViews.map((view) => (
                    <NavigationTab
                      key={view.id}
                      label={view.label}
                      to={`/views/${view.id}`}
                      isActive={currentPath === `/views/${view.id}`}
                    />
                  ))}
                  <QuickCreateMenu
                    visibleViews={visibleViews}
                    isAdmin={isAdmin}
                    onCreateView={() => setCreateViewOpen(true)}
                  />
                </nav>
              </div>
              <div className="flex items-center">
                {/* La recherche en tête de la zone droite : elle
                    s'utilise plus souvent que tout ce qui suit, et se lit
                    de gauche à droite avant les icônes (NOS-1226). */}
                <GlobalSearchButton />
                {/* La cloche avant les réglages : c'est ce qu'on vient
                    consulter, pas ce qu'on vient régler (NOS-1178). */}
                <NotificationBell />
                <ThemeModeToggle />
                <RefreshButton />
                <UserMenu>
                  <ProfileMenu />
                  <CanAccess resource="sales" action="list">
                    <UsersMenu />
                  </CanAccess>
                  <ConnectorsMenu />
                  <CanAccess resource="configuration" action="edit">
                    <SettingsMenu />
                  </CanAccess>
                  <ImportFromJsonMenuItem />
                  <VersionMenuItem onOpen={() => setChangelogOpen(true)} />
                </UserMenu>
              </div>
            </div>
          </div>
        </header>
      </nav>
    </>
  );
};

const startsWithVowel = (s: string) => /^[aeiouéèêàâùûîôäëïöü]/i.test(s);

const getViewCreateLabel = (view: CustomView) => {
  const name = view.label.toLowerCase();
  return startsWithVowel(name) ? `Nouvel ${name}` : `Nouveau ${name}`;
};

const QuickCreateMenu = ({
  visibleViews,
  isAdmin,
  onCreateView,
}: {
  visibleViews: CustomView[];
  isAdmin: boolean;
  onCreateView: () => void;
}) => {
  const navigate = useNavigate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          title="Créer..."
          className="flex items-center justify-center w-7 h-7 ml-1 rounded-full text-header-foreground/50 hover:text-header-foreground hover:bg-header-foreground/10 transition-all"
        >
          <Plus className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={() => navigate("/contacts/create")}>
          <Contact className="h-4 w-4 mr-2" />
          Nouveau contact
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate("/companies/create")}>
          <Building2 className="h-4 w-4 mr-2" />
          Nouvelle société
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate("/deals/create")}>
          <TrendingUp className="h-4 w-4 mr-2" />
          Nouvelle opportunité
        </DropdownMenuItem>
        {visibleViews.length > 0 && (
          <>
            <DropdownMenuSeparator />
            {visibleViews.map((view) => (
              <DropdownMenuItem
                key={view.id}
                onClick={() => navigate(`/views/${view.id}/create`)}
              >
                <LayoutGrid className="h-4 w-4 mr-2" />
                {getViewCreateLabel(view)}
              </DropdownMenuItem>
            ))}
          </>
        )}
        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onCreateView}>
              <Plus className="h-4 w-4 mr-2" />
              Nouvelle vue
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const NavigationTab = ({
  label,
  to,
  isActive,
}: {
  label: string;
  to: string;
  isActive: boolean;
}) => (
  /*
   * L'onglet survolé grossit et s'épaissit (NOS-1180, demandé par Simon).
   *
   * `inline-block` est indispensable : `transform` n'a aucun effet sur un
   * élément `inline`, et un `<a>` l'est par défaut. C'est le genre de détail
   * qui fait conclure que « l'effet ne marche pas ».
   *
   * L'agrandissement porte sur l'échelle et non sur la taille de police : une
   * police qui change de taille repousse ses voisins, et toute la barre de
   * navigation danserait au passage de la souris. `scale` ne déplace rien.
   *
   * `motion-safe:` — le grossissement est une animation, donc soumis au
   * réglage système comme le reste (voir `ui/motion/`). Le passage en gras,
   * lui, reste : ce n'est pas du mouvement.
   */
  <Link
    to={to}
    className={`inline-block px-6 py-3.5 text-sm font-medium origin-bottom transition-all duration-200 border-b-[2.5px] hover:font-semibold motion-safe:hover:scale-110 ${
      isActive
        ? "text-header-foreground border-[var(--nosho-orange)]"
        : "text-header-foreground/60 border-transparent hover:text-header-foreground hover:border-header-foreground/30"
    }`}
  >
    {label}
  </Link>
);

const UsersMenu = () => {
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<UsersMenu> must be used inside <UserMenu?");
  }
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to="/sales" className="flex items-center gap-2">
        <Users /> Utilisateurs
      </Link>
    </DropdownMenuItem>
  );
};

const ProfileMenu = () => {
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<ProfileMenu> must be used inside <UserMenu?");
  }
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to="/profile" className="flex items-center gap-2">
        <User />
        Profil
      </Link>
    </DropdownMenuItem>
  );
};

/**
 * Le numéro de version, dans le menu profil (NOS-1178).
 *
 * L'audit du 29 août : « Le numéro de version v1.9.163 occupe par ailleurs la
 * place la plus lisible de l'application. » Il était collé au nom du produit,
 * là où l'œil se pose en arrivant — pour une information qu'on consulte
 * lorsqu'on remonte un bug, soit quelques fois par mois.
 *
 * Il garde son rôle : cliquer ouvre le journal des changements. C'est le
 * placement qui change, pas la fonction.
 */
const VersionMenuItem = ({ onOpen }: { onOpen: () => void }) => {
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<VersionMenuItem> must be used inside <UserMenu>");
  }
  return (
    <DropdownMenuItem
      onClick={() => {
        userMenuContext.onClose();
        onOpen();
      }}
      className="flex items-center gap-2 text-muted-foreground"
    >
      <History />
      <span className="font-mono text-xs">{APP_VERSION}</span>
      <span className="ml-auto text-xs">Nouveautés</span>
    </DropdownMenuItem>
  );
};

const ConnectorsMenu = () => {
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<ConnectorsMenu> must be used inside <UserMenu>");
  }
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to="/connectors" className="flex items-center gap-2">
        <Plug /> Connecteurs
      </Link>
    </DropdownMenuItem>
  );
};

const SettingsMenu = () => {
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<SettingsMenu> must be used inside <UserMenu>");
  }
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to="/settings" className="flex items-center gap-2">
        <Settings /> Paramètres
      </Link>
    </DropdownMenuItem>
  );
};

const ImportFromJsonMenuItem = () => {
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<ImportFromJsonMenuItem> must be used inside <UserMenu>");
  }
  return (
    <DropdownMenuItem asChild onClick={userMenuContext.onClose}>
      <Link to={ImportPage.path} className="flex items-center gap-2">
        <Import /> Importer
      </Link>
    </DropdownMenuItem>
  );
};
export default Header;
