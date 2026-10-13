import { assetUrl } from "@openfront/shared/AssetUrls";
import { EventBus } from "@openfront/shared/EventBus";
import { WireGameStartInfo } from "@openfront/shared/WireSchemas";
import { renderNavVersion } from "src/client/GameVersion";
import type { JoinLobbyResult } from "./ClientGameRunner";
import { crazyGamesSDK } from "./CrazyGamesSDK";
import { loadGameClient, prefetchGameClient } from "./GameClientLoader";
import "./GameModeSelector";
import { GameModeSelector } from "./GameModeSelector";
import { GameStartingModal } from "./GameStartingModal";
import type { HelpModal } from "./HelpModal";
import { showInGameConfirm } from "./InGameModal";
import "./LangSelector";
import { LangSelector } from "./LangSelector";
import { initLayout } from "./Layout";
import { loadModal, prefetchModals, whenModalLoaded } from "./LazyModals";
import { modalRouter } from "./ModalRouter";
import { initNavigation } from "./Navigation";
import { genAnonUsername } from "./PlayerName";
import type { SinglePlayerModal } from "./SinglePlayerModal";
import { UserSettings } from "./UserSettings";
import "./UsernameInput";
import { UsernameInput } from "./UsernameInput";
import { homeHref, incrementGamesPlayed, translateText } from "./Utils";
import "./components/DesktopNavBar";
import "./components/Footer";
import "./components/MainLayout";
import "./components/MobileNavBar";
import "./components/PlayPage";
import "./components/baseComponents/Button";
import "./components/baseComponents/Modal";
import "./styles.css";
import "./styles/core/typography.css";
import "./styles/core/variables.css";
import "./styles/layout/container.css";
import "./styles/layout/header.css";
import {
  installCtrlWheelZoomBlocker,
  installDoubleTapZoomBlocker,
  installSafariPinchZoomBlocker,
} from "./utilities/DisableSafariPinchZoom";

declare global {
  interface Window {
    currentPageId?: string;
    showPage?: (pageId: string) => void;
  }

  // Extend the global interfaces to include your custom events
  interface DocumentEventMap {
    "join-lobby": CustomEvent<JoinLobbyEvent>;
    "game-starting": CustomEvent;
  }
}

export interface JoinLobbyEvent {
  gameID: string;
  // The configuration and players of the game to start.
  gameStartInfo: WireGameStartInfo;
}

/**
 * The single point where "a game is running" is published: the `.in-game` body
 * class, which the client's own markup keys off to hide the footer and the nav
 * bars.
 */
function setInGameSignal(inGame: boolean): void {
  document.body.classList.toggle("in-game", inGame);
}

class Client {
  private gameHandle: JoinLobbyResult | null = null;
  private eventBus: EventBus = new EventBus();

  private currentUrl: string | null = null;

  private usernameInput: UsernameInput | null = null;

  private gameModeSelector: GameModeSelector;
  private userSettings: UserSettings = new UserSettings();
  private mostRecentJoinEvent: number;

  /**
   * Whether the home page is currently torn down for a game.
   *
   * For listeners that may not exist when "game-starting" fires: the event
   * carries no history, so anything registered later cannot tell "no game
   * yet" from "a game started while I was loading". The menu audio chunk is
   * exactly that case.
   */
  private menuTornDown = false;

  async initialize(): Promise<void> {
    // One mixer for the page: the menu theme here and the SoundManager a game
    // creates later both route through it, so the volume sliders reach both.
    // It and howler are their own chunk, so the page doesn't wait on them. A
    // game that got there first has made the mixer already, and the menu
    // theme has no business starting under it.
    //
    // gameInProgress covers the other order, where this chunk lands while a
    // game is up but before the game client has built a mixer. startMenuMusic
    // only disarms on the "game-starting" it can hear, so arming it in that
    // window would leave it live under a running game, free to start the
    // theme over the gameplay track on the next click or music-volume change.
    //
    // The mixer check stays a skip rather than the same treatment:
    // initAudioMixer disposes whatever is there, so calling it once a game
    // has one would pull the mixer out from under that game.
    Promise.all([
      import("./sound/AudioMixer"),
      import("./sound/MenuMusic"),
    ]).then(
      ([{ audioMixer, initAudioMixer }, { startMenuMusic }]) => {
        if (audioMixer() === null) {
          startMenuMusic(initAudioMixer(this.userSettings), {
            gameInProgress: this.menuTornDown,
          });
        }
      },
      (err) => console.error("Menu audio failed to load:", err),
    );

    crazyGamesSDK.maybeInit();

    // Register modals with the URL router.
    modalRouter.register("settings", {
      tag: "user-setting",
      pageId: "page-settings",
    });
    modalRouter.register("help", { tag: "help-modal", pageId: "page-help" });
    modalRouter.register("news", { tag: "news-modal", pageId: "page-news" });
    modalRouter.register("language", {
      tag: "language-modal",
      pageId: "page-language",
    });
    modalRouter.register("single-player", {
      tag: "single-player-modal",
      pageId: "page-single-player",
    });
    modalRouter.register("troubleshooting", {
      tag: "troubleshooting-modal",
      pageId: "page-troubleshooting",
    });

    // Wait for components to render before setting version
    await customElements.whenDefined("mobile-nav-bar");
    await customElements.whenDefined("desktop-nav-bar");

    const openFrontFont = new FontFace(
      "OpenFront",
      `url(${assetUrl("fonts/OpenFront.ttf")})`,
    );
    document.fonts.add(openFrontFont);
    openFrontFont.load().catch(() => {});

    if (renderNavVersion() === 0) {
      console.warn("Game version element not found");
    }

    const langSelector = document.querySelector(
      "lang-selector",
    ) as LangSelector;
    if (!langSelector) {
      console.warn("Lang selector element not found");
    }

    this.usernameInput = document.querySelector(
      "username-input",
    ) as UsernameInput;
    if (!this.usernameInput) {
      console.warn("Username input element not found");
    }

    this.gameModeSelector = document.querySelector(
      "game-mode-selector",
    ) as GameModeSelector;

    window.addEventListener("beforeunload", async () => {
      if (this.gameHandle !== null) {
        // Leaving a game by navigating away tears the page down without
        // running any menu code, so stop the game explicitly.
        setInGameSignal(false);
        this.gameHandle.stop(true);
        await crazyGamesSDK.gameplayStop();
      }
    });

    document.addEventListener("join-lobby", (event) => {
      void this.handleJoinLobby(event);
    });

    const hlpModal = document.querySelector("help-modal") as HelpModal | null;
    if (!hlpModal) {
      console.warn("Help modal element not found");
    }
    const helpButton = document.getElementById("help-button");
    if (helpButton) {
      helpButton.addEventListener("click", () => {
        loadModal("help-modal").then(
          () => hlpModal?.open(),
          (err) => console.error("help-modal failed to load:", err),
        );
      });
    }
    // Tutorial entry points (play-page card, help page): back to the play page
    // if needed (so a username problem is visible), then a default solo game
    // with the guide on.
    document.addEventListener("start-tutorial", () => {
      // The help modal loads on demand (see LazyModals); until it has, it
      // can't be open.
      if (customElements.get("help-modal") && hlpModal?.isOpen()) {
        hlpModal.close();
      }
      if (this.usernameInput && !this.usernameInput.canPlay()) return;
      whenModalLoaded("single-player-modal", () => {
        void (
          document.querySelector("single-player-modal") as SinglePlayerModal
        )?.startTutorial();
      });
    });

    // Open the modal the current URL names once the document is ready.
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.handleUrl());
    } else {
      this.handleUrl();
    }

    const leaveGame = () => {
      crazyGamesSDK.gameplayStop().then(() => {
        // redirect to the home page
        window.location.href = homeHref();
      });
    };

    const onPopState = () => {
      if (this.currentUrl !== null && this.gameHandle !== null) {
        console.info("Game is active");

        if (!this.gameHandle.stop()) {
          console.info("Player is active, ask before leaving game");

          // We can't block navigation on an async confirmation, so restore the
          // history entry immediately and only leave once the player confirms.
          history.pushState(null, "", this.currentUrl);
          showInGameConfirm(translateText("help_modal.exit_confirmation")).then(
            (isConfirmed) => {
              if (isConfirmed) leaveGame();
            },
          );
          return;
        }

        console.info("Player is not active, leave the game immediately");

        leaveGame();
      } else {
        console.info("Game not active, handle hash update");

        onHashUpdate();
      }
    };

    const onHashUpdate = () => {
      // Router-managed hash changes (#modal=...) are handled by the router
      // syncing in/out.
      if (modalRouter.isHashRouted()) {
        modalRouter.routeFromHash();
        return;
      }
      this.handleUrl();
    };

    // Handle browser navigation (back/forward) and manual hash edits.
    window.addEventListener("popstate", onPopState);
    window.addEventListener("hashchange", onHashUpdate);

    function updateSliderProgress(slider: HTMLInputElement) {
      const percent =
        ((Number(slider.value) - Number(slider.min)) /
          (Number(slider.max) - Number(slider.min))) *
        100;
      slider.style.setProperty("--progress", `${percent}%`);
    }

    document
      .querySelectorAll<HTMLInputElement>("#bots-count")
      .forEach((slider) => {
        updateSliderProgress(slider);
        slider.addEventListener("input", () => updateSliderProgress(slider));
      });
  }

  /**
   * Close the menu's modals and hide its chrome, for a game replacing the
   * menu. Callers dispatch "game-starting" first, so the listeners that stay
   * up through the menu (menu music) stop too.
   */
  private closeMenu(): void {
    [
      "single-player-modal",
      "game-starting-modal",
      "game-top-bar",
      "help-modal",
      "user-setting",
      // The in-game instance is addressed by id: querySelector("user-setting")
      // above only ever reaches the page's inline one.
      "#game-settings",
      "troubleshooting-modal",
      "language-modal",
      "news-modal",
      "lang-selector",
    ].forEach((tag) => {
      const modal = document.querySelector(tag) as HTMLElement & {
        close?: () => void;
        isModalOpen?: boolean;
      };
      if (modal?.close) {
        modal.close();
      } else if (modal && "isModalOpen" in modal) {
        modal.isModalOpen = false;
      }
    });
  }

  private handleUrl() {
    const hash = window.location.hash;
    // A shared link to a modal (`#modal=...`) opens that modal.
    if (modalRouter.routeFromHash()) {
      return;
    }
    if (decodeURIComponent(hash).startsWith("#refresh")) {
      window.location.href = homeHref();
    }
  }

  private async handleJoinLobby(event: CustomEvent<JoinLobbyEvent>) {
    const lobby = event.detail;
    if (this.usernameInput && !this.usernameInput.canPlay()) {
      // The singleplayer modal shows the starting overlay before dispatching
      // join-lobby; a refused join must release it or it stays over the menu.
      const startingModal = document.querySelector("game-starting-modal");
      if (startingModal instanceof GameStartingModal) {
        startingModal.hide();
      }
      return;
    }
    this.mostRecentJoinEvent = event.timeStamp;

    console.log(`starting game ${lobby.gameID}`);

    if (this.gameHandle !== null) {
      console.log("starting a game, stopping existing game");
      this.gameHandle.stop(true);
      setInGameSignal(false);
    }

    const playerName = this.usernameInput?.getUsername() ?? genAnonUsername();
    let joinLobby: typeof import("./ClientGameRunner").joinLobby;
    try {
      ({ joinLobby } = await loadGameClient());
    } catch (err) {
      // The game's chunk didn't load (a network error, or a deploy that
      // replaced it). A full page load also picks up a new deploy.
      console.error("game client failed to load:", err);
      if (this.mostRecentJoinEvent !== event.timeStamp) return;
      window.location.reload();
      return;
    }
    const newGameHandle = joinLobby(this.eventBus, {
      gameID: lobby.gameID,
      playerName,
      gameStartInfo: lobby.gameStartInfo,
    });

    if (this.mostRecentJoinEvent !== event.timeStamp) {
      newGameHandle.stop(true);
      console.warn("Start requested, but was superseded");
      return;
    }

    this.gameHandle = newGameHandle;

    this.gameHandle.prestart.then(() => {
      this.menuTornDown = true;
      document.dispatchEvent(new CustomEvent("game-starting"));
      console.log("Closing modals");
      if (this.usernameInput) {
        // fix edge case where username-validation-error is re-rendered and hidden tag removed
        this.usernameInput.validationError = "";
      }
      document
        .getElementById("username-validation-error")
        ?.classList.add("hidden");
      this.closeMenu();

      crazyGamesSDK.loadingStart();

      // show when the game loads
      const startingModal = document.querySelector(
        "game-starting-modal",
      ) as GameStartingModal;
      if (startingModal && startingModal instanceof GameStartingModal) {
        startingModal.show();
      }
    });

    this.gameHandle.join.then(() => {
      incrementGamesPlayed();

      crazyGamesSDK.loadingStop();
      crazyGamesSDK.gameplayStart();
      setInGameSignal(true);

      // Ensure there's a homepage entry in history before adding the game entry
      if (window.location.hash === "" || window.location.hash === "#") {
        history.replaceState(null, "", window.location.origin + "#refresh");
      }
      history.pushState(null, "", window.location.pathname);

      // Store current URL for popstate confirmation
      this.currentUrl = window.location.href;
    });
  }
}

// Hide elements with no-crazygames class if on CrazyGames
const hideCrazyGamesElements = () => {
  if (crazyGamesSDK.isOnCrazyGames()) {
    document.querySelectorAll(".no-crazygames").forEach((el) => {
      (el as HTMLElement).style.display = "none";
    });
  }
};

// Initialize the client when the DOM is loaded
const bootstrap = () => {
  // Prevent Safari's page-level pinch-zoom, which ignores `user-scalable=no`
  // on iOS and can softlock the HUD. See issue #2330.
  installSafariPinchZoomBlocker();

  // Same for double-tap "smart zoom", which `touch-action: manipulation`
  // alone does not reliably stop on iOS. See issue #4609.
  installDoubleTapZoomBlocker();

  // Chrome and Firefox report a trackpad pinch as ctrl+wheel, which only the
  // map canvas cancels — so pinching over a HUD panel zoomed the page instead
  // of the map. See issue #5098.
  installCtrlWheelZoomBlocker();

  initLayout();
  new Client().initialize();
  initNavigation();
  prefetchGameClient();
  prefetchModals();

  // Hide elements immediately
  hideCrazyGamesElements();

  // Also hide elements after a short delay to catch late-rendered components
  setTimeout(hideCrazyGamesElements, 100);
  setTimeout(hideCrazyGamesElements, 500);
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
