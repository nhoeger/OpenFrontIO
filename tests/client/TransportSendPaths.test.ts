import { EventBus } from "@openfront/shared/EventBus";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Transport's send paths: intent events on the bus reach the local game clock
// as intent messages, and a transport that has left the game stops answering.

const localServer = vi.hoisted(() => ({
  onMessage: vi.fn(),
  start: vi.fn(),
  updateCallback: vi.fn(),
  endGame: vi.fn(),
  turnComplete: vi.fn(),
}));
vi.mock("../../src/client/LocalServer", () => ({
  LocalServer: class {
    onMessage = localServer.onMessage;
    start = localServer.start;
    updateCallback = localServer.updateCallback;
    endGame = localServer.endGame;
    turnComplete = localServer.turnComplete;
  },
}));

import type { LobbyConfig } from "../../src/client/ClientGameRunner";
import {
  CancelAttackIntentEvent,
  counterAttackTroops,
  PauseGameIntentEvent,
  SendAttackIntentEvent,
  SendBoatAttackIntentEvent,
  SendDonateGoldIntentEvent,
  SendSpawnIntentEvent,
  Transport,
} from "../../src/client/Transport";
import type { PlayerView } from "../../src/client/view";

function makeTransport() {
  const lobbyConfig = {
    gameID: "game1234",
    playerName: "tester",
  } as unknown as LobbyConfig;
  const eventBus = new EventBus();
  const transport = new Transport(lobbyConfig, eventBus);
  transport.connect(
    () => {},
    () => {},
  );
  return { transport, eventBus };
}

const intents = () =>
  localServer.onMessage.mock.calls.map(([msg]) => msg as unknown);

describe("Transport send paths", () => {
  let transports: Transport[];

  beforeEach(() => {
    localServer.onMessage.mockClear();
    localServer.endGame.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
    transports = [];
  });

  afterEach(() => {
    for (const t of transports) t.leaveGame();
    vi.restoreAllMocks();
  });

  function connected() {
    const made = makeTransport();
    transports.push(made.transport);
    return made;
  }

  describe("intents", () => {
    it("turns bus intent events into intent messages for the game clock", () => {
      const { eventBus } = connected();
      eventBus.emit(new SendSpawnIntentEvent(123));
      eventBus.emit(new SendAttackIntentEvent("player01", 50));
      eventBus.emit(
        new SendDonateGoldIntentEvent(
          { id: () => "player02" } as unknown as PlayerView,
          25n,
        ),
      );
      eventBus.emit(new CancelAttackIntentEvent("atk-1"));
      eventBus.emit(new PauseGameIntentEvent(true));

      expect(intents()).toEqual([
        { type: "intent", intent: { type: "spawn", tile: 123 } },
        {
          type: "intent",
          intent: { type: "attack", targetID: "player01", troops: 50 },
        },
        {
          type: "intent",
          intent: { type: "donate_gold", recipient: "player02", gold: 25 },
        },
        {
          type: "intent",
          intent: { type: "cancel_attack", attackID: "atk-1" },
        },
        { type: "intent", intent: { type: "toggle_pause", paused: true } },
      ]);
    });

    // The intent schemas reject a NaN troop count: drop the one intent rather
    // than feeding the simulation a bad number.
    it("drops attack and boat intents whose troops are not a finite count", () => {
      const { eventBus } = connected();
      eventBus.emit(new SendAttackIntentEvent("player01", NaN));
      eventBus.emit(new SendAttackIntentEvent(null, Infinity));
      eventBus.emit(new SendBoatAttackIntentEvent(7, NaN));
      eventBus.emit(new SendBoatAttackIntentEvent(7, -1));

      expect(intents()).toHaveLength(0);
      expect(console.error).toHaveBeenCalledTimes(4);

      eventBus.emit(new SendBoatAttackIntentEvent(7, 0));
      expect(intents()).toContainEqual({
        type: "intent",
        intent: { type: "boat", troops: 0, dst: 7 },
      });
    });
  });

  describe("counterAttackTroops", () => {
    it("caps the counter at what the player would send", () => {
      expect(counterAttackTroops(500, 200)).toBe(200);
      expect(counterAttackTroops(100, 200)).toBe(100);
    });

    it("ignores an incoming attack whose count is not finite", () => {
      expect(counterAttackTroops(NaN, 200)).toBe(200);
    });
  });

  describe("rejoinGame", () => {
    it("asks the game clock to resend the game from the given turn", () => {
      const { transport } = connected();
      transport.rejoinGame(3);

      expect(intents()).toEqual([
        { type: "rejoin", gameID: "game1234", lastTurn: 3 },
      ]);
    });
  });

  describe("after leaving the game", () => {
    // The bus is shared by every transport the page ever made, so a
    // superseded one must stop answering.
    it("stops answering bus events and ends the game clock", () => {
      const { transport, eventBus } = connected();

      transport.leaveGame();
      eventBus.emit(new SendSpawnIntentEvent(5));

      expect(localServer.endGame).toHaveBeenCalledOnce();
      expect(intents()).toHaveLength(0);
    });
  });
});
