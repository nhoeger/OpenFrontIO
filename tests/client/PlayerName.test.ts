import { UsernameSchema } from "@openfront/engine-api/Schemas";
import { describe, expect, it } from "vitest";
import { clampUsername, genAnonUsername } from "../../src/client/PlayerName";
import { MAX_USERNAME_LENGTH } from "../../src/client/validations/username";

describe("clampUsername", () => {
  it("trims a name that predates the cap rather than rejecting it", () => {
    expect(clampUsername("a".repeat(MAX_USERNAME_LENGTH + 7))).toBe(
      "a".repeat(MAX_USERNAME_LENGTH),
    );
  });

  it("leaves a name within the cap alone", () => {
    expect(clampUsername("MyCoolName")).toBe("MyCoolName");
  });
});

describe("genAnonUsername", () => {
  it("produces names the engine accepts", () => {
    for (let i = 0; i < 200; i++) {
      const name = genAnonUsername();
      expect(name.startsWith("Anon")).toBe(true);
      expect(UsernameSchema.safeParse(name).success, name).toBe(true);
    }
  });
});
