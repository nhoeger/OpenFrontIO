import { zb } from "@openfront/zbin";
import { z } from "zod";
import {
  AllPlayers,
  Difficulty,
  Duos,
  GameMapSize,
  GameMapType,
  GameMode,
  GameType,
  HumansVsNations,
  MAX_UPGRADE_AMOUNT,
  Quads,
  Trios,
  UnitType,
} from "./game/GameTypes";
import { PlayerStatsSchema } from "./StatsSchemas";

export type GameID = string;
export type ClientID = string;

export type Intent =
  | SpawnIntent
  | AttackIntent
  | CancelAttackIntent
  | BoatAttackIntent
  | CancelBoatIntent
  | AllianceRequestIntent
  | AllianceRejectIntent
  | AllianceExtensionIntent
  | BreakAllianceIntent
  | TargetPlayerIntent
  | EmojiIntent
  | DonateGoldIntent
  | DonateTroopsIntent
  | BuildUnitIntent
  | EmbargoIntent
  | MoveWarshipIntent
  | EmbargoAllIntent
  | UpgradeStructureIntent
  | DeleteUnitIntent
  | TogglePauseIntent;

export type AttackIntent = z.infer<typeof AttackIntentSchema>;
export type CancelAttackIntent = z.infer<typeof CancelAttackIntentSchema>;
export type SpawnIntent = z.infer<typeof SpawnIntentSchema>;
export type BoatAttackIntent = z.infer<typeof BoatAttackIntentSchema>;
export type EmbargoAllIntent = z.infer<typeof EmbargoAllIntentSchema>;
export type CancelBoatIntent = z.infer<typeof CancelBoatIntentSchema>;
export type AllianceRequestIntent = z.infer<typeof AllianceRequestIntentSchema>;
export type AllianceRejectIntent = z.infer<typeof AllianceRejectIntentSchema>;
export type BreakAllianceIntent = z.infer<typeof BreakAllianceIntentSchema>;
export type TargetPlayerIntent = z.infer<typeof TargetPlayerIntentSchema>;
export type EmojiIntent = z.infer<typeof EmojiIntentSchema>;
export type DonateGoldIntent = z.infer<typeof DonateGoldIntentSchema>;
export type DonateTroopsIntent = z.infer<typeof DonateTroopIntentSchema>;
export type EmbargoIntent = z.infer<typeof EmbargoIntentSchema>;
export type BuildUnitIntent = z.infer<typeof BuildUnitIntentSchema>;
export type UpgradeStructureIntent = z.infer<
  typeof UpgradeStructureIntentSchema
>;
export type MoveWarshipIntent = z.infer<typeof MoveWarshipIntentSchema>;
export type AllianceExtensionIntent = z.infer<
  typeof AllianceExtensionIntentSchema
>;
export type DeleteUnitIntent = z.infer<typeof DeleteUnitIntentSchema>;
export type TogglePauseIntent = z.infer<typeof TogglePauseIntentSchema>;

export type Turn = z.infer<typeof TurnSchema>;
export type GameConfig = z.infer<typeof GameConfigSchema>;

export type AllPlayersStats = z.infer<typeof AllPlayersStatsSchema>;
export type Player = z.infer<typeof PlayerSchema>;

export type GameStartInfo = z.infer<typeof GameStartInfoSchema>;

// Deliberately looser than MAX_USERNAME_LENGTH, which caps what the form will
// accept at 20. Widen freely; never narrow.
//
// Letters and digits the in-game name renderer can actually draw, plus the
// punctuation a name may carry. This is what lets José, Müller, Renée and
// Bjørn keep their names instead of falling back to a generated one.
//
// The bound is U+00FF — the end of Latin-1 Supplement — and it is set by the
// renderer twice over. Do not raise it without changing the renderer first:
//
//  1. The string path is 8-bit end to end. `TextLayout` writes
//     `charCodes[i] = text.charCodeAt(i)` into a `Uint8Array`, `DataTextures`
//     uploads it as `R8UI`/`UNSIGNED_BYTE`, and `name.vert.glsl` uses the
//     byte directly as the glyph index. Anything above 255 silently truncates
//     mod 256: Ł (U+0141) would draw as "A", ā (U+0101) as a code-0 slot the
//     shader drops while still consuming a layout position.
//  2. The atlas has no glyphs up there anyway. Of the 128 Latin Extended-A
//     entries in `resources/atlases/msdf-atlas.json`, exactly three (Œ œ Ÿ)
//     have a real glyph; the other 125 point at .notdef. All 64 Latin-1
//     Supplement entries are real.
//
// `CHAR_RANGE = 384` in the name-pass sizes the metrics and kerning tables, so
// it looks like the limit and is not — it is an upper bound on ids the atlas
// file may contain, not on what the string path can carry.
//
// Deliberately NOT every codepoint below the bound: that would admit control
// characters, the C1 block, and HTML-significant punctuation. The ranges skip
// × (U+00D7) and ÷ (U+00F7), maths symbols sitting inside the Latin-1 letter
// block, and the ordinal/micro signs.
//
// Emoji are excluded on purpose and stay excluded: the renderer draws them as
// a separate icon beside the name, never inline, so an emoji in the name
// itself has no glyph at all.
//
// Regex source for the character class, not a finished pattern: the engine
// schema and the free-form form rule need the same set in different shapes,
// and a single source is what keeps them from drifting apart by hand.
export const RENDERABLE_NAME_ALNUM =
  "a-zA-Z0-9\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u00FF";
export const RENDERABLE_NAME_CHARS = ` _.\\-${RENDERABLE_NAME_ALNUM}`;

// Requires at least one non-space so a name is never all padding.
export const UsernameSchema = z
  .string()
  .regex(new RegExp(`^(?=.*\\S)[${RENDERABLE_NAME_CHARS}]+$`, "u"))
  .min(3)
  .max(27);

export const ClanTagSchema = z
  .string()
  .regex(/^[a-zA-Z0-9]{2,5}$/)
  .nullable();

//
// Utility types
//

// select: encoding an untagged union without one costs a zod safeParse per
// rejected candidate (~10 µs each) — real money on schemas embedded in every
// GameConfig on the wire. The candidate ORDER is the wire layout; only the
// picking got cheaper.
const TEAM_COUNT_PRESETS = [Duos, Trios, Quads, HumansVsNations] as const;
const TeamCountConfigSchema = zb.union(
  [
    zb.uint(),
    z.literal(Duos),
    z.literal(Trios),
    z.literal(Quads),
    z.literal(HumansVsNations),
  ],
  {
    select: (v) =>
      typeof v === "number"
        ? 0
        : TEAM_COUNT_PRESETS.indexOf(v as (typeof TEAM_COUNT_PRESETS)[number]) +
          1,
  },
);
export type TeamCountConfig = z.infer<typeof TeamCountConfigSchema>;

// Doomsday Clock (anti-stall). Below a rising share of the map a player (or, in
// team modes, their whole team) gets skulled and their troops drain to zero. The
// required share rises in discrete waves per the `speed` preset (see
// DoomsdayClock.ts). Only `enabled` and `speed` are wire-configurable; the
// drain/warn tuning lives in DOOMSDAY_CLOCK_DEFAULTS (Config.ts).
export const DoomsdayClockConfigSchema = z.object({
  enabled: z.boolean().optional(),
  speed: z.enum(["slow", "normal", "fast", "veryfast"]).optional(),
});

// Overtime (anti-stalemate). After startMinutes of game time the tile share
// required to win drops steadily from the 80% base at a fixed rate (see
// OVERTIME_DEFAULTS in Config.ts), so the leading side eventually crosses the
// shrinking bar and a stalled game is guaranteed to end. Only `enabled` and
// `startMinutes` are wire-configurable.
export const OvertimeConfigSchema = z.object({
  enabled: z.boolean().optional(),
  startMinutes: zb.uint({ min: 1, max: 120 }).optional(),
});

export const GameConfigSchema = z.object({
  gameMap: z.enum(GameMapType),
  difficulty: z.enum(Difficulty),
  donateGold: z.boolean(), // Configures donations to humans only
  donateTroops: z.boolean(), // Configures donations to humans only
  gameType: z.enum(GameType),
  gameMode: z.enum(GameMode),
  gameMapSize: z.enum(GameMapSize),
  doomsdayClock: DoomsdayClockConfigSchema.optional(),
  overtime: OvertimeConfigSchema.optional(),
  nations: zb.union(
    [zb.uint({ min: 1, max: 400 }), z.enum(["default", "disabled"])],
    {
      select: (v) => (typeof v === "number" ? 0 : 1),
    },
  ),
  bots: zb.uint({ max: 400 }),
  infiniteGold: z.boolean(),
  infiniteTroops: z.boolean(),
  instantBuild: z.boolean(),
  disableNavMesh: z.boolean().optional(),
  disableAlliances: z.boolean().nullable().optional(),
  waterNukes: z.boolean().nullable().optional(),
  randomSpawn: z.boolean(),
  maxTimerValue: zb.uint({ min: 1, max: 120 }).nullable().optional(), // In minutes
  customAllianceDuration: zb.uint({ max: 15 }).nullable().optional(), // In minutes; 0 disables alliances
  spawnImmunityDuration: zb.uint().nullable().optional(), // In ticks
  disabledUnits: z.enum(UnitType).array().optional(),
  playerTeams: TeamCountConfigSchema.optional(),
  goldMultiplier: zb.float({ min: 0.1, max: 1000 }).nullable().optional(),
  startingGold: zb.uint({ max: 1000000000 }).nullable().optional(),
});

export const TeamSchema = z.string();

export const SafeString = z
  .string()
  .regex(
    /^([a-zA-Z0-9\s.,!?@#$%&*()\-_+=[\]{}|;:"'/\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff]|[üÜ])*$/u,
  )
  .max(1000);

export const emojiTable = [
  ["😀", "😊", "🥰", "😇", "😎"],
  ["😞", "🥺", "😭", "😱", "😡"],
  ["😈", "🤡", "🥱", "🫡", "🖕"],
  ["👋", "👏", "✋", "🙏", "💪"],
  ["👍", "👎", "🫴", "🤌", "🤦‍♂️"],
  ["🤝", "🆘", "🕊️", "🏳️", "⏳"],
  ["🔥", "💥", "💀", "☢️", "⚠️"],
  ["↖️", "⬆️", "↗️", "👑", "🥇"],
  ["⬅️", "🎯", "➡️", "🥈", "🥉"],
  ["↙️", "⬇️", "↘️", "❤️", "💔"],
  ["💰", "⚓", "⛵", "🏡", "🛡️"],
  ["🏭", "🚂", "❓", "🐔", "🐀"],
] as const;

// 2d to 1d array
export const flattenedEmojiTable = emojiTable.flat();

export type Emoji = (typeof flattenedEmojiTable)[number];

const EmojiSchema = zb.uint({ max: flattenedEmojiTable.length - 1 });

export const GAME_ID_REGEX = /^[A-Za-z0-9]{8,10}$/;

export const ID = z.string().regex(GAME_ID_REGEX);

// zbin dictionary for player clientIDs. Validates exactly like ID.
export const CLIENT_ID_MAPPING = "clientId";
export const MappedID = zb.mapped(CLIENT_ID_MAPPING, { regex: GAME_ID_REGEX });

export const AllPlayersStatsSchema = z.record(ID, PlayerStatsSchema);

//
// Intents
//

export const AllianceExtensionIntentSchema = z.object({
  type: z.literal("allianceExtension"),
  recipient: MappedID,
});

export const AttackIntentSchema = z.object({
  type: z.literal("attack"),
  targetID: MappedID.nullable(),
  troops: zb.float({ min: 0 }).nullable(),
});

export const SpawnIntentSchema = z.object({
  type: z.literal("spawn"),
  // A TileRef indexes the typed-array terrain buffers, so it must be a
  // non-negative integer. Fractional refs silently corrupt those lookups.
  tile: zb.uint(),
});

export const BoatAttackIntentSchema = z.object({
  type: z.literal("boat"),
  // Not an int: troops are fractional throughout the sim (attackRatio *
  // troops(), combat attrition), and the client sends the raw float.
  troops: zb.float({ min: 0 }),
  dst: zb.uint(),
});

export const AllianceRequestIntentSchema = z.object({
  type: z.literal("allianceRequest"),
  recipient: MappedID,
});

export const AllianceRejectIntentSchema = z.object({
  type: z.literal("allianceReject"),
  requestor: MappedID,
});

export const BreakAllianceIntentSchema = z.object({
  type: z.literal("breakAlliance"),
  recipient: MappedID,
});

export const TargetPlayerIntentSchema = z.object({
  type: z.literal("targetPlayer"),
  target: MappedID,
});

export const EmojiIntentSchema = z.object({
  type: z.literal("emoji"),
  recipient: zb.union([MappedID, z.literal(AllPlayers)], {
    select: (v) => (v === AllPlayers ? 1 : 0),
  }),
  emoji: EmojiSchema,
});

export const EmbargoIntentSchema = z.object({
  type: z.literal("embargo"),
  targetID: MappedID,
  action: z.union([z.literal("start"), z.literal("stop")]),
});

export const EmbargoAllIntentSchema = z.object({
  type: z.literal("embargo_all"),
  action: z.union([z.literal("start"), z.literal("stop")]),
});

export const DonateGoldIntentSchema = z.object({
  type: z.literal("donate_gold"),
  recipient: MappedID,
  gold: zb.float({ min: 0 }).nullable(),
});

export const DonateTroopIntentSchema = z.object({
  type: z.literal("donate_troops"),
  recipient: MappedID,
  troops: zb.float({ min: 0 }).nullable(),
});

export const BuildUnitIntentSchema = z.object({
  type: z.literal("build_unit"),
  unit: z.enum(UnitType),
  tile: zb.uint(),
  rocketDirectionUp: z.boolean().optional(),
  amount: zb.uint({ min: 1, max: MAX_UPGRADE_AMOUNT }).optional(),
});

export const UpgradeStructureIntentSchema = z.object({
  type: z.literal("upgrade_structure"),
  unit: z.enum(UnitType),
  unitId: zb.uint(),
  amount: zb.uint({ min: 1, max: MAX_UPGRADE_AMOUNT }).optional(),
});

export const CancelAttackIntentSchema = z.object({
  type: z.literal("cancel_attack"),
  attackID: z.string(),
});

export const CancelBoatIntentSchema = z.object({
  type: z.literal("cancel_boat"),
  unitID: zb.uint(),
});

export const MoveWarshipIntentSchema = z.object({
  type: z.literal("move_warship"),
  unitIds: z.array(zb.int()).nonempty(),
  tile: zb.uint(),
});

export const DeleteUnitIntentSchema = z.object({
  type: z.literal("delete_unit"),
  unitId: zb.uint(),
});

export const TogglePauseIntentSchema = z.object({
  type: z.literal("toggle_pause"),
  paused: z.boolean().default(false),
});

export const IntentSchema = z.discriminatedUnion("type", [
  AttackIntentSchema,
  CancelAttackIntentSchema,
  SpawnIntentSchema,
  BoatAttackIntentSchema,
  CancelBoatIntentSchema,
  AllianceRequestIntentSchema,
  AllianceRejectIntentSchema,
  BreakAllianceIntentSchema,
  TargetPlayerIntentSchema,
  EmojiIntentSchema,
  DonateGoldIntentSchema,
  DonateTroopIntentSchema,
  BuildUnitIntentSchema,
  UpgradeStructureIntentSchema,
  EmbargoIntentSchema,
  EmbargoAllIntentSchema,
  MoveWarshipIntentSchema,
  AllianceExtensionIntentSchema,
  DeleteUnitIntentSchema,
  TogglePauseIntentSchema,
]);

// StampedIntent = Intent with the clock-stamped clientID (used in turns and execution)
export const StampedIntentSchema = zb.stamped(IntentSchema, {
  clientID: MappedID,
});
export type StampedIntent = Intent & { clientID: ClientID };

//
// Game utility types
//

export const TurnSchema = z.object({
  turnNumber: zb.uint(),
  intents: StampedIntentSchema.array(),
  // The hash of the game state at the end of the turn.
  hash: zb.float().nullable().optional(),
});

export const PlayerSchema = z.object({
  clientID: ID,
  username: UsernameSchema,
  clanTag: ClanTagSchema,
});

export const GameStartInfoSchema = z.object({
  gameID: ID,
  lobbyCreatedAt: zb.uint(),
  config: GameConfigSchema,
  players: PlayerSchema.array(),
});

export const WinnerSchema = z
  .union([
    z.tuple([z.literal("player"), ID]).rest(ID),
    z.tuple([z.literal("team"), SafeString]).rest(ID),
    z.tuple([z.literal("nation"), SafeString]).rest(ID),
  ])
  .optional();
export type Winner = z.infer<typeof WinnerSchema>;
