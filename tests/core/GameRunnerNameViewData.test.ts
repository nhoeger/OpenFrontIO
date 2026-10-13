/**
 * Hosts hold on to updates: the worker posts several ticks in one message,
 * and run_turns a hundred. A tick's name placements must still read as
 * they were at that tick once later ticks have run.
 */

import {
  Difficulty,
  GameMapSize,
  GameMapType,
  GameMode,
  GameType,
} from "@openfront/engine-api/game/GameTypes";
import { GameUpdateViewData } from "@openfront/engine-api/game/GameUpdates";
import { GameStartInfo, StampedIntent } from "@openfront/engine-api/Schemas";
import { Game } from "@openfront/engine/game/Game";
import { createGameRunner } from "@openfront/engine/GameRunner";
import { loadMapFiles } from "@openfront/shared/GameMapLoader";
import path from "path";
import { fileURLToPath } from "url";
import { NodeGameMapLoader } from "../perf/fullgame/NodeGameMapLoader";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const mapLoader = new NodeGameMapLoader(
  path.join(PROJECT_ROOT, "resources/maps"),
);

/** A spawn intent for `clientID` on the first unowned land tile at/after `from`. */
function spawnOnLand(
  game: Game,
  clientID: string,
  from: number,
): StampedIntent {
  const map = game.map();
  for (let ref = from; ref < map.width() * map.height(); ref++) {
    if (map.isLand(ref) && !map.hasOwner(ref)) {
      return { type: "spawn", clientID, tile: ref };
    }
  }
  throw new Error("no free land tile");
}

test("an update's name placements don't change as later ticks run", async () => {
  const start: GameStartInfo = {
    gameID: "nameView1",
    lobbyCreatedAt: 1_700_000_000_000,
    config: {
      gameMap: GameMapType.Onion,
      difficulty: Difficulty.Medium,
      donateGold: false,
      donateTroops: false,
      gameType: GameType.Singleplayer,
      gameMode: GameMode.FFA,
      gameMapSize: GameMapSize.Normal,
      nations: "default",
      bots: 5,
      infiniteGold: false,
      infiniteTroops: false,
      instantBuild: false,
      randomSpawn: false,
      disabledUnits: [],
    },
    players: [{ clientID: "client001", username: "Human 1", clanTag: null }],
  };
  const held: {
    data: NonNullable<GameUpdateViewData["playerNameViewData"]>;
    atTick: string;
  }[] = [];
  const map = await loadMapFiles(
    mapLoader,
    start.config.gameMap,
    start.config.gameMapSize,
  );
  const runner = await createGameRunner(start, undefined, map, (gu) => {
    if ("updates" in gu && gu.playerNameViewData !== undefined) {
      held.push({
        data: gu.playerNameViewData,
        atTick: JSON.stringify(gu.playerNameViewData),
      });
    }
  });
  // Past the spawn phase, so territory grows and names move.
  for (let t = 0; t < 300; t++) {
    runner.addTurn({
      turnNumber: t,
      intents: t === 3 ? [spawnOnLand(runner.game, "client001", 1000)] : [],
    });
    expect(runner.executeNextTick()).toBe(true);
  }
  expect(new Set(held.map((h) => h.atTick)).size).toBeGreaterThan(2);
  for (const h of held) expect(JSON.stringify(h.data)).toBe(h.atTick);
}, 60_000);
