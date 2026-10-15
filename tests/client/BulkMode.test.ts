import { BuildableUnit, UnitType } from "@openfront/engine-api/game/GameTypes";
import { describe, expect, it } from "vitest";
import { resolveBulkAmount } from "../../src/client/BulkMode";

const upgradable: BuildableUnit = {
  type: UnitType.City,
  canBuild: false,
  canUpgrade: 7,
  cost: 100n,
  // Escalating cumulative totals for 1..4 levels.
  upgradeCosts: [100n, 250n, 450n, 700n],
  overlappingRailroads: [],
  ghostRailPaths: [],
};

const atomBomb: BuildableUnit = {
  type: UnitType.AtomBomb,
  canBuild: 1,
  canUpgrade: false,
  cost: 100n,
  overlappingRailroads: [],
  ghostRailPaths: [],
};

describe("resolveBulkAmount", () => {
  it("returns fixed modes as-is, regardless of gold", () => {
    expect(resolveBulkAmount(upgradable, 1, 0n)).toBe(1);
    expect(resolveBulkAmount(upgradable, 5, 0n)).toBe(5);
  });

  it("max buys as many levels as the escalating prices allow", () => {
    expect(resolveBulkAmount(upgradable, "max", 460n)).toBe(3);
    expect(resolveBulkAmount(upgradable, "max", 250n)).toBe(2);
  });

  it("max never exceeds the shipped upgrade price ladder", () => {
    expect(resolveBulkAmount(upgradable, "max", 10_000n)).toBe(4);
  });

  it("max falls back to 1 when even one purchase is unaffordable", () => {
    expect(resolveBulkAmount(upgradable, "max", 10n)).toBe(1);
  });

  it("max for bombs is capped by loaded silo tubes", () => {
    expect(resolveBulkAmount(atomBomb, "max", 1_000n, 3)).toBe(3);
    expect(resolveBulkAmount(atomBomb, "max", 250n, 10)).toBe(2);
    expect(resolveBulkAmount(atomBomb, "max", 1_000n, 0)).toBe(1);
  });
});
