import {
  ALLIANCE_INDEX_LONGEST_HELD,
  ATTACK_INDEX_MAX_RECV,
  BOAT_INDEX_LOST,
  DONATION_INDEX_GOLD_RECV,
  DONATION_INDEX_GOLD_RECV_BROKE,
  GOLD_INDEX_DONATE_RECV,
  PlayerStatsSchema,
  TILE_INDEX_DRAWDOWN_TROUGH,
} from "@openfront/engine-api/StatsSchemas";

function testPlayerSchema(
  json: string,
  expectSuccess = true,
  expectThrow = false,
): void {
  const parse = () => {
    const raw = JSON.parse(json);
    const result = PlayerStatsSchema.safeParse(raw);
    return result.success;
  };

  if (expectSuccess) {
    // Expect success
    expect(parse()).toBeTruthy();
  } else if (!expectThrow) {
    // Expect failure
    expect(parse()).toBeFalsy();
  } else {
    // Expect throw
    expect(parse).toThrow();
  }
}

describe("StatsSchema", () => {
  test("Parse empty", () => {
    testPlayerSchema("{}");
  });

  test("Parse partial", () => {
    testPlayerSchema('{"units":{"port":["0","0","0","1"]}}');
  });

  test("Parse invalid", () => {
    testPlayerSchema("[]", false);
    testPlayerSchema("null", false);
    testPlayerSchema('"null"', false);
    testPlayerSchema('"undefined"', false);
  });

  test("Parse failure", () => {
    testPlayerSchema("", false, true);
    testPlayerSchema("undefined", false, true);
    testPlayerSchema("{", false, true);
    testPlayerSchema("{}}", false, true);
  });

  test("null array elements coerce to 0n (LEFT JOIN rows with no stats)", () => {
    // Postgres SUM() over all-NULL rows returns NULL. These should parse as 0n.
    testPlayerSchema(
      '{"attacks":[null,null,null],"betrayals":null,"gold":[null,null,null,null,null,null]}',
    );
  });
});

describe("PlayerStats new fields", () => {
  it("parses tiles, alliances and peakTroops", () => {
    const parsed = PlayerStatsSchema.parse({
      tiles: ["1000", "1000", "100"],
      alliances: ["3", "1", "1", "1", "2", "540"],
      peakTroops: "250000",
    });
    expect(parsed?.tiles?.[TILE_INDEX_DRAWDOWN_TROUGH]).toBe(100n);
    expect(parsed?.alliances?.[ALLIANCE_INDEX_LONGEST_HELD]).toBe(540n);
    expect(parsed?.peakTroops).toBe(250000n);
  });

  it("parses a boat loss count", () => {
    const parsed = PlayerStatsSchema.parse({
      boats: { trans: ["4", "3", "0", "1", "2"] },
    });
    expect(parsed?.boats?.trans?.[BOAT_INDEX_LOST]).toBe(2n);
  });

  it("parses a banked record written before boat losses existed", () => {
    const parsed = PlayerStatsSchema.parse({
      boats: { trans: ["4", "3", "0", "1"], trade: ["9", "8", "1", "0"] },
    });
    expect(parsed?.boats?.trans?.[BOAT_INDEX_LOST]).toBeUndefined();
    expect(parsed?.boats?.trade?.[BOAT_INDEX_LOST]).toBeUndefined();
  });

  it("parses donation counts and the gold they carried", () => {
    const parsed = PlayerStatsSchema.parse({
      donations: ["7", "3"],
      gold: ["1", "2", "3", "4", "5", "6", "900000"],
    });
    expect(parsed?.donations?.[DONATION_INDEX_GOLD_RECV]).toBe(7n);
    expect(parsed?.donations?.[DONATION_INDEX_GOLD_RECV_BROKE]).toBe(3n);
    expect(parsed?.gold?.[GOLD_INDEX_DONATE_RECV]).toBe(900000n);
  });

  it("parses a banked record written before donations were counted", () => {
    const parsed = PlayerStatsSchema.parse({
      gold: ["1", "2", "3", "4", "5", "6"],
    });
    expect(parsed?.donations).toBeUndefined();
    expect(parsed?.gold?.[GOLD_INDEX_DONATE_RECV]).toBeUndefined();
  });

  it("parses a spawn tile", () => {
    const parsed = PlayerStatsSchema.parse({ spawnTile: 123456 });
    expect(parsed?.spawnTile).toBe(123456);
  });

  it("parses a record with none of the new fields", () => {
    const parsed = PlayerStatsSchema.parse({ attacks: ["1", "2", "3"] });
    expect(parsed?.spawnTile).toBeUndefined();
    expect(parsed?.tiles).toBeUndefined();
    expect(parsed?.alliances).toBeUndefined();
    expect(parsed?.peakTroops).toBeUndefined();
    expect(parsed?.donations).toBeUndefined();
    expect(parsed?.attacks?.[ATTACK_INDEX_MAX_RECV]).toBeUndefined();
  });
});
