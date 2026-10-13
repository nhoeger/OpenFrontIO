import type { GameStartInfo } from "@openfront/engine-api/Schemas";
import { EventBus } from "@openfront/shared/EventBus";
import type { ServerMessage } from "@openfront/shared/WireSchemas";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("src/client/ClientEnv", () => ({
  ClientEnv: {
    turnIntervalMs: vi.fn(() => 100),
    gitCommit: vi.fn(() => "DEV"),
  },
}));

import {
  GameSpeedDownIntentEvent,
  GameSpeedUpIntentEvent,
  ReplaySpeedChangeEvent,
} from "../../src/client/InputHandler";
import { LocalServer } from "../../src/client/LocalServer";
import { ReplaySpeedMultiplier } from "../../src/client/utilities/ReplaySpeedMultiplier";

const CLIENT_ID = "abCD1234";

function makeGameStartInfo(): GameStartInfo {
  return {
    gameID: "gameID12",
    lobbyCreatedAt: 1000,
    config: {
      gameMap: "Africa",
      difficulty: "Medium",
      donateGold: false,
      donateTroops: false,
      gameType: "Singleplayer",
      gameMode: "Free For All",
      gameMapSize: "Normal",
      nations: "default",
      bots: 400,
      infiniteGold: false,
      infiniteTroops: false,
      instantBuild: false,
      randomSpawn: false,
    },
    players: [
      {
        clientID: CLIENT_ID,
        username: "TestUser",
        clanTag: null,
      },
    ],
  } as GameStartInfo;
}

describe("LocalServer", () => {
  let server: LocalServer;
  let bus: EventBus;
  let messages: ServerMessage[];

  function makeServer(): LocalServer {
    bus = new EventBus();
    messages = [];
    const created = new LocalServer(
      {
        gameID: "gameID12",
        playerName: "TestUser",
        gameStartInfo: makeGameStartInfo(),
      },
      bus,
    );
    created.updateCallback(
      () => {},
      (msg: ServerMessage) => {
        messages.push(msg);
        // Ack immediately so the backlog gate never throttles pacing.
        if (msg.type === "turn") created.turnComplete();
      },
    );
    return created;
  }

  afterEach(() => {
    server?.endGame();
    vi.useRealTimers();
  });

  it("opens the game with a start message naming the local player", () => {
    vi.useFakeTimers();
    server = makeServer();
    server.start();

    expect(messages).toHaveLength(1);
    const start = messages[0];
    expect(start.type).toBe("start");
    if (start.type === "start") {
      expect(start.myClientID).toBe(CLIENT_ID);
      expect(start.turns).toEqual([]);
      expect(start.gameStartInfo.gameID).toBe("gameID12");
    }
  });

  it("refuses to start a game without a player", () => {
    vi.useFakeTimers();
    server = makeServer();
    const info = makeGameStartInfo();
    info.players = [];
    (server as any).lobbyConfig.gameStartInfo = info;
    expect(() => server.start()).toThrow("missing clientID");
    server.endGame();
  });

  it("stamps the local player's clientID onto every intent in the next turn", () => {
    vi.useFakeTimers();
    server = makeServer();
    server.start();

    server.onMessage({
      type: "intent",
      intent: { type: "spawn", tile: 7 },
    });
    vi.advanceTimersByTime(200);

    const turns = messages.filter((m) => m.type === "turn");
    const withIntent = turns.find(
      (m) => m.type === "turn" && m.turn.intents.length > 0,
    );
    expect(withIntent).toBeDefined();
    if (withIntent?.type === "turn") {
      expect(withIntent.turn.intents).toEqual([
        { type: "spawn", tile: 7, clientID: CLIENT_ID },
      ]);
    }
  });

  it("resends the game start and every turn so far on rejoin", () => {
    vi.useFakeTimers();
    server = makeServer();
    server.start();
    vi.advanceTimersByTime(500);
    const sent = messages.filter((m) => m.type === "turn").length;
    expect(sent).toBeGreaterThan(0);

    messages.length = 0;
    server.onMessage({ type: "rejoin", gameID: "gameID12", lastTurn: 0 });

    expect(messages).toHaveLength(1);
    const start = messages[0];
    expect(start.type).toBe("start");
    if (start.type === "start") {
      expect(start.turns).toHaveLength(sent);
    }
  });

  it("stops handing out turns while paused and ignores other intents", () => {
    vi.useFakeTimers();
    server = makeServer();
    server.start();

    server.onMessage({
      type: "intent",
      intent: { type: "toggle_pause", paused: true },
    });
    messages.length = 0;
    server.onMessage({
      type: "intent",
      intent: { type: "spawn", tile: 3 },
    });
    vi.advanceTimersByTime(1000);
    expect(messages.filter((m) => m.type === "turn")).toHaveLength(0);

    server.onMessage({
      type: "intent",
      intent: { type: "toggle_pause", paused: false },
    });
    vi.advanceTimersByTime(300);
    const resumed = messages.filter((m) => m.type === "turn");
    expect(resumed.length).toBeGreaterThan(0);
    // The spawn sent while paused was dropped.
    for (const m of resumed) {
      if (m.type === "turn") {
        expect(m.turn.intents.some((i) => i.type === "spawn")).toBe(false);
      }
    }
  });

  describe("game speed", () => {
    it("a ReplaySpeedChangeEvent stretches the turn interval", () => {
      vi.useFakeTimers();
      server = makeServer();
      server.start();

      vi.advanceTimersByTime(1000);
      const atNormalSpeed = messages.filter((m) => m.type === "turn").length;
      // 100ms interval at the default 1x multiplier: ~10 turns a second.
      expect(atNormalSpeed).toBeGreaterThanOrEqual(4);

      bus.emit(new ReplaySpeedChangeEvent(ReplaySpeedMultiplier.slow));
      messages.length = 0;
      vi.advanceTimersByTime(1000);
      const slow = messages.filter((m) => m.type === "turn").length;

      // The 2x interval multiplier must roughly halve the cadence.
      expect(slow).toBeLessThan(atNormalSpeed);
    });

    it("speed up and down walk the preset ladder and announce each step", () => {
      vi.useFakeTimers();
      server = makeServer();
      server.start();

      const seen: ReplaySpeedMultiplier[] = [];
      bus.on(ReplaySpeedChangeEvent, (e) => seen.push(e.replaySpeedMultiplier));

      bus.emit(new GameSpeedUpIntentEvent());
      bus.emit(new GameSpeedDownIntentEvent());
      bus.emit(new GameSpeedDownIntentEvent());

      expect(seen).toEqual([
        ReplaySpeedMultiplier.fast,
        ReplaySpeedMultiplier.normal,
        ReplaySpeedMultiplier.slow,
      ]);
    });
  });
});
