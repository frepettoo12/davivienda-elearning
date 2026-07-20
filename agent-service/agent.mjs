/**
 * Núcleo del Modo Agente: corre el Claude Agent SDK sobre un workspace y
 * emite cada evento (texto, tool_use, result) vía un callback `onEvent`.
 * Lo usan tanto el spike (CLI) como el servidor SSE.
 */
import { query } from "@anthropic-ai/claude-agent-sdk";

const CHROME = process.platform === "darwin"
  ? '"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"'
  : "google-chrome";

// --force-device-scale-factor=0.5 → la captura sale a la mitad de píxeles
// (mismo layout, imagen ~4x más liviana = menos tokens/cupo en la verificación).
const SHOT = `--headless --disable-gpu --force-device-scale-factor=0.5`;

// Instrucciones del agente parametrizadas por la marca del tenant.
// Sin brand (null) usa Davivienda, el comportamiento pre-multi-tenant.
//   mode "full" → verificación exhaustiva (desktop+mobile, 2 rondas). Más caro.
//   mode "lite" → 1 render mobile, 1 corrección, sin releer. ~3-4x más barato.
export function buildVerifyInstructions(brand, mode = "full") {
  const b = brand || {
    nombre: "Davivienda",
    colorPrimario: "#DA291C",
    colorSecundario: "#FFD700",
    fuenteTitulos: "Montserrat",
    fuenteTexto: "Open Sans",
    logoUrl: null,
  };
  const header = `Estás editando un proyecto de e-learning HTML/CSS/JS para ${b.nombre}.
Marca: color primario ${b.colorPrimario}, acento ${b.colorSecundario}. Tipografías ${b.fuenteTitulos}/${b.fuenteTexto}.${b.logoUrl ? `\nLogo de la empresa disponible en: ${b.logoUrl}` : ""}`;

  if (mode === "lite") {
    return `
${header}

VERIFICACIÓN ECONÓMICA (seguí esto al pie de la letra para no gastar de más):
  1. Escribí/editá el index.html completo de una (no en muchos pasos chicos).
  2. Si el cambio es SOLO texto, NO renderices: terminá.
  3. Si tocaste layout/CSS/estructura, hacé UNA sola verificación:
       ${CHROME} ${SHOT} --screenshot=_check.png --window-size=390,844 "file://$(pwd)/index.html"
     Leé _check.png UNA vez. Corregí SOLO lo que esté claramente roto (overflow
     horizontal, texto cortado, elementos superpuestos). Cosas menores/estéticas: dejalas.
  4. Borrá _check.png. NO vuelvas a renderizar ni a leer screenshots una segunda vez.

REGLAS DURAS: máximo UN render + UNA corrección. No busques la perfección; buscá
"correcto y prolijo". Priorizá terminar rápido sobre pulir detalles.
Al final, resumí en 1-2 líneas qué hiciste.
`.trim();
  }

  return `
${header}

REGLA DE VERIFICACIÓN (esto es lo que te diferencia de un editor común):
Verificá renderizando, PERO con criterio para no gastar de más:
  - Si el cambio es SOLO de texto/contenido (no toca layout, CSS ni estructura),
    NO hace falta renderizar: aplicá el cambio y terminá.
  - Si el cambio afecta layout/CSS/estructura, verificá así:
      1. Render desktop:
         ${CHROME} ${SHOT} --screenshot=_check_desktop.png --window-size=1440,900 "file://$(pwd)/index.html"
      2. Render mobile (detectar overflow):
         ${CHROME} ${SHOT} --screenshot=_check_mobile.png --window-size=390,844 "file://$(pwd)/index.html"
      3. Mirá los PNG con Read: revisá que NO haya overflow horizontal, texto cortado
         ni elementos rotos. Si algo está mal, corregí.
      4. Borrá los _check_*.png al terminar.

TOPE DE COSTO: máximo 2 rondas de verificación (render → corrección). Si después de
2 rondas algo menor sigue imperfecto, dejalo y avisalo en el resumen en vez de seguir iterando.

Al final, resumí en 2-3 líneas qué cambiaste y por qué.
`.trim();
}

// Compat: instrucciones legacy (Davivienda). Preferir buildVerifyInstructions(brand).
export const VERIFY_INSTRUCTIONS = buildVerifyInstructions(null);

/**
 * @param {object} p
 * @param {string} p.instruction  Qué editar (lenguaje natural)
 * @param {string} p.cwd          Directorio del proyecto
 * @param {string} [p.model]      Modelo (default claude-sonnet-4-6)
 * @param {string} [p.resume]     sessionId para continuar una conversación previa
 * @param {object} [p.brand]      Marca del tenant ({nombre, colorPrimario, ...})
 * @param {(e:object)=>void} onEvent  Recibe eventos normalizados
 * @returns {Promise<{sessionId?:string, costUsd:number, toolCalls:number}>}
 */
export async function runAgent({ instruction, cwd, model = "claude-sonnet-4-6", resume, brand, verifyMode = "full", maxTurns, apiKey }, onEvent) {
  let sessionId, costUsd = 0, toolCalls = 0;

  // Cap de turnos: en modo lite acotamos fuerte (escribir + 1 render + 1 fix);
  // en full dejamos margen. Se puede override con maxTurns explícito.
  const turnsCap = maxTurns ?? (verifyMode === "lite" ? 16 : 40);

  // API key por request (BYOK o plataforma): se inyecta como env del subproceso
  // del CLI. `env` REEMPLAZA el env, así que hay que spread process.env. Sin apiKey
  // → no pasamos env → el CLI hereda process.env (sesión Max local en dev).
  const envOverride = apiKey ? { ...process.env, ANTHROPIC_API_KEY: apiKey } : undefined;

  for await (const msg of query({
    prompt: instruction,
    options: {
      cwd,
      model,
      systemPrompt: { type: "preset", preset: "claude_code", append: buildVerifyInstructions(brand, verifyMode) },
      permissionMode: "bypassPermissions",
      disallowedTools: ["WebFetch", "WebSearch", "Bash(rm -rf /*)", "Bash(sudo *)"],
      settingSources: [],
      maxTurns: turnsCap,
      ...(envOverride ? { env: envOverride } : {}),
      ...(resume ? { resume } : {}),
    },
  })) {
    if (msg.type === "system" && msg.subtype === "init") {
      sessionId = msg.session_id;
      onEvent({ kind: "init", sessionId });
    } else if (msg.type === "assistant") {
      for (const block of msg.message.content) {
        if (block.type === "text" && block.text.trim()) {
          onEvent({ kind: "text", text: block.text.trim() });
        } else if (block.type === "tool_use") {
          toolCalls++;
          const detail = block.input?.file_path || block.input?.command || block.input?.pattern || "";
          onEvent({ kind: "tool", name: block.name, detail: String(detail).slice(0, 200) });
        }
      }
    } else if (msg.type === "result") {
      costUsd = msg.total_cost_usd ?? 0;
      onEvent({ kind: "result", costUsd, toolCalls, subtype: msg.subtype });
    }
  }
  return { sessionId, costUsd, toolCalls };
}
