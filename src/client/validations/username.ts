import {
  RENDERABLE_NAME_CHARS,
  UsernameSchema,
} from "@openfront/engine-api/Schemas";
import { translateText } from "../Utils";

export const MIN_USERNAME_LENGTH = 3;
// Enforced here rather than in UsernameSchema, which stays wide enough to read
// any name the engine is given. A stored name from before the cap is trimmed
// to fit rather than rejected (see clampUsername in PlayerName).
export const MAX_USERNAME_LENGTH = 20;

// Characters a player may type for themselves: everything the in-game name
// renderer can draw (see RENDERABLE_NAME_CHARS). Equal to the engine schema's
// charset today.
//
// Kept as its own pattern rather than folded into UsernameSchema so the form
// rule can narrow without changing what the engine accepts. Both are built
// from the one source so they cannot drift by hand.
const FREE_FORM_USERNAME_PATTERN = new RegExp(
  `^[${RENDERABLE_NAME_CHARS}]+$`,
  "u",
);

export function validateUsername(username: string): {
  isValid: boolean;
  error?: string;
} {
  // Checked ahead of the schema, which stays wide enough for archived records.
  if (typeof username === "string" && username.length > MAX_USERNAME_LENGTH) {
    return {
      isValid: false,
      error: translateText("username.too_long", { max: MAX_USERNAME_LENGTH }),
    };
  }

  const parsed = UsernameSchema.safeParse(username);

  if (!parsed.success) {
    const errType = parsed.error.issues[0].code;

    if (errType === "invalid_type") {
      return { isValid: false, error: translateText("username.not_string") };
    }

    if (errType === "too_small") {
      return {
        isValid: false,
        error: translateText("username.too_short", {
          min: MIN_USERNAME_LENGTH,
        }),
      };
    }

    if (errType === "too_big") {
      return {
        isValid: false,
        error: translateText("username.too_long", {
          max: MAX_USERNAME_LENGTH,
        }),
      };
    }

    // Invalid regex, or any other issue
    else {
      return { isValid: false, error: translateText("username.invalid_chars") };
    }
  }

  // The schema's own charset is deliberately wider (see the pattern above), so
  // the form's rule is applied separately rather than inherited from it.
  if (!FREE_FORM_USERNAME_PATTERN.test(username)) {
    return { isValid: false, error: translateText("username.invalid_chars") };
  }

  // All checks passed
  return { isValid: true };
}
