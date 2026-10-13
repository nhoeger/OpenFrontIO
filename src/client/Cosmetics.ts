import type { Cosmetics } from "@openfront/shared/CosmeticSchemas";

/**
 * The cosmetics catalog used to come from the online API. There is no catalog
 * offline, so nothing is ever loaded and every player renders with the default
 * look.
 */
export function getCachedCosmetics(): Cosmetics | null {
  return null;
}
