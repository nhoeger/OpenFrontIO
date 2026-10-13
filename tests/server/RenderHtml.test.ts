import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAppShellContentCache,
  renderHtmlContent,
} from "../../src/server/RenderHtml";
import { ServerEnv } from "../../src/server/ServerEnv";

// The server's only job is to render the app shell and serve static files, so
// the shell's injected page values are what is worth pinning.
describe("renderHtmlContent", () => {
  let dir: string;
  let template: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "render-html-"));
    template = path.join(dir, "index.html");
    await fs.writeFile(
      template,
      [
        "<script>window.BOOTSTRAP_CONFIG = {",
        "  gitCommit: <%- gitCommit %>,",
        "  cdnBase: <%- cdnBase %>,",
        "  gameEnv: <%- gameEnv %>,",
        "};</script>",
        '<script src="<%- cdnBaseRaw %>/assets/app.js"></script>',
        '<link rel="icon" href="<%- faviconHref %>" />',
      ].join("\n"),
    );
    clearAppShellContentCache();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("injects the build and environment into the page", async () => {
    vi.stubEnv("GAME_ENV", "dev");
    vi.stubEnv("GIT_COMMIT", "abc1234");
    vi.stubEnv("CDN_BASE", "https://cdn.example.com");

    const html = await renderHtmlContent(template);

    expect(html).toContain('gitCommit: "abc1234"');
    expect(html).toContain('cdnBase: "https://cdn.example.com"');
    expect(html).toContain('gameEnv: "dev"');
    expect(html).toContain(
      '<script src="https://cdn.example.com/assets/app.js">',
    );
  });

  it("serves assets from the same origin when no CDN is configured", async () => {
    vi.stubEnv("CDN_BASE", "");

    const html = await renderHtmlContent(template);

    expect(html).toContain('cdnBase: ""');
    expect(html).toContain('<script src="/assets/app.js">');
  });

  it("carries no server, account or lobby values", async () => {
    const html = await renderHtmlContent(template);
    for (const name of [
      "cluster",
      "instanceLetter",
      "serverHost",
      "turnstileSiteKey",
      "jwtAudience",
    ]) {
      expect(html).not.toContain(name);
    }
  });
});

describe("ServerEnv", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("listens on port 3000 unless PORT says otherwise", () => {
    vi.stubEnv("PORT", "");
    expect(ServerEnv.port()).toBe(3000);
    vi.stubEnv("PORT", "8080");
    expect(ServerEnv.port()).toBe(8080);
  });

  it("rejects a malformed PORT", () => {
    vi.stubEnv("PORT", "abc");
    expect(() => ServerEnv.port()).toThrow(/Invalid PORT/);
    vi.stubEnv("PORT", "70000");
    expect(() => ServerEnv.port()).toThrow(/Invalid PORT/);
  });

  it("falls back to 'unknown' without a commit", () => {
    vi.stubEnv("GIT_COMMIT", "");
    expect(ServerEnv.gitCommit()).toBe("unknown");
    vi.stubEnv("GIT_COMMIT", "deadbee");
    expect(ServerEnv.gitCommit()).toBe("deadbee");
  });
});
