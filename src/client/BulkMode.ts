import {
  BuildableUnit,
  Gold,
  maxBulkAmount,
} from "@openfront/engine-api/game/GameTypes";

// How many levels (or bombs) one click on the build ghost buys. "max" means
// as many as the player can currently afford.
export type BulkMode = 1 | 5 | "max";

export const BULK_MODES: readonly BulkMode[] = [1, 5, "max"];

// Resolves a bulk mode to a concrete amount for one purchase. `readyMissiles`
// caps the amount for bombs, which also need a loaded silo tube per bomb.
// "max" never resolves below 1, so an unaffordable click still previews (and
// fails) as a single purchase instead of an empty one.
export function resolveBulkAmount(
  bu: BuildableUnit,
  mode: BulkMode,
  gold: Gold,
  readyMissiles?: number,
): number {
  if (mode !== "max") return mode;
  let max = maxBulkAmount(bu, gold);
  if (readyMissiles !== undefined) max = Math.min(max, readyMissiles);
  return Math.max(1, max);
}
