import { PlayerType } from "@openfront/engine-api/game/GameTypes";
import { GameID } from "@openfront/engine-api/Schemas";
import { resolveTribeNameData } from "@openfront/engine-lib/execution/utils/TribeNames";
import { simpleHash } from "@openfront/engine-lib/Util";
import { customAlphabet } from "nanoid";

export function sanitize(name: string): string {
  return Array.from(name)
    .join("")
    .replace(/[^\p{L}\p{N}\s\p{Emoji}\p{Emoji_Component}[\]_]/gu, "");
}

export function generateID(): GameID {
  const nanoid = customAlphabet(
    "123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ",
    8,
  );
  return nanoid();
}

export function createRandomName(
  name: string,
  playerType: PlayerType,
): string | null {
  let randomName: string | null = null;
  if (playerType === PlayerType.Human) {
    const { prefixes, suffixes } = resolveTribeNameData();
    const hash = simpleHash(name);
    const prefixIndex = hash % prefixes.length;
    const suffixIndex = Math.floor(hash / prefixes.length) % suffixes.length;

    randomName = `👤 ${prefixes[prefixIndex]} ${suffixes[suffixIndex]}`;
  }
  return randomName;
}

/**
 * JSON.stringify replacer function that converts bigint values to strings.
 */
export function replacer(_key: string, value: any): any {
  return typeof value === "bigint" ? value.toString() : value;
}
