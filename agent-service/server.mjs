/**
 * Servidor del Modo Agente. Expone POST /agent/edit con respuesta en streaming
 * (Server-Sent Events) para mostrar el progreso del agente en vivo en el frontend.
 *
 * Fase 0/2: corre sobre workspaces locales. En Cloud Run (Fase 1) se agrega
 * materialize/sync con Firebase Storage y validación de Firebase ID token.
 */
import express from "express";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { runAgent } from "./agent.mjs";
import { composeSplit, composeSlides, COMPOSED_ROOT } from "./compose.mjs";
import { requireAuth, brandOf, DEFAULT_COMPANY_ID, resolveBilling, addAiSpend } from "./tenant.mjs";

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

// Workspaces por recurso del dashboard. Cada recurso de la fase de Contenido
// edita su propio HTML aislado en workspaces/{key}/index.html. La semilla (seedHtml)
// la genera el frontend a partir del guión JSON; el agente edita ESE archivo.
const WORKSPACES_ROOT = process.env.WORKSPACES_ROOT || resolve(__dirname, "workspaces");

// Sanitiza el sessionKey para que no escape del directorio de workspaces.
const safeKey = (k) => String(k).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);

// Resuelve el cwd de una edición: workspace por empresa+recurso (con seed) o el
// WORKDIR del playground si no viene sessionKey (compatibilidad con el demo).
// Multi-tenant: workspaces/{companyId}/{sessionKey} — dos empresas nunca
// comparten árbol. Los workspaces legacy (sin companyId) quedan huérfanos y se
// re-siembran desde contenido.html en la próxima edición (cache regenerable).
function resolveWorkspace({ companyId, sessionKey, seedHtml }) {
  if (!sessionKey) return WORKDIR;
  const dir = resolve(WORKSPACES_ROOT, safeKey(companyId || DEFAULT_COMPANY_ID), safeKey(sessionKey));
  mkdirSync(dir, { recursive: true });
  const indexPath = resolve(dir, "index.html");
  // Sembrar solo si el workspace aún no tiene el HTML (primera edición o tras
  // reinicio del server). Ediciones siguientes construyen sobre lo ya editado.
  if (seedHtml && !existsSync(indexPath)) {
    writeFileSync(indexPath, seedHtml, "utf8");
  }
  return dir;
}

const app = express();
app.use(express.json({ limit: "30mb" })); // 30mb para permitir imágenes adjuntas (base64)

// Guarda imágenes adjuntas (dataURL base64) en el workspace para que el agente las use/vea.
function saveImages(cwd, images) {
  if (!Array.isArray(images)) return [];
  const saved = [];
  for (const img of images.slice(0, 8)) {
    const m = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(img?.dataUrl || "");
    if (!m) continue;
    const ext = m[1].split("/")[1].replace("+xml", "").slice(0, 4);
    const base = String(img.name || "imagen").replace(/[^a-zA-Z0-9_.-]/g, "_").replace(/\.[^.]+$/, "");
    const name = `${base}.${ext}`.slice(0, 60);
    try {
      writeFileSync(resolve(cwd, name), Buffer.from(m[2], "base64"));
      saved.push(name);
    } catch { /* ignore */ }
  }
  return saved;
}

// Guarda documentos de referencia (PDF/DOCX/TXT/MD) en el workspace para que el
// agente los lea con la tool Read y use su contenido como fuente.
const _DOC_EXT = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/csv": "csv",
};
function saveDocs(cwd, docs) {
  if (!Array.isArray(docs)) return [];
  const saved = [];
  for (const doc of docs.slice(0, 6)) {
    const m = /^data:([^;]+);base64,(.+)$/.exec(doc?.dataUrl || "");
    if (!m) continue;
    const rawName = String(doc.name || "documento");
    // Extensión: la del MIME conocido o la del nombre original si es un tipo de doc.
    let ext = _DOC_EXT[m[1]];
    if (!ext) {
      const fromName = rawName.split(".").pop()?.toLowerCase();
      if (fromName && Object.values(_DOC_EXT).includes(fromName)) ext = fromName;
    }
    if (!ext) continue; // no es un documento soportado
    const base = rawName.replace(/[^a-zA-Z0-9_.-]/g, "_").replace(/\.[^.]+$/, "");
    const name = `${base}.${ext}`.slice(0, 60);
    try {
      writeFileSync(resolve(cwd, name), Buffer.from(m[2], "base64"));
      saved.push(name);
    } catch { /* ignore */ }
  }
  return saved;
}

// Embebe imágenes locales del workspace como data URI en el HTML, para que sea
// self-contained y funcione fuera del workspace (srcDoc, composición, SCORM).
const _MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml" };
function inlineAssets(html, cwd) {
  if (!html) return html;
  return html.replace(/(src|href)\s*=\s*"([^"]+)"/g, (m, attr, val) => {
    if (/^(https?:|data:|#|\/\/?)/.test(val)) return m; // saltar absolutas/data/anchors
    try {
      const p = resolve(cwd, val);
      if (!p.startsWith(cwd) || !existsSync(p)) return m;
      const mime = _MIME[val.split(".").pop().toLowerCase()];
      if (!mime) return m; // solo imágenes
      return `${attr}="data:${mime};base64,${readFileSync(p).toString("base64")}"`;
    } catch { return m; }
  });
}

// CORS: por env ALLOWED_ORIGINS (coma-separado); default * para local.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "*").split(",").map((s) => s.trim());
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes("*")) {
    res.header("Access-Control-Allow-Origin", "*");
  } else if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
  }
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Company-Id");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// UI local del playground (Fase 2 local) y preview del proyecto editado.
app.use(express.static(resolve(__dirname, "public")));
app.use("/workspace", express.static(WORKDIR, { etag: false, lastModified: false, cacheControl: false }));
// Preview en vivo de los workspaces por recurso: /ws/{companyId}/{key}/index.html
// Auth por header o ?auth= (iframes) + tenancy: solo el árbol de tu empresa.
app.use(
  "/ws/:companyId",
  requireAuth,
  (req, res, next) => {
    // Superadmin puede previsualizar cualquier empresa; el resto solo la propia.
    if (req.company?.id !== req.params.companyId && !req.company?.isSuperadmin) return res.sendStatus(403);
    express.static(resolve(WORKSPACES_ROOT, safeKey(req.params.companyId)), {
      etag: false,
      lastModified: false,
      cacheControl: false,
    })(req, res, next);
  }
);
// Videos compuestos (Opción C: avatar + slides HTML + FFmpeg)
// Auth por header o ?auth= + tenancy: companies/{X}/... solo para la empresa X
// (o superadmin); los archivos legacy en la raíz solo para Davivienda/superadmin.
app.use(
  "/composed",
  requireAuth,
  (req, res, next) => {
    let rel;
    try { rel = decodeURIComponent(req.path); } catch { return res.sendStatus(400); }
    rel = rel.replace(/^\/+/, "");
    const m = /^companies\/([^/]+)\//.exec(rel);
    if (m) {
      if (m[1] !== req.company?.id && !req.company?.isSuperadmin) return res.sendStatus(403);
    } else if (req.company?.id !== DEFAULT_COMPANY_ID && !req.company?.isSuperadmin) {
      return res.sendStatus(403);
    }
    next();
  },
  express.static(COMPOSED_ROOT, { etag: false, lastModified: false, cacheControl: false })
);

app.get("/health", (_req, res) => res.json({ ok: true }));

// Sufijo aleatorio para que las URLs públicas de Storage no sean adivinables.
const randSuffix = () => Math.random().toString(36).slice(2, 10);

// POST /compose/split — avatar HeyGen + HTML branded → MP4 split (35% avatar / 65% contenido)
app.post("/compose/split", requireAuth, async (req, res) => {
  const { avatarUrl, contentHtml, id, subtitles, subtitleText } = req.body || {};
  if (!avatarUrl || typeof avatarUrl !== "string") {
    return res.status(400).json({ error: "Falta 'avatarUrl'" });
  }
  const safeId = `${String(id || `v${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 70)}_${randSuffix()}`;
  try {
    const { rel, storageUrl } = await composeSplit({ avatarUrl, contentHtml, id: safeId, companyId: req.company?.id, subtitles: !!subtitles, subtitleText });
    res.json({ ok: true, url: storageUrl || `/composed/${rel}`, rel });
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// POST /compose/slides — slide HTML full-screen + audio → MP4 (sin avatar)
app.post("/compose/slides", requireAuth, async (req, res) => {
  const { audioUrl, contentHtml, slideCount, id, subtitles, subtitleText } = req.body || {};
  if (!audioUrl || typeof audioUrl !== "string") {
    return res.status(400).json({ error: "Falta 'audioUrl'" });
  }
  const safeId = `${String(id || `s${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 70)}_${randSuffix()}`;
  try {
    const { rel, storageUrl } = await composeSlides({ audioUrl, contentHtml, slideCount, id: safeId, companyId: req.company?.id, subtitles: !!subtitles, subtitleText });
    res.json({ ok: true, url: storageUrl || `/composed/${rel}`, rel });
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

app.post("/agent/edit", requireAuth, async (req, res) => {
  const { instruction, model, resume, sessionKey, seedHtml, images, docs, verifyMode, maxTurns } = req.body || {};
  if (!instruction || typeof instruction !== "string") {
    return res.status(400).json({ error: "Falta 'instruction'" });
  }
  const cwd = resolveWorkspace({ companyId: req.company?.id, sessionKey, seedHtml });

  // Guardar imágenes y documentos adjuntos, y avisarle al agente que los tiene.
  const savedImgs = saveImages(cwd, images);
  const savedDocs = saveDocs(cwd, docs);
  let fullInstruction = instruction;
  if (savedImgs.length) {
    fullInstruction += `\n\nIMÁGENES adjuntas disponibles en este directorio (insertalas con <img src="NOMBRE">; podés abrirlas con la tool Read para verlas y replicar su estilo/colores): ${savedImgs.join(", ")}.`;
  }
  if (savedDocs.length) {
    fullInstruction += `\n\nDOCUMENTOS de referencia adjuntos en este directorio (leelos con la tool Read para usar su contenido como fuente del material; NO los copies textual salvo que se pida): ${savedDocs.join(", ")}.`;
  }

  // Facturación: qué API key usar (BYOK/plataforma) y si el budget lo permite.
  const billing = await resolveBilling(req.company);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const send = (event, data) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  // Gate de billing: si BYOK sin key o plataforma sin budget → no corremos.
  if (!billing.ok) {
    send("error", { message: billing.message || "IA no disponible para esta empresa." });
    send("done", { sessionKey });
    return res.end();
  }

  try {
    const summary = await runAgent(
      { instruction: fullInstruction, cwd, model, resume, brand: brandOf(req.company),
        verifyMode: verifyMode === "lite" ? "lite" : "full",
        maxTurns: typeof maxTurns === "number" ? maxTurns : undefined,
        apiKey: billing.apiKey || undefined },
      (e) => send(e.kind, e)
    );
    // Acumular gasto real (solo cuando hubo costo con key propia/plataforma; en
    // max_local/dev con sesión Max no cobramos). El costUsd lo reporta el SDK.
    if (billing.mode !== "max_local" && summary?.costUsd > 0) {
      await addAiSpend(req.company?.id, summary.costUsd);
    }
    // Devolvemos el HTML resultante (con imágenes embebidas) para que el frontend lo
    // persista y funcione fuera del workspace (srcDoc, composición, SCORM).
    let html;
    try { html = inlineAssets(readFileSync(resolve(cwd, "index.html"), "utf8"), cwd); } catch { /* sin index */ }
    send("done", { ...summary, sessionKey, html });
  } catch (err) {
    send("error", { message: String(err?.message || err) });
  } finally {
    res.end();
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`claude-agent-service escuchando en :${PORT}`));
