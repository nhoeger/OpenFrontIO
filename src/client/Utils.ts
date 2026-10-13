import { MessageType, Team } from "@openfront/engine-api/game/GameTypes";
import IntlMessageFormat from "intl-messageformat";
import type { LangSelector } from "./LangSelector";

export const TUTORIAL_VIDEO_URL = "https://www.youtube.com/embed/7J5zwb_s_Cg";

// The desktop shell cannot embed YouTube inside Electron, so it bundles the
// same tutorial and serves it under a reserved prefix of its app:// scheme
// (see openfront-desktop's protocol.ts, which pins this path with a test).
// Only meaningful when Platform.isElectron; on the web this path does not
// exist.
export const DESKTOP_TUTORIAL_VIDEO_URL = "/__tutorial/tutorial.webm";

export function renderDuration(totalSeconds: number): string {
  // Floor once so fractional inputs don't leak through to the seconds
  // component (e.g. `0.5` → `"0.5s"`).
  const whole = Math.floor(totalSeconds);
  if (whole <= 0) return `0${translateText("common.duration_second_short")}`;
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;
  // Build largest-first, dropping trailing-zero components so 3600s reads
  // as "1h" rather than "1h 0min 0s", and 60s as "1min" rather than
  // "1min 0s". Sub-minute durations still surface seconds.
  const parts: string[] = [];
  if (hours > 0)
    parts.push(`${hours}${translateText("common.duration_hour_short")}`);
  if (minutes > 0)
    parts.push(`${minutes}${translateText("common.duration_minute_short")}`);
  if (seconds > 0 || parts.length === 0)
    parts.push(`${seconds}${translateText("common.duration_second_short")}`);
  return parts.join(" ");
}

export function formatPercentage(value: number): string {
  const perc = value * 100;
  if (Number.isNaN(perc)) return "0%";
  return perc.toFixed(1) + "%";
}

/**
 * Formats a keyboard key code for user-friendly display.
 * Handles empty values, spaces, and normalizes key codes like "Digit1" and "KeyA".
 *
 * @param value - The key code to format (e.g., "Digit1", "KeyA", "Space")
 * @returns The formatted key for display (e.g., "1", "A", "Space")
 *
 * @example
 * formatKeyForDisplay("Digit5") // returns "5"
 * formatKeyForDisplay("KeyA") // returns "A"
 * formatKeyForDisplay("Space") // returns "Space"
 * formatKeyForDisplay(" ") // returns "Space"
 * formatKeyForDisplay("ArrowUp") // returns "Arrowup"
 * formatKeyForDisplay("") // returns ""
 */
export function formatKeyForDisplay(value: string): string {
  // Handle empty string
  if (!value) return "";

  // Handle Shift+ prefix: format as "Shift+X"
  if (value.startsWith("Shift+")) {
    return "Shift+" + formatKeyForDisplay(value.slice(6));
  }

  // Handle space character or "Space" key
  if (value === " " || value === "Space") return "Space";

  // Handle DigitN pattern (e.g., "Digit1" -> "1")
  if (/^Digit\d$/.test(value)) {
    return value.replace("Digit", "");
  }

  // Handle KeyX pattern (e.g., "KeyA" -> "A")
  if (/^Key[A-Z]$/.test(value)) {
    return value.replace("Key", "");
  }

  // Fallback: capitalize first letter
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function createCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");

  // Set canvas style to fill the screen
  canvas.style.position = "fixed";
  canvas.style.left = "0";
  canvas.style.top = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.touchAction = "none";

  return canvas;
}

export function formatDebugTranslation(
  key: string,
  params: Record<string, string | number>,
): string {
  const entries = Object.entries(params);
  if (entries.length === 0) return key;
  const serializedParams = entries
    .map(([paramKey, value]) => `${paramKey}=${String(value)}`)
    .join(",");
  return `${key}::${serializedParams}`;
}

const EMPTY_TRANSLATION_PARAMS: Record<string, string | number> = {};

function getCachedLangSelector(): LangSelector | null {
  const self = translateText as any;
  const cached = self.langSelector as LangSelector | null | undefined;
  if (cached && cached.isConnected) return cached;

  // A lit update is scheduled on a microtask, so a component can render once
  // more after its environment has gone -- which in tests means `document` is
  // no longer defined by the time this runs. Returning null makes
  // translateText fall back to the key instead of throwing an unhandled
  // rejection that fails the whole run.
  if (typeof document === "undefined") {
    self.langSelector = null;
    return null;
  }

  const found = document.querySelector("lang-selector") as LangSelector | null;
  self.langSelector = found ?? null;
  return found;
}

/** Language codes whose script reads right-to-left (resources/lang/metadata.json). */
const RTL_LANGUAGES = new Set(["ar", "fa", "he"]);

/**
 * True when the given language renders right-to-left. Defaults to the
 * currently selected UI language, so callers can simply write `isRTL()`.
 */
export const isRTL = (lang?: string): boolean => {
  const code = (lang ?? getCachedLangSelector()?.currentLang ?? "en").split(
    "-",
  )[0];
  return RTL_LANGUAGES.has(code);
};

/**
 * Value for the HTML `dir` attribute matching the current UI language.
 * Apply it to containers whose text comes from translateText() so Persian,
 * Arabic and Hebrew render right-to-left with correct mixed-content ordering.
 */
export const textDirection = (): "rtl" | "ltr" => (isRTL() ? "rtl" : "ltr");

export const translateText = (
  key: string,
  params?: Record<string, string | number>,
): string => {
  const self = translateText as any;
  self.formatterCache ??= new Map();
  self.lastLang ??= null;

  const langSelector = getCachedLangSelector();
  if (!langSelector) {
    return key;
  }

  const resolvedParams = params ?? EMPTY_TRANSLATION_PARAMS;

  if (langSelector.currentLang === "debug") {
    return formatDebugTranslation(key, resolvedParams);
  }

  const translations = langSelector.translations;
  const defaultTranslations = langSelector.defaultTranslations;
  if (!translations && !defaultTranslations) return key;

  if (self.lastLang !== langSelector.currentLang) {
    self.formatterCache.clear();
    self.lastLang = langSelector.currentLang;
  }

  let message = translations?.[key];
  const hasPrimaryTranslation = message !== undefined;

  message ??= defaultTranslations?.[key];

  if (message === undefined) return key;

  // Fast path: no params and no ICU placeholders.
  if (
    resolvedParams === EMPTY_TRANSLATION_PARAMS &&
    message.indexOf("{") === -1
  ) {
    return message;
  }

  try {
    const locale =
      !hasPrimaryTranslation && langSelector.currentLang !== "en"
        ? "en"
        : langSelector.currentLang;
    const cacheKey = `${key}:${locale}:${message}`;
    let formatter = self.formatterCache.get(cacheKey);

    if (!formatter) {
      formatter = new IntlMessageFormat(message, locale);
      self.formatterCache.set(cacheKey, formatter);
    }

    return formatter.format(resolvedParams) as string;
  } catch (e) {
    console.warn("ICU format error", e);
    return message;
  }
};

export interface HasClanTag {
  clanTag?: string | null | (() => string | null);
}

type TopClans = {
  topTag: string | null;
  topCount: number;
  secondTag: string | null;
  secondCount: number;
  thirdCount: number;
};

function getTopClans(players: readonly HasClanTag[]): TopClans {
  const counts = new Map<string, number>();
  for (const p of players) {
    const tag = typeof p.clanTag === "function" ? p.clanTag() : p.clanTag;
    if (tag && tag.trim().length > 0) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  let topTag: string | null = null,
    topCount = 0;
  let secondTag: string | null = null,
    secondCount = 0;
  let thirdCount = 0;

  for (const [tag, count] of counts) {
    if (count > topCount) {
      thirdCount = secondCount;
      secondTag = topTag;
      secondCount = topCount;
      topTag = tag;
      topCount = count;
    } else if (count > secondCount) {
      thirdCount = secondCount;
      secondTag = tag;
      secondCount = count;
    } else if (count > thirdCount) {
      thirdCount = count;
    }
  }
  return { topTag, topCount, secondTag, secondCount, thirdCount };
}

export function resolveTeamClanTag(
  players: Iterable<HasClanTag>,
): string | null {
  const list = Array.isArray(players) ? players : Array.from(players);
  const n = list.length;
  if (n === 0) return null;

  const { topTag, topCount, secondTag, secondCount, thirdCount } =
    getTopClans(list);

  if (topTag && topCount > n / 2) {
    return topTag;
  }
  if (
    topTag &&
    secondTag &&
    secondCount > thirdCount &&
    (topCount + secondCount) / n >= 0.7 &&
    secondCount / n >= 0.3
  ) {
    return [topTag, secondTag].sort().join(" / ");
  }
  return null;
}

export function getTranslatedPlayerTeamLabel(
  team: Team | null,
  clanTag?: string | null,
): string {
  if (!team) return "";
  if (clanTag) {
    return `[${clanTag}]`;
  }
  const translationKey = `team_colors.${team.toLowerCase()}`;
  const translated = translateText(translationKey);
  return translated === translationKey ? team : translated;
}

export const severityColors: Record<string, string> = {
  fail: "text-red-400",
  warn: "text-yellow-400",
  success: "text-green-400",
  info: "text-gray-200",
  blue: "text-blue-400",
  white: "text-white",
};

/**
 * Maps a message type to the Tailwind text-color class of its severity.
 */
export function getMessageTypeClasses(type: MessageType): string {
  switch (type) {
    case MessageType.SAM_HIT:
    case MessageType.CAPTURED_ENEMY_UNIT:
    case MessageType.CONQUERED_PLAYER:
    case MessageType.ALLIANCE_ACCEPTED:
      return severityColors["success"];
    case MessageType.ATTACK_FAILED:
    case MessageType.ALLIANCE_REJECTED:
    case MessageType.ALLIANCE_BROKEN:
    case MessageType.UNIT_DESTROYED:
    case MessageType.NUKE_DETONATED:
      return severityColors["fail"];
    case MessageType.ATTACK_CANCELLED:
    case MessageType.ATTACK_REQUEST:
    case MessageType.DONATION_SENT:
    case MessageType.DONATION_RECEIVED:
      return severityColors["blue"];
    case MessageType.MIRV_INBOUND:
    case MessageType.NUKE_INBOUND:
    case MessageType.HYDROGEN_BOMB_INBOUND:
    case MessageType.SAM_MISS:
    case MessageType.ALLIANCE_EXPIRED:
    case MessageType.NAVAL_INVASION_INBOUND:
    case MessageType.RENEW_ALLIANCE:
      return severityColors["warn"];
    case MessageType.CHAT:
    case MessageType.ALLIANCE_REQUEST:
      return severityColors["info"];
    default:
      console.warn(`Message type ${type} has no explicit color`);
      return severityColors["white"];
  }
}

export function getGamesPlayed(): number {
  try {
    return parseInt(localStorage.getItem("gamesPlayed") ?? "0", 10) || 0;
  } catch (error) {
    console.warn("Failed to read games played from localStorage:", error);
    return 0;
  }
}

export function incrementGamesPlayed(): void {
  try {
    localStorage.setItem("gamesPlayed", (getGamesPlayed() + 1).toString());
  } catch (error) {
    console.warn("Failed to increment games played in localStorage:", error);
  }
}

export async function getSvgAspectRatio(src: string): Promise<number | null> {
  const self = getSvgAspectRatio as any;
  self.svgAspectRatioCache ??= new Map();

  const cached = self.svgAspectRatioCache.get(src);
  if (cached !== undefined) return cached;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(src, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
    const text = await resp.text();

    // Try parse viewBox
    const vbMatch = text.match(/viewBox="([^"]+)"/i);
    if (vbMatch) {
      const parts = vbMatch[1]
        .trim()
        .split(/[\s,]+/)
        .map(Number);
      if (parts.length === 4 && parts.every((n) => !Number.isNaN(n))) {
        const [, , vbW, vbH] = parts;
        if (vbW > 0 && vbH > 0) {
          const ratio = vbW / vbH;
          self.svgAspectRatioCache.set(src, ratio);
          return ratio;
        }
      }
    }

    // Fallback to width/height attributes (may be with units; strip px)
    const widthMatch = text.match(/<svg[^>]*\swidth="([^"]+)"/i);
    const heightMatch = text.match(/<svg[^>]*\sheight="([^"]+)"/i);
    if (widthMatch && heightMatch) {
      const parseNum = (s: string) => Number(s.replace(/[^0-9.]/g, ""));
      const w = parseNum(widthMatch[1]);
      const h = parseNum(heightMatch[1]);
      if (w > 0 && h > 0) {
        const ratio = w / h;
        self.svgAspectRatioCache.set(src, ratio);
        return ratio;
      }
    }
    // Not an SVG or no usable metadata
  } catch (e) {
    // fetch may fail due to CORS or non-SVG..
  }

  const imgRatio = await new Promise<number | null>((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        resolve(img.naturalWidth / img.naturalHeight);
      } else {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });

  if (imgRatio !== null) {
    self.svgAspectRatioCache.set(src, imgRatio);
    return imgRatio;
  }

  return null;
}

export function showToast(
  message: string,
  color: "red" | "green",
  duration = 3500,
): void {
  window.dispatchEvent(
    new CustomEvent("show-message", {
      detail: { message, color, duration },
    }),
  );
}

/** Where "leave to the menu" navigations should land. */
export function homeHref(): string {
  return "/";
}
