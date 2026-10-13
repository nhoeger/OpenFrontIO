declare global {
  interface Window {
    CrazyGames?: {
      SDK: {
        init: () => Promise<void>;
        ad: {
          requestAd: (
            adType: string,
            callbacks: {
              adStarted: () => void;
              adFinished: () => void;
              adError: (error: any) => void;
            },
          ) => void;
        };
        game: {
          gameplayStart: () => Promise<void>;
          gameplayStop: () => Promise<void>;
          happytime: () => Promise<void>;
          loadingStart: () => void;
          loadingStop: () => void;
        };
      };
    };
  }
}

export class CrazyGamesSDK {
  private initialized = false;
  private isGameplayActive = false;
  // Resolves true once the SDK initialized, false once init definitively
  // failed (not on CrazyGames, SDK never loaded, init threw).
  private readyPromise: Promise<boolean>;
  private resolveReady!: (ready: boolean) => void;

  constructor() {
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
  }

  async ready(): Promise<boolean> {
    const timeout = new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(false), 3000);
    });

    return Promise.race([this.readyPromise, timeout]);
  }

  isOnCrazyGames(): boolean {
    try {
      // Check if we're in an iframe
      if (window.self !== window.top) {
        // Try to access parent URL
        return window?.top?.location?.hostname.includes("crazygames") ?? false;
      }
      return false;
    } catch (e) {
      // If we get a cross-origin error, we're definitely iframed
      // Check our own referrer as fallback
      const isCrazyGames = document.referrer.includes("crazygames");
      if (isCrazyGames) {
        return true;
      }

      // Fallback: on safari private we can't get referrer, so just assume we are in crazygames if in iframe
      return window.self !== window.top;
    }
  }

  isReady(): boolean {
    return this.isOnCrazyGames() && this.initialized;
  }

  async maybeInit(): Promise<void> {
    if (this.initialized) {
      console.warn("CrazyGames SDK already initialized");
      return;
    }

    if (!this.isOnCrazyGames()) {
      console.log("Not running on CrazyGames platform, not initializing SDK");
      this.resolveReady(false);
      return;
    }

    // Wait for SDK to load
    let attempts = 0;
    while (typeof window.CrazyGames === "undefined" && attempts < 100) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      attempts++;
    }

    if (typeof window.CrazyGames === "undefined") {
      console.warn("CrazyGames SDK not available");
      this.resolveReady(false);
      return;
    }

    try {
      await window.CrazyGames.SDK.init();
      this.initialized = true;
      this.resolveReady(true);
      console.log("CrazyGames SDK initialized");
    } catch (error) {
      console.error("Failed to initialize CrazyGames SDK:", error);
      this.resolveReady(false);
    }
  }

  async gameplayStart(): Promise<void> {
    if (!this.isReady()) {
      return;
    }

    if (this.isGameplayActive) {
      console.warn("Gameplay already started");
      return;
    }

    try {
      await window.CrazyGames!.SDK.game.gameplayStart();
      this.isGameplayActive = true;
      console.log("CrazyGames: gameplay started");
    } catch (error) {
      console.error("Failed to report gameplay start:", error);
    }
  }

  async gameplayStop(): Promise<void> {
    if (!this.isReady()) {
      return;
    }

    if (!this.isGameplayActive) {
      return;
    }

    try {
      await window.CrazyGames!.SDK.game.gameplayStop();
      this.isGameplayActive = false;
      console.log("CrazyGames: gameplay stopped");
    } catch (error) {
      console.error("Failed to report gameplay stop:", error);
    }
  }

  async happytime(): Promise<void> {
    if (!this.isReady()) {
      return;
    }

    try {
      await window.CrazyGames!.SDK.game.happytime();
      console.log("CrazyGames: happy time triggered");
    } catch (error) {
      console.error("Failed to trigger happy time:", error);
    }
  }

  loadingStart(): void {
    if (!this.isReady()) {
      return;
    }

    try {
      window.CrazyGames!.SDK.game.loadingStart();
      console.log("CrazyGames: loading started");
    } catch (error) {
      console.error("Failed to report loading start:", error);
    }
  }

  loadingStop(): void {
    if (!this.isReady()) {
      return;
    }

    try {
      window.CrazyGames!.SDK.game.loadingStop();
      console.log("CrazyGames: loading stopped");
    } catch (error) {
      console.error("Failed to report loading stop:", error);
    }
  }

  requestMidgameAd(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.isReady()) {
        resolve();
        return;
      }

      try {
        const callbacks = {
          adFinished: () => {
            console.log("End midgame ad");
            resolve();
          },
          adError: (error: any) => {
            console.log("Error midgame ad", error);
            resolve();
          },
          adStarted: () => console.log("Start midgame ad"),
        };
        window.CrazyGames!.SDK.ad.requestAd("midgame", callbacks);
      } catch (error) {
        console.warn("Failed to request midgame ad:", error);
        resolve();
      }
    });
  }
}

export const crazyGamesSDK = new CrazyGamesSDK();
