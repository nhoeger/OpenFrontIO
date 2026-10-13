import { GameType } from "@openfront/engine-api/game/GameTypes";
import { describe, expect, test } from "vitest";
import { setup } from "../../util/Setup";

// 10 ticks = 1 second of game time.
describe("numSpawnPhaseTurns", () => {
  test("the spawn phase is 100 ticks", async () => {
    const game = await setup("plains", { gameType: GameType.Singleplayer });
    expect(game.config().numSpawnPhaseTurns()).toBe(100);
  });

  test("random spawn does not change the spawn phase length", async () => {
    const game = await setup("plains", {
      gameType: GameType.Singleplayer,
      randomSpawn: true,
    });
    expect(game.config().numSpawnPhaseTurns()).toBe(100);
  });
});
