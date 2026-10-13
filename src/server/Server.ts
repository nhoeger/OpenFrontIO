import * as dotenv from "dotenv";
import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { renderAppShell } from "./RenderHtml";
import { ServerEnv } from "./ServerEnv";
import { applyStaticAssetCacheControl } from "./StaticAssetCache";

// Load environment variables before we read configuration values derived from them.
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const staticDir = path.join(__dirname, "../../static");
const indexPath = path.join(staticDir, "index.html");

// The game runs entirely in the browser, so the server only hands out the app
// shell and the built static assets.
const app = express();

app.get("/", async (_req, res) => {
  try {
    await renderAppShell(res, indexPath);
  } catch (error) {
    console.error("Error rendering index.html:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.use(
  express.static(staticDir, {
    maxAge: "1y",
    setHeaders: (res) => {
      applyStaticAssetCacheControl(
        res.setHeader.bind(res),
        res.req.originalUrl,
      );
    },
  }),
);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// SPA fallback route
app.get("/{*splat}", async (_req, res) => {
  try {
    await renderAppShell(res, indexPath);
  } catch (error) {
    console.error("Error rendering SPA fallback:", error);
    res.status(500).send("Internal Server Error");
  }
});

const server = http.createServer(app);
const port = ServerEnv.port();
server.listen(port, () => {
  console.log(`OpenFront listening on port ${port}`);
});
