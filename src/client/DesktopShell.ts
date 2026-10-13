// The Electron desktop (Steam) shell exposes this global via a contextBridge
// preload script — see openfront-desktop's src/preload/preload.ts. Its mere
// presence is a reliable signal we're running inside that shell, since only
// the desktop build's preload script ever sets it.
declare global {
  interface Window {
    openfrontDesktop?: unknown;
  }
}

export function isDesktopShell(): boolean {
  return typeof window !== "undefined" && window.openfrontDesktop !== undefined;
}

// The shell's own version, distinct from the game version this client was
// built from. Narrowed locally rather than re-declaring the global -- see
// SteamSDK.ts for why (TS2717).
type VersionBridge = { version?: () => Promise<string> };

// The locale the player's Steam implies. A plain VALUE, not a function, unlike
// every other member of this bridge: the shell reads it from Steam once at
// startup and passes it into the window, so it is fixed for the window's life
// and needs no IPC round trip. That matters because the shell's own account
// gate reads it while painting its first screen.
type LocaleBridge = { steamLocale?: unknown };

/**
 * The locale Steam reports for this player, or null if it reports none.
 *
 * Null and "not on desktop" are deliberately the same answer: both mean
 * "nothing better than the browser's own locale is known", which is exactly
 * what the caller should then fall back to. Steam being absent, Steam
 * declining to answer, and running on the web are not worth distinguishing
 * here -- they lead to the same behaviour.
 *
 * Validated rather than trusted despite coming from our own shell. It arrives
 * as a process-argv string (see the shell's preload) and is about to be
 * interpolated into an asset URL by loadLanguage, so a hostile or merely
 * malformed value should not get that far. A BCP-47-shaped tag is all this
 * ever needs to be.
 */
export function desktopSteamLocale(): string | null {
  const desktop = window.openfrontDesktop as LocaleBridge | undefined;
  const locale = desktop?.steamLocale;
  if (typeof locale !== "string") return null;
  // Shape first, then BCP-47 proper. The regex alone accepts tags that are
  // well-shaped but not real -- "en-12", whose second subtag is neither a
  // region (two alpha, or three digits) nor a variant (5-8 alphanumerics, or
  // four starting with a digit). getClosestSupportedLang would then narrow it
  // to "en" on its first two characters, so a malformed value from the shell
  // would silently beat a perfectly good navigator.language.
  //
  // getCanonicalLocales throws on anything structurally invalid, which is the
  // real check; the regex stays in front of it because it is what rejects the
  // path- and identifier-shaped inputs explicitly, rather than incidentally.
  if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(locale)) return null;
  try {
    Intl.getCanonicalLocales(locale);
  } catch {
    return null;
  }
  // The ORIGINAL, not the canonicalised form: this value is matched against
  // the codes in metadata.json, and canonicalisation is free to rewrite case
  // and aliases in ways that list does not follow.
  return locale;
}

// The version label is purely cosmetic and must never block client
// initialisation. The bridge below is implemented in a different (private)
// repository, so this public repo cannot enforce that its version() call
// ever settles -- race it against a short timeout and fall back to null if
// the timeout wins. 500ms is ample for an IPC round trip.
const DESKTOP_VERSION_TIMEOUT_MS = 500;

export async function desktopVersion(): Promise<string | null> {
  const desktop = window.openfrontDesktop as VersionBridge | undefined;
  if (!desktop?.version) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), DESKTOP_VERSION_TIMEOUT_MS);
  });
  try {
    return await Promise.race([desktop.version(), timeout]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Composes the version label shown in the nav bar. On Steam the game version
 * stays primary so a player's version reads the same across web and Steam,
 * with the shell version as subtext: "v0.33.1 (Steam v0.2.0)".
 */
export function composeVersionDisplay(
  gameVersion: string,
  shellVersion: string | null,
): string {
  if (!shellVersion) return gameVersion;
  const trimmed = shellVersion.trim();
  if (trimmed === "") return gameVersion;
  // Prefixed only when the value looks like a bare version. The shell reports
  // its 7-char commit on an untagged build (OPE-358), and "va1b2c3d" reads as
  // a version that does not exist. Conditional rather than dropped outright
  // so an older shell -- which always answers "0.2.0" -- still renders
  // "v0.2.0": the two repositories update on separate schedules, so both
  // shapes are live at once.
  const withV = /^\d+\.\d+\.\d+/.test(trimmed) ? `v${trimmed}` : trimmed;
  return `${gameVersion} (Steam ${withV})`;
}

/**
 * The shell's in-app exit (OPE-402).
 *
 * The desktop window opens borderless by default since OPE-173, which removes
 * the title bar, and the menu bar is hidden — so the OS offers the player no
 * visible way out. F11 back to windowed and Alt+F4 both still work, but
 * neither is discoverable, and Steam players expect a Quit item in the game's
 * own UI regardless.
 *
 * Null on the web, on CrazyGames and on any shell older than the one that
 * introduced `quit()` (`shell.api` 4) — the same degrade-don't-break contract
 * desktopDisplay() keeps, and for the same reason: the
 * shell ships in the Steam depot on Steam's schedule while this client updates
 * at runtime, so a client newer than its shell is ordinary.
 *
 * FEATURE DETECTION ON THE METHOD, not on `shell.api` — the rule
 * desktopDisplay() already applies. A rename on the shell side then hides the
 * control rather than wiring a button to nothing.
 */
export interface DesktopQuitBridge {
  quit: () => Promise<void>;
}

export function desktopQuit(): DesktopQuitBridge | null {
  if (typeof window === "undefined") return null;
  const desktop = window.openfrontDesktop as { quit?: unknown } | undefined;
  return typeof desktop?.quit === "function"
    ? (desktop as DesktopQuitBridge)
    : null;
}

/**
 * Asks the shell to quit, and swallows everything.
 *
 * The invoke MAY NEVER SETTLE: the main process begins shutting down inside
 * its handler, so this renderer is usually destroyed before a reply can come
 * back. Awaiting it in a click handler would leave the caller hanging forever
 * on the success path, and an unhandled rejection on the failure one.
 *
 * There is deliberately nothing to report back. A shell that refuses to quit
 * leaves the player exactly where they were, with the window they can still
 * close by every other means; a spinner or an error toast for it would be a
 * UI for a state that has no remedy.
 */
export function requestDesktopQuit(): void {
  const bridge = desktopQuit();
  if (bridge === null) return;
  try {
    void bridge.quit().catch(() => {});
  } catch {
    // A bridge that throws synchronously rather than rejecting.
  }
}
