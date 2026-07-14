import type { Guion } from "@/lib/api";
import { generateResourceHTML } from "@/lib/resource-renderer";
import { generateFullHTML, type ComponentContentWithConfig } from "@/lib/component-html-generator";
import { isComponentContent } from "@/lib/component-renderer";
import { Brand, DEFAULT_BRAND } from "@/lib/brand";

/**
 * HTML final de un recurso (la "realidad" que se previsualiza y se empaqueta en SCORM):
 * 1) el HTML editado por el agente (`contenido.html`) si existe,
 * 2) si no, el HTML generado desde el guión JSON (modo componentes o legacy).
 */
function videoPage(url: string, titulo?: string): string {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${titulo || "Video"}</title>
<style>html,body{margin:0;height:100%;background:#000;display:flex;align-items:center;justify-content:center}
video{max-width:100%;max-height:100vh}</style></head>
<body><video src="${url}" controls playsinline></video></body></html>`;
}

export function resourceFinalHtml(guion: Guion, tipo: string, titulo?: string, brand: Brand = DEFAULT_BRAND): string {
  // Video: usa el compuesto (split/slides) si existe; si no, el avatar/video crudo.
  if (tipo === "Video" || tipo === "Video avatar") {
    const c = guion.contenido as { composed_url?: string; video_url?: string };
    const url = c.composed_url || c.video_url;
    if (url) return videoPage(url, titulo);
    return `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:60px;text-align:center;color:#666">
      <h2>${titulo || "Video"}</h2><p>Componé el video en la fase de Contenido para verlo acá.</p></body></html>`;
  }
  if (typeof guion.contenido.html === "string" && guion.contenido.html.trim()) {
    return guion.contenido.html;
  }
  if (isComponentContent(guion.contenido)) {
    return generateFullHTML(guion.contenido as unknown as ComponentContentWithConfig, titulo, brand);
  }
  return generateResourceHTML(guion, tipo, brand);
}
