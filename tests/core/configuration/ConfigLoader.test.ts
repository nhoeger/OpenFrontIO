import { GameEnv, parseGameEnv } from "@openfront/shared/configuration/Env";
import { ClientEnv } from "src/client/ClientEnv";
import { beforeEach, describe, expect, test, vi } from "vitest";

describe("parseGameEnv", () => {
  test("maps 'dev' to GameEnv.Dev", () => {
    expect(parseGameEnv("dev")).toBe(GameEnv.Dev);
  });
  test("maps 'staging' to GameEnv.Preprod", () => {
    expect(parseGameEnv("staging")).toBe(GameEnv.Preprod);
  });
  test("maps 'prod' to GameEnv.Prod", () => {
    expect(parseGameEnv("prod")).toBe(GameEnv.Prod);
  });
  test("throws on undefined", () => {
    expect(() => parseGameEnv(undefined)).toThrow(/unsupported game env/);
  });
  test("throws on unknown value", () => {
    expect(() => parseGameEnv("production")).toThrow(/unsupported game env/);
  });
});

describe("ClientEnv", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.BOOTSTRAP_CONFIG = undefined;
    ClientEnv.reset();
  });

  test("reads from window.BOOTSTRAP_CONFIG without fetching", () => {
    window.BOOTSTRAP_CONFIG = {
      gameEnv: "staging",
      gitCommit: "abc123",
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    expect(ClientEnv.env()).toBe(GameEnv.Preprod);
    expect(ClientEnv.gitCommit()).toBe("abc123");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("throws when BOOTSTRAP_CONFIG is undefined", () => {
    expect(() => ClientEnv.env()).toThrow(/Missing BOOTSTRAP_CONFIG/);
  });

  test("throws when a required environment field is missing", () => {
    window.BOOTSTRAP_CONFIG = {
      gameEnv: "dev",
      // gitCommit missing
    };
    expect(() => ClientEnv.gitCommit()).toThrow(/Missing BOOTSTRAP_CONFIG/);
  });

  test("turns tick every 100ms", () => {
    expect(ClientEnv.turnIntervalMs()).toBe(100);
  });
});
