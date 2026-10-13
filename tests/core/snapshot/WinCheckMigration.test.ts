import { readVersioned } from "@openfront/engine-lib/snapshot/SnapshotType";
import { WinCheckExecutionSnapshot } from "@openfront/engine/execution/WinCheckExecution";

describe("WinCheck snapshot migration", () => {
  test("a version 1 record loses the ranked-only spawn check flag", () => {
    const state = readVersioned(WinCheckExecutionSnapshot, {
      v: 1,
      d: { active: true, initialized: true, checkedRankedSpawns: true },
    });
    expect(state).toEqual({ active: true, initialized: true });
  });

  test("a current record reads as it is", () => {
    const d = { active: false, initialized: true };
    expect(readVersioned(WinCheckExecutionSnapshot, { v: 2, d })).toEqual(d);
  });
});
