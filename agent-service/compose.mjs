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
import { Storage } from "@google-cloud/storage";

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

/**
 * @param {object} p
 * @param {string} p.avatarUrl   URL pública del MP4 del avatar (con su audio)
 * @param {string} p.contentHtml HTML del panel de contenido (branded)
 * @param {string} p.id          id de salida (composed/{id}.mp4)
 * @returns {Promise<{file:string, rel:string}>}
 */
export async function composeSplit({ avatarUrl, contentHtml, id, companyId }) {
  mkdirSync(COMPOSED_ROOT, { recursive: true });
  const work = resolve(COMPOSED_ROOT, `_tmp_${id}`);
  mkdirSync(work, { recursive: true });

  const avatarPath = resolve(work, "avatar.mp4");
  const htmlPath = resolve(work, "content.html");
  const pngPath = resolve(work, "content.png");
  const outFile = resolve(COMPOSED_ROOT, `${id}.mp4`);

  try {
    // 1) Descargar avatar
    const resp = await fetch(avatarUrl);
    if (!resp.ok) throw new Error(`No se pudo descargar el avatar (HTTP ${resp.status})`);
    writeFileSync(avatarPath, Buffer.from(await resp.arrayBuffer()));

    // 2) Renderizar el HTML del contenido a PNG (panel derecho 1248x1080)
    writeFileSync(htmlPath, contentHtml || "<html><body style='background:#0f3460'></body></html>");
    await execp(
      `${CHROME} --headless --disable-gpu --screenshot="${pngPath}" --window-size=1248,1080 "file://${htmlPath}"`,
      { timeout: 60000 }
    );
    if (!existsSync(pngPath)) throw new Error("Chrome no generó el screenshot del contenido");

    // 3) FFmpeg: avatar (672px, recortado) a la izquierda + contenido (1248px) a la derecha.
    //    Audio del avatar. Largo = avatar (-shortest). El PNG se loopea.
    const filter =
      "[0:v]scale=672:1080:force_original_aspect_ratio=increase,crop=672:1080[av];" +
      "[1:v]scale=1248:1080[ct];[av][ct]hstack=inputs=2[out]";
    await execp(
      `ffmpeg -y -i "${avatarPath}" -loop 1 -i "${pngPath}" ` +
      `-filter_complex "${filter}" -map "[out]" -map 0:a ` +
      `-c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest "${outFile}"`,
      { timeout: 300000, maxBuffer: 1024 * 1024 * 16 }
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
export async function composeSlides({ audioUrl, contentHtml, slideCount = 1, id, companyId }) {
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
    const resp = await fetch(audioUrl);
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

    // 4) Concat de imágenes + audio → MP4
    await execp(
      `ffmpeg -y -f concat -safe 0 -i "${concatPath}" -i "${audioPath}" ` +
      `-vf "scale=1920:1080,fps=25,format=yuv420p" -c:v libx264 -preset fast -crf 23 ` +
      `-c:a aac -b:a 192k -shortest "${outFile}"`,
      { timeout: 300000, maxBuffer: 1024 * 1024 * 16 }
    );

    const storageUrl = await uploadComposed(outFile, id, companyId);
    return { file: outFile, rel: `${id}.mp4`, storageUrl };
  } finally {
    if (existsSync(work)) rmSync(work, { recursive: true, force: true });
  }
}
