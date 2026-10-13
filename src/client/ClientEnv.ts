import { GameEnv, parseGameEnv } from "@openfront/shared/configuration/Env";

/**
 * Values that flow from server → client via index.html. Set on the server from
 * process.env, then re-hydrated on the client from window.BOOTSTRAP_CONFIG.
 */
export interface ClientEnvValues {
  gameEnv: GameEnv;
  gitCommit: string;
}

export class ClientEnv {
  private static values: ClientEnvValues | null = null;

  /** Test-only. */
  static reset(): void {
    ClientEnv.values = null;
  }

  private static get(): ClientEnvValues {
    if (ClientEnv.values) return ClientEnv.values;
    if (typeof window === "undefined") {
      throw new Error("ClientEnv is only available on the browser main thread");
    }
    const bc = window.BOOTSTRAP_CONFIG;
    if (!bc || bc.gameEnv === undefined || bc.gitCommit === undefined) {
      throw new Error("Missing BOOTSTRAP_CONFIG");
    }
    ClientEnv.values = {
      gameEnv: parseGameEnv(bc.gameEnv),
      gitCommit: bc.gitCommit,
    };
    return ClientEnv.values;
  }

  static env(): GameEnv {
    return ClientEnv.get().gameEnv;
  }
  static gitCommit(): string {
    return ClientEnv.get().gitCommit;
  }
  static turnIntervalMs(): number {
    return 100;
  }
}
