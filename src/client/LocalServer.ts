import { StampedIntent, Turn } from "@openfront/engine-api/Schemas";
import { EventBus } from "@openfront/shared/EventBus";
import {
  ClientMessage,
  ServerMessage,
  ServerStartGameMessage,
} from "@openfront/shared/WireSchemas";
import { ClientEnv } from "src/client/ClientEnv";
import { LobbyConfig } from "./ClientGameRunner";
import {
  GameSpeedDownIntentEvent,
  GameSpeedUpIntentEvent,
  ReplaySpeedChangeEvent,
} from "./InputHandler";
import {
  defaultReplaySpeedMultiplier,
  ReplaySpeedMultiplier,
} from "./utilities/ReplaySpeedMultiplier";

// Order: 0.5, 1, 2, max (same as ReplayPanel)
const SPEED_ORDER: ReplaySpeedMultiplier[] = [
  ReplaySpeedMultiplier.slow,
  ReplaySpeedMultiplier.normal,
  ReplaySpeedMultiplier.fast,
  ReplaySpeedMultiplier.fastest,
];

/**
 * The game clock of a singleplayer game. It stamps the player's intents,
 * bundles them into one turn per tick and hands the turns to the game runner,
 * which forwards them to the simulation worker.
 */
export class LocalServer {
  private turns: Turn[] = [];

  private intents: StampedIntent[] = [];

  private paused = false;
  private replaySpeedMultiplier = defaultReplaySpeedMultiplier;

  private clientID: string | undefined;

  private turnsExecuted = 0;
  private turnStartTime = 0;

  private turnCheckInterval: NodeJS.Timeout;
  private clientConnect: () => void;
  private clientMessage: (message: ServerMessage) => void;

  constructor(
    private lobbyConfig: LobbyConfig,
    private eventBus: EventBus,
  ) {}

  public updateCallback(
    clientConnect: () => void,
    clientMessage: (message: ServerMessage) => void,
  ) {
    this.clientConnect = clientConnect;
    this.clientMessage = clientMessage;
  }

  start() {
    console.log("local server starting");
    this.turnCheckInterval = setInterval(() => {
      const turnIntervalMs =
        ClientEnv.turnIntervalMs() * this.replaySpeedMultiplier;
      const backlog = Math.max(0, this.turns.length - this.turnsExecuted);

      if (backlog === 0 && Date.now() > this.turnStartTime + turnIntervalMs) {
        this.turnStartTime = Date.now();
        // "Ending" the turn hands it to the client, which starts processing it.
        this.endTurn();
      }
    }, 5);

    this.eventBus.on(ReplaySpeedChangeEvent, (event) => {
      this.replaySpeedMultiplier = event.replaySpeedMultiplier;
    });

    this.eventBus.on(GameSpeedUpIntentEvent, () => {
      const idx = SPEED_ORDER.indexOf(this.replaySpeedMultiplier);
      if (idx < 0 || idx >= SPEED_ORDER.length - 1) return;
      this.replaySpeedMultiplier = SPEED_ORDER[idx + 1];
      this.eventBus.emit(
        new ReplaySpeedChangeEvent(this.replaySpeedMultiplier),
      );
    });

    this.eventBus.on(GameSpeedDownIntentEvent, () => {
      const idx = SPEED_ORDER.indexOf(this.replaySpeedMultiplier);
      if (idx <= 0) return;
      this.replaySpeedMultiplier = SPEED_ORDER[idx - 1];
      this.eventBus.emit(
        new ReplaySpeedChangeEvent(this.replaySpeedMultiplier),
      );
    });

    this.clientConnect();
    this.clientID = this.lobbyConfig.gameStartInfo.players[0]?.clientID;
    if (!this.clientID) {
      throw new Error("missing clientID");
    }
    this.clientMessage({
      type: "start",
      gameStartInfo: this.lobbyConfig.gameStartInfo,
      turns: [],
      lobbyCreatedAt: this.lobbyConfig.gameStartInfo.lobbyCreatedAt,
      myClientID: this.clientID,
    } satisfies ServerStartGameMessage);
  }

  onMessage(clientMsg: ClientMessage) {
    if (clientMsg.type === "rejoin") {
      if (!this.clientID) {
        throw new Error("missing clientID");
      }
      this.clientMessage({
        type: "start",
        gameStartInfo: this.lobbyConfig.gameStartInfo,
        turns: this.turns,
        lobbyCreatedAt: this.lobbyConfig.gameStartInfo.lobbyCreatedAt,
        myClientID: this.clientID,
      } satisfies ServerStartGameMessage);
    }
    if (clientMsg.type === "intent") {
      // The clock stamps the clientID - the client doesn't send it
      const stampedIntent = {
        ...clientMsg.intent,
        clientID: this.clientID!,
      };
      if (stampedIntent.type === "toggle_pause") {
        if (stampedIntent.paused) {
          // Pausing: add intent and end turn before pause takes effect
          this.intents.push(stampedIntent);
          this.endTurn();
          this.paused = true;
        } else {
          // Unpausing: clear pause flag before adding intent so next turn can execute
          this.paused = false;
          this.intents.push(stampedIntent);
          this.endTurn();
        }
        return;
      }
      // Don't process non-pause intents while paused
      if (this.paused) {
        return;
      }

      this.intents.push(stampedIntent);
    }
  }

  // This is so the client can tell us when it finished processing the turn.
  public turnComplete() {
    this.turnsExecuted++;
  }

  // endTurn in this context means the clock has collected all the intents
  // and will send the turn to the client.
  private endTurn() {
    if (this.paused) {
      return;
    }
    const pastTurn: Turn = {
      turnNumber: this.turns.length,
      intents: this.intents,
    };
    this.turns.push(pastTurn);
    this.intents = [];
    this.clientMessage({
      type: "turn",
      turn: pastTurn,
    });
  }

  public endGame() {
    console.log("local server ending game");
    clearInterval(this.turnCheckInterval);
  }
}
