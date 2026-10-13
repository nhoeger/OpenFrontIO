import { GameEnv, parseGameEnv } from "@openfront/shared/configuration/Env";

export class ServerEnv {
  private static readonly gameEnv: GameEnv = parseGameEnv(process.env.GAME_ENV);

  // Values that also flow to the client via index.html, but on the server
  // are read from process.env directly. Server code never reaches into
  // ClientEnv — that's reserved for the browser/worker hydrated path.
  static env(): GameEnv {
    return ServerEnv.gameEnv;
  }
  static gameEnvName(): string {
    switch (ServerEnv.gameEnv) {
      case GameEnv.Dev:
        return "dev";
      case GameEnv.Preprod:
        return "staging";
      case GameEnv.Prod:
        return "prod";
    }
  }
  static port(): number {
    const raw = process.env.PORT;
    if (raw === undefined || raw.length === 0) return 3000;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      throw new Error(`Invalid PORT: ${JSON.stringify(raw)}`);
    }
    return n;
  }
  static cdnBase(): string {
    return process.env.CDN_BASE ?? "";
  }
  // The commit the build was made from, shown as the version of untagged
  // builds. Set GIT_COMMIT when serving a build you want to tell apart.
  static gitCommit(): string {
    const v = process.env.GIT_COMMIT;
    return v === undefined || v === "" ? "unknown" : v;
  }
}
