/**
 * Fase 0 — Spike local del Claude Agent SDK.
 *
 * Prueba que el loop agéntico (editar -> renderizar -> ver error -> corregir)
 * funciona sobre un proyecto HTML/CSS/JS real, "como Claude en la terminal".
 *
 * Uso:
 *   node spike.mjs "instruccion de edicion"   (usa sample-workspace/ por defecto)
 *   WORKDIR=/ruta node spike.mjs "instruccion"
 */
import { query } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Auth ---
// Si hay ANTHROPIC_API_KEY en el .env del proyecto, la usamos (modo Cloud Run).
// Si no, el SDK usa la credencial ambiente del CLI de Claude ya logueado (modo local).
function loadApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return "env";
  try {
    const env = readFileSync(resolve(__dirname, "..", ".env"), "utf8");
    const m = env.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    const val = m && m[1].trim().replace(/^["']|["']$/g, "");
    if (val) { process.env.ANTHROPIC_API_KEY = val; return ".env"; }
  } catch { /* noop */ }
  return "cli-session"; // sin key: el SDK hereda la sesión del CLI de Claude
}
const authSource = loadApiKey();

// Comando de render headless segun plataforma (para que el agente verifique).
const CHROME = process.platform === "darwin"
  ? '"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"'
  : "google-chrome";

const VERIFY_INSTRUCTIONS = `
Estás editando un proyecto de e-learning HTML/CSS/JS para Davivienda.
Marca: rojo primario #DA291C, amarillo #FFD700. Tipografías Montserrat/Open Sans.

REGLA DE VERIFICACIÓN OBLIGATORIA (esto es lo que te diferencia de un editor común):
Después de CADA cambio relevante en HTML/CSS/JS, DEBÉS verificar el resultado renderizando,
no asumas que quedó bien:
  1. Renderizá desktop (1920x1080):
     ${CHROME} --headless --disable-gpu --screenshot=_check_desktop.png --window-size=1920,1080 "file://$(pwd)/index.html"
  2. Renderizá mobile (390x844) para detectar overflow:
     ${CHROME} --headless --disable-gpu --screenshot=_check_mobile.png --window-size=390,844 "file://$(pwd)/index.html"
  3. Mirá los PNG con la herramienta Read (podés ver imágenes) y revisá que NO haya
     overflow horizontal, texto cortado, ni elementos rotos. Si algo está mal, corregí y repetí.
  4. Cuando termines, borrá los archivos _check_*.png.

No termines hasta que el render se vea correcto en ambos tamaños.
Al final, resumí en 2-3 líneas qué cambiaste y por qué.
`.trim();

const workdir = process.env.WORKDIR || resolve(__dirname, "sample-workspace");
const instruccion = process.argv[2] ||
  "Hacé el header sticky (que quede fijo arriba al hacer scroll), agregá el meta viewport que falta, y arreglá el overflow horizontal en mobile causado por el código de referencia largo. Mejorá un poco la estética manteniendo la marca Davivienda.";

console.log("▶ Workspace:", workdir);
console.log("▶ Instrucción:", instruccion);
console.log("▶ Modelo: claude-sonnet-4-6 | auth:", authSource + "\n" + "─".repeat(70));

let toolCalls = 0;
const t0 = Date.now();

for await (const msg of query({
  prompt: instruccion,
  options: {
    cwd: workdir,
    model: "claude-sonnet-4-6",
    systemPrompt: { type: "preset", preset: "claude_code", append: VERIFY_INSTRUCTIONS },
    permissionMode: "bypassPermissions",          // local/aislado: sin prompts
    disallowedTools: ["WebFetch", "WebSearch", "Bash(rm -rf /*)", "Bash(sudo *)"],
    settingSources: [],                           // no cargar settings del host
    includePartialMessages: false,
  },
})) {
  if (msg.type === "assistant") {
    for (const block of msg.message.content) {
      if (block.type === "text" && block.text.trim()) {
        console.log("\n🤖 " + block.text.trim());
      } else if (block.type === "tool_use") {
        toolCalls++;
        const arg = block.input?.file_path || block.input?.command || block.input?.pattern || "";
        console.log(`   ⚙ ${block.name}${arg ? " → " + String(arg).slice(0, 90) : ""}`);
      }
    }
  } else if (msg.type === "result") {
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log("\n" + "─".repeat(70));
    console.log(`✓ Terminado en ${secs}s | tool calls: ${toolCalls} | costo: $${(msg.total_cost_usd ?? 0).toFixed(4)}`);
    if (msg.subtype && msg.subtype !== "success") console.log("  subtype:", msg.subtype);
  }
}
