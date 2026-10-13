import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_USERNAME_LENGTH } from "../src/client/validations/username";

// Partial: only translateText is stubbed (echoing keys so assertions read as
// i18n keys). The rest of Utils stays real.
vi.mock("../src/client/Utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/client/Utils")>()),
  translateText: (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
}));

// Side-effect import registers <username-input>; vi.mock is hoisted above it.
import "../src/client/UsernameInput";
import type { UsernameInput as UsernameInputEl } from "../src/client/UsernameInput";

async function mount(): Promise<UsernameInputEl> {
  const el = document.createElement("username-input") as UsernameInputEl;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

async function type(el: UsernameInputEl, value: string) {
  const input = el.querySelector<HTMLInputElement>("input")!;
  input.value = value;
  input.dispatchEvent(new Event("input"));
  await el.updateComplete;
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
});

describe("UsernameInput", () => {
  it("starts on a generated Anon name when nothing is stored", async () => {
    const el = await mount();
    expect(el.getUsername().startsWith("Anon")).toBe(true);
    expect(el.canPlay()).toBe(true);
    expect(localStorage.getItem("username")).toBe(el.getUsername());
  });

  it("shows and keeps the stored name", async () => {
    localStorage.setItem("username", "Ada");
    const el = await mount();
    expect(el.getUsername()).toBe("Ada");
    expect(el.querySelector<HTMLInputElement>("input")!.value).toBe("Ada");
  });

  it("trims a stored name that predates the length cap", async () => {
    localStorage.setItem("username", "a".repeat(MAX_USERNAME_LENGTH + 5));
    const el = await mount();
    expect(el.getUsername()).toBe("a".repeat(MAX_USERNAME_LENGTH));
    expect(el.canPlay()).toBe(true);
  });

  it("stores a valid name as it is typed", async () => {
    const el = await mount();
    await type(el, "Grace");
    expect(el.getUsername()).toBe("Grace");
    expect(localStorage.getItem("username")).toBe("Grace");
    expect(el.canPlay()).toBe(true);
  });

  it("blocks play and explains why while the name is invalid", async () => {
    const el = await mount();
    await type(el, "ab");
    expect(el.canPlay()).toBe(false);
    expect(
      el.querySelector("#username-validation-error")?.textContent,
    ).toContain("username.too_short");
    // The invalid draft is not stored over the last good name.
    expect(localStorage.getItem("username")).not.toBe("ab");
  });

  it("announces whether the player can play whenever validity changes", async () => {
    const seen: boolean[] = [];
    window.addEventListener("username-validity-change", (e) =>
      seen.push((e as CustomEvent<{ isValid: boolean }>).detail.isValid),
    );
    const el = await mount();
    await type(el, "x");
    await type(el, "Valid Name");
    expect(seen[seen.length - 1]).toBe(true);
    expect(seen).toContain(false);
  });

  it("strips square brackets, which would break the clan-tag display", async () => {
    const toasts: string[] = [];
    window.addEventListener("show-message", (e) =>
      toasts.push((e as CustomEvent<{ message: string }>).detail.message),
    );
    const el = await mount();
    await type(el, "Ada[x]");
    expect(el.getUsername()).toBe("Adax");
    expect(toasts).toEqual(["username.invalid_chars"]);
  });
});
