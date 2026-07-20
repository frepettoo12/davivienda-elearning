/**
 * Composición "split" (Opción C): avatar HeyGen + slides HTML branded → MP4.
 *
 * El avatar (vertical, con su audio) va a la izquierda (35%) y el contenido HTML
 * renderizado va a la derecha (65%). Todo el look&feel del contenido lo controla
 * el HTML (colores/posición/branding), generado/editado con el Editor IA del agente.
 *
 * Pipeline: descargar avatar → renderizar HTML a PNG (Chrome headless) → FFmpeg hstack.
 */
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import dns from "node:dns/promises";
import net from "node:net";
import { Storage } from "@google-cloud/storage";

// Guard anti-SSRF: solo http(s) y hosts que NO resuelvan a IPs internas/privadas.
async function assertSafeUrl(url) {
  let u; try { u = new URL(url); } catch { throw new Error("URL inválida"); }
  if (!/^https?:$/.test(u.protocol)) throw new Error("Esquema no permitido");
  const { address } = await dns.lookup(u.hostname);
  if (net.isIP(address) && (address.startsWith("10.") || address.startsWith("127.") || address.startsWith("169.254.") || address.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(address) || address === "::1" || address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80"))) throw new Error("Host resuelve a IP interna");
  return url;
}

const FETCH_TIMEOUT_MS = 120000;

const execp = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));

// Sube el MP4 compuesto a Cloud Storage (bucket del backend) para que sea durable
// (preview + empaquetado SCORM). Usa ADC. Si falla, devuelve null (fallback local).
const STORAGE_BUCKET = process.env.STORAGE_BUCKET || "davivienda-elearning-assets";
let _storage;
async function uploadComposed(localFile, id, companyId) {
  try {
    _storage ||= new Storage();
    // Multi-tenant: prefijo por empresa. Davivienda mantiene la ruta legacy
    // (composed/) para no romper composed_url ya persistidas.
    const prefix = companyId && companyId !== "davivienda" ? `companies/${companyId}/composed` : "composed";
    const dest = `${prefix}/${id}.mp4`;
    await _storage.bucket(STORAGE_BUCKET).upload(localFile, {
      destination: dest,
      metadata: { contentType: "video/mp4" },
    });
    await _storage.bucket(STORAGE_BUCKET).file(dest).makePublic();
    return `https://storage.googleapis.com/${STORAGE_BUCKET}/${dest}`;
  } catch (e) {
    console.error("No se pudo subir el compuesto a Storage:", e?.message || e);
    return null;
  }
}

const CHROME = process.platform === "darwin"
  ? '"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"'
  : "google-chrome";

export const COMPOSED_ROOT = resolve(__dirname, "composed");

// ── Subtítulos ────────────────────────────────────────────────────────────
// El ffmpeg mínimo del entorno no trae libass/drawtext, así que los subtítulos
// se "queman" compositando PNGs transparentes por cue con overlay + enable
// (filtros básicos disponibles). Los PNGs los renderiza Chrome headless (texto
// blanco con contorno negro, legible sobre cualquier fondo).
const CAP_H = 160;   // alto de cada banda de caption (px)
const CAP_ESC = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

// Divide el voiceover en cues y les asigna tiempos proporcionales a su longitud
// a lo largo de la duración total (aprox.: no hay timestamps reales del TTS).
function buildCues(text, totalDur) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean || !(totalDur > 0)) return [];
  const sentences = clean.match(/[^.!?]+[.!?]*/g) || [clean];
  const parts = [];
  for (const sent of sentences) {
    let chunk = "";
    for (const w of sent.trim().split(" ")) {
      if (chunk && (chunk + " " + w).length > 70) { parts.push(chunk); chunk = w; }
      else chunk = chunk ? chunk + " " + w : w;
    }
    if (chunk) parts.push(chunk);
  }
  if (!parts.length) return [];
  const totalChars = parts.reduce((a, c) => a + c.length, 0) || 1;
  let t = 0;
  return parts.map((text) => {
    const s = t;
    const e = Math.min(totalDur, t + (text.length / totalChars) * totalDur);
    t = e;
    return { s, e, text };
  });
}

// Renderiza todos los cues en un PNG transparente alto (width x N*CAP_H), una
// banda por cue, para luego cropear+overlayar cada uno. Devuelve el path o null.
async function renderCaptions(work, cues, width) {
  if (!cues.length) return null;
  const bands = cues.map((c) => `
    <div class="band"><span class="cap">${CAP_ESC(c.text)}</span></div>`).join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;background:transparent}
    .band{width:${width}px;height:${CAP_H}px;display:flex;align-items:center;justify-content:center;padding:0 80px;box-sizing:border-box}
    .cap{color:#fff;font:700 46px Arial,Helvetica,sans-serif;text-align:center;line-height:1.2;
      -webkit-text-stroke:6px #000;paint-order:stroke fill;
      text-shadow:0 3px 6px rgba(0,0,0,.9)}
  </style></head><body>${bands}</body></html>`;
  const htmlPath = resolve(work, "captions.html");
  const pngPath = resolve(work, "captions.png");
  writeFileSync(htmlPath, html);
  await execp(
    `${CHROME} --headless --disable-gpu --default-background-color=00000000 ` +
    `--screenshot="${pngPath}" --window-size=${width},${cues.length * CAP_H} "file://${htmlPath}"`,
    { timeout: 60000 }
  );
  return existsSync(pngPath) ? pngPath : null;
}

// Construye el fragmento de filtergraph que cropea cada banda del PNG de captions
// (input index `capIdx`) y la overlaya sobre `baseLabel` con enable temporal.
// Devuelve { chain, outLabel }.
function captionOverlayChain(cues, capIdx, baseLabel, width) {
  let base = baseLabel;
  const steps = [];
  cues.forEach((c, i) => {
    const cap = `cap${i}`;
    const out = `cv${i}`;
    steps.push(`[${capIdx}:v]crop=${width}:${CAP_H}:0:${i * CAP_H}[${cap}]`);
    steps.push(`[${base}][${cap}]overlay=(W-w)/2:H-h-40:enable='between(t\\,${c.s.toFixed(3)}\\,${c.e.toFixed(3)})'[${out}]`);
    base = out;
  });
  return { chain: steps.join(";"), outLabel: base };
}

/**
 * @param {object} p
 * @param {string} p.avatarUrl   URL pública del MP4 del avatar (con su audio)
 * @param {string} p.contentHtml HTML del panel de contenido (branded)
 * @param {string} p.id          id de salida (composed/{id}.mp4)
 * @returns {Promise<{file:string, rel:string}>}
 */
export async function composeSplit({ avatarUrl, contentHtml, id, companyId, subtitles = false, subtitleText = "" }) {
  mkdirSync(COMPOSED_ROOT, { recursive: true });
  const work = resolve(COMPOSED_ROOT, `_tmp_${id}`);
  mkdirSync(work, { recursive: true });

  const avatarPath = resolve(work, "avatar.mp4");
  const htmlPath = resolve(work, "content.html");
  const pngPath = resolve(work, "content.png");
  const outFile = resolve(COMPOSED_ROOT, `${id}.mp4`);

  try {
    // 1) Descargar avatar
    await assertSafeUrl(avatarUrl);
    const resp = await fetch(avatarUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!resp.ok) throw new Error(`No se pudo descargar el avatar (HTTP ${resp.status})`);
    writeFileSync(avatarPath, Buffer.from(await resp.arrayBuffer()));

    // 2) Renderizar el HTML del contenido a PNG (panel derecho 1248x1080)
    writeFileSync(htmlPath, contentHtml || "<html><body style='background:#0f3460'></body></html>");
    await execp(
      `${CHROME} --headless --disable-gpu --screenshot="${pngPath}" --window-size=1248,1080 "file://${htmlPath}"`,
      { timeout: 60000 }
    );
    if (!existsSync(pngPath)) throw new Error("Chrome no generó el screenshot del contenido");

    // 2b) Subtítulos opcionales: cues del voiceover cronometrados con la duración
    //     del avatar, renderizados a un PNG y compositados por overlay temporal.
    let capPng = null, cues = [];
    if (subtitles && subtitleText) {
      const { stdout: durOut } = await execp(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${avatarPath}"`
      );
      cues = buildCues(subtitleText, Math.max(1, parseFloat(durOut.trim()) || 1));
      capPng = await renderCaptions(work, cues, 1920);
    }

    // 3) FFmpeg: avatar (672px, recortado) a la izquierda + contenido (1248px) a la derecha.
    //    Audio del avatar. Largo = avatar (-shortest). El PNG se loopea.
    let filter =
      "[0:v]scale=672:1080:force_original_aspect_ratio=increase,crop=672:1080[av];" +
      "[1:v]scale=1248:1080[ct];[av][ct]hstack=inputs=2[stk]";
    let outLabel = "stk";
    let capInput = "";
    if (capPng && cues.length) {
      const oc = captionOverlayChain(cues, 2, "stk", 1920);
      filter += ";" + oc.chain;
      outLabel = oc.outLabel;
      capInput = `-loop 1 -i "${capPng}" `;
    }
    await execp(
      `ffmpeg -y -i "${avatarPath}" -loop 1 -i "${pngPath}" ${capInput}` +
      `-filter_complex "${filter}" -map "[${outLabel}]" -map 0:a ` +
      `-c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest "${outFile}"`,
      { timeout: 300000, maxBuffer: 1024 * 1024 * 16, cwd: work }
    );

    const storageUrl = await uploadComposed(outFile, id, companyId);
    return { file: outFile, rel: `${id}.mp4`, storageUrl };
  } finally {
    if (existsSync(work)) rmSync(work, { recursive: true, force: true });
  }
}

/**
 * Video de slides (sin avatar): contenido HTML full-screen 1920x1080 + audio → MP4.
 * @param {object} p
 * @param {string} p.audioUrl    URL pública del audio (ElevenLabs)
 * @param {string} p.contentHtml HTML del slide (branded, 1920x1080)
 * @param {string} p.id          id de salida
 */
export async function composeSlides({ audioUrl, contentHtml, slideCount = 1, id, companyId, subtitles = false, subtitleText = "" }) {
  mkdirSync(COMPOSED_ROOT, { recursive: true });
  const work = resolve(COMPOSED_ROOT, `_tmp_${id}`);
  mkdirSync(work, { recursive: true });

  const n = Math.max(1, Math.min(20, parseInt(slideCount) || 1));
  const audioPath = resolve(work, "audio.mp3");
  const htmlPath = resolve(work, "deck.html");
  const deckPng = resolve(work, "deck.png");
  const outFile = resolve(COMPOSED_ROOT, `${id}.mp4`);

  try {
    // 1) Audio + duración
    await assertSafeUrl(audioUrl);
    const resp = await fetch(audioUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!resp.ok) throw new Error(`No se pudo descargar el audio (HTTP ${resp.status})`);
    writeFileSync(audioPath, Buffer.from(await resp.arrayBuffer()));
    const { stdout: durOut } = await execp(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`
    );
    const audioDur = Math.max(1, parseFloat(durOut.trim()) || 1);
    const perSlide = audioDur / n;

    // 2) Renderizar el deck completo (1920 x N*1080) a un PNG alto
    writeFileSync(htmlPath, contentHtml || "<html><body></body></html>");
    await execp(
      `${CHROME} --headless --disable-gpu --screenshot="${deckPng}" --window-size=1920,${n * 1080} "file://${htmlPath}"`,
      { timeout: 90000 }
    );
    if (!existsSync(deckPng)) throw new Error("Chrome no generó el screenshot del deck");

    // 3) Recortar cada slide (1920x1080) y armar concat con su duración
    const lines = [];
    for (let i = 0; i < n; i++) {
      const slidePng = resolve(work, `slide_${i}.png`);
      await execp(`ffmpeg -y -i "${deckPng}" -vf "crop=1920:1080:0:${i * 1080}" "${slidePng}"`, { timeout: 60000 });
      lines.push(`file '${slidePng}'`, `duration ${perSlide.toFixed(3)}`);
    }
    lines.push(`file '${resolve(work, `slide_${n - 1}.png`)}'`); // último repetido (quirk de concat)
    const concatPath = resolve(work, "concat.txt");
    writeFileSync(concatPath, lines.join("\n"));

    // 3b) Subtítulos opcionales: cues del voiceover renderizados a PNG.
    let capPng = null, cues = [];
    if (subtitles && subtitleText) {
      cues = buildCues(subtitleText, audioDur);
      capPng = await renderCaptions(work, cues, 1920);
    }

    // 4) Concat de imágenes + audio → MP4 (con overlay de subtítulos si aplica).
    if (capPng && cues.length) {
      const oc = captionOverlayChain(cues, 2, "base", 1920);
      const filter = `[0:v]scale=1920:1080,fps=25,format=yuv420p[base];${oc.chain}`;
      await execp(
        `ffmpeg -y -f concat -safe 0 -i "${concatPath}" -i "${audioPath}" -loop 1 -i "${capPng}" ` +
        `-filter_complex "${filter}" -map "[${oc.outLabel}]" -map 1:a ` +
        `-c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest "${outFile}"`,
        { timeout: 300000, maxBuffer: 1024 * 1024 * 16, cwd: work }
      );
    } else {
      await execp(
        `ffmpeg -y -f concat -safe 0 -i "${concatPath}" -i "${audioPath}" ` +
        `-vf "scale=1920:1080,fps=25,format=yuv420p" -c:v libx264 -preset fast -crf 23 ` +
        `-c:a aac -b:a 192k -shortest "${outFile}"`,
        { timeout: 300000, maxBuffer: 1024 * 1024 * 16, cwd: work }
      );
    }

    const storageUrl = await uploadComposed(outFile, id, companyId);
    return { file: outFile, rel: `${id}.mp4`, storageUrl };
  } finally {
    if (existsSync(work)) rmSync(work, { recursive: true, force: true });
  }
}
