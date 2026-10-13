import { zb } from "@openfront/zbin";
import { z } from "zod";
import {
  ColorPaletteSchema,
  CosmeticNameSchema,
  EffectTypeSchema,
  PatternDataSchema,
} from "./CosmeticSchemas";

import {
  GameStartInfoSchema,
  ID,
  IntentSchema,
  PlayerSchema,
  TurnSchema,
} from "@openfront/engine-api/Schemas";

// The messages exchanged between the game runner and the in-process game
// clock (src/client/LocalServer.ts) of a singleplayer game.

export type ClientMessage = ClientIntentMessage | ClientRejoinMessage;

export type ServerMessage = ServerTurnMessage | ServerStartGameMessage;

export type ServerTurnMessage = z.infer<typeof ServerTurnMessageSchema>;

export type ServerStartGameMessage = z.infer<
  typeof ServerStartGameMessageSchema
>;

export type ClientIntentMessage = z.infer<typeof ClientIntentMessageSchema>;

export type ClientRejoinMessage = z.infer<typeof ClientRejoinMessageSchema>;

export type PlayerCosmetics = z.infer<typeof PlayerCosmeticsSchema>;

export type PlayerPattern = z.infer<typeof PlayerPatternSchema>;

export type WirePlayer = z.infer<typeof WirePlayerSchema>;

export type WireGameStartInfo = z.infer<typeof WireGameStartInfoSchema>;

export const FlagSchema = z.string();

export const PlayerPatternSchema = z.object({
  name: CosmeticNameSchema,
  patternData: PatternDataSchema,
  colorPalette: ColorPaletteSchema.optional(),
});

export const PlayerColorSchema = z.object({
  color: z.string(),
});

export const PlayerSkinSchema = z.object({
  name: CosmeticNameSchema,
  url: z.string(),
});

export const PlayerCrownSchema = z.object({
  name: CosmeticNameSchema,
  url: z.string(),
});

// A resolved effect is just an identity: which effect, of which type. Its
// attributes (the visual style) are resolved from the cosmetics catalog by
// (effectType, name), so this needs no per-type variants — a new effectType
// just becomes a new EFFECT_TYPES entry, no change here.
export const PlayerEffectSchema = z.object({
  name: CosmeticNameSchema,
  effectType: EffectTypeSchema,
});

// The cosmetics a player is drawn with.
export const PlayerCosmeticsSchema = z.object({
  flag: FlagSchema.optional(),
  pattern: PlayerPatternSchema.optional(),
  color: PlayerColorSchema.optional(),
  skin: PlayerSkinSchema.optional(),
  crown: PlayerCrownSchema.optional(),
  // Resolved effects keyed by slot (effectType for trails, nukeType for nuke
  // explosions).
  effects: z.record(z.string(), PlayerEffectSchema).optional(),
  // Plays under the verified account username — renders the blue check.
  verified: z.boolean().optional(),
});

// A player as the client holds it: what the engine reads (PlayerSchema) plus
// the cosmetics only the client renders. zbin encodes fields in shape order,
// so cosmetics keeps its place after clanTag.
const { clientID, username, clanTag, ...playerRest } = PlayerSchema.shape;
export const WirePlayerSchema = z.object({
  clientID,
  username,
  clanTag,
  cosmetics: PlayerCosmeticsSchema.optional(),
  ...playerRest,
});

export const WireGameStartInfoSchema = GameStartInfoSchema.extend({
  players: WirePlayerSchema.array(),
});

//
// Game clock
//

export const ServerTurnMessageSchema = z.object({
  type: z.literal("turn"),
  turn: TurnSchema,
});

export const ServerStartGameMessageSchema = z.object({
  type: z.literal("start"),
  // Every turn so far, for a runner that (re)starts the game.
  turns: TurnSchema.array(),
  gameStartInfo: WireGameStartInfoSchema,
  lobbyCreatedAt: zb.uint(),
  // The clientID of the local player.
  myClientID: ID,
});

export const ClientIntentMessageSchema = z.object({
  type: z.literal("intent"),
  intent: IntentSchema,
});

// Asks the game clock to resend the game start and every turn so far.
export const ClientRejoinMessageSchema = z.object({
  type: z.literal("rejoin"),
  gameID: ID,
  lastTurn: zb.uint(),
});
