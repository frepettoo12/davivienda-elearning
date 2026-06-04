/**
 * Servidor del Modo Agente. Expone POST /agent/edit con respuesta en streaming
 * (Server-Sent Events) para mostrar el progreso del agente en vivo en el frontend.
 *
 * Fase 0/2: corre sobre workspaces locales. En Cloud Run (Fase 1) se agrega
 * materialize/sync con Firebase Storage y validación de Firebase ID token.
 */
import express from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { runAgent } from "./agent.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Auth: API key del .env si existe; si no, sesión ambiente del CLI de Claude.
(function loadApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return;
  try {
    const env = readFileSync(resolve(__dirname, "..", ".env"), "utf8");
    const m = env.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    const val = m && m[1].trim().replace(/^["']|["']$/g, "");
    if (val) process.env.ANTHROPIC_API_KEY = val;
  } catch { /* usa sesión del CLI */ }
})();

// Workspace activo: en local, sample-workspace/ o el que pase WORKDIR. En Cloud
// Run se materializa desde Storage a /work/{sessionId} (Fase 1).
const WORKDIR = process.env.WORKDIR || resolve(__dirname, "sample-workspace");

const app = express();
app.use(express.json({ limit: "1mb" }));

// CORS: permite que el dashboard Next.js (localhost:3001) llame al servicio.
// En producción restringir a tu dominio (Fase 3 hardening).
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// UI local del playground (Fase 2 local) y preview del proyecto editado.
app.use(express.static(resolve(__dirname, "public")));
app.use("/workspace", express.static(WORKDIR, { etag: false, lastModified: false, cacheControl: false }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/agent/edit", async (req, res) => {
  const { instruction, model, resume } = req.body || {};
  if (!instruction || typeof instruction !== "string") {
    return res.status(400).json({ error: "Falta 'instruction'" });
  }
  const cwd = WORKDIR;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const send = (event, data) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    const summary = await runAgent({ instruction, cwd, model, resume }, (e) =>
      send(e.kind, e)
    );
    send("done", summary);
  } catch (err) {
    send("error", { message: String(err?.message || err) });
  } finally {
    res.end();
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`claude-agent-service escuchando en :${PORT}`));
