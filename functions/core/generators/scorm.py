"""
Generador de paquetes SCORM 1.2 (single-SCO) para Territorium.

Toma los recursos del curso (HTML final ya resuelto por el frontend + URLs de assets),
descarga y bundlea los assets dentro del zip, arma un player genérico con navegación +
tracking SCORM (status, score de quizzes vía postMessage, bookmark/resume) y un
imsmanifest.xml, y devuelve el zip listo para subir al LMS.

Diseño:
- Un solo SCO: index.html navega los recursos por dentro (cada recurso = resources/NN.html).
- Tracking por score de quizzes: cada quiz reporta {score,total} por postMessage; el player
  promedia contra masteryscore. Si no hay quizzes, cae a 'completed' por recorrido.
- Assets bundleados: las URLs http(s) de cada HTML se descargan a assets/ y se reescriben
  a rutas relativas (offline).
"""
from __future__ import annotations

import io
import re
import html as _html
import zipfile
from typing import Any
from urllib.parse import urlparse

import requests


import re as _re
import json as _json


def _course_block(resources_js: str, mastery: int, titulo: str) -> str:
    """Contenido del bloque COURSE (lista de recursos + config) que va inline en el shell."""
    return (
        f"\nwindow.RESOURCES = {resources_js};\n"
        f"window.MASTERY = {mastery};\n"
        f"window.COURSE_TITLE = {_json.dumps(titulo, ensure_ascii=False)};\n"
    )


# Marcadores del bloque que el backend reemplaza (el agente NO debe editar adentro).
_COURSE_RE = _re.compile(
    r"/\* === DAVIVIENDA:COURSE.*?\*/.*?/\* === END:COURSE === \*/", _re.S
)


def inject_course(shell_html: str, resources_js: str, mastery: int, titulo: str) -> str:
    """Reemplaza el bloque COURSE del shell con la data real del curso."""
    block = f"/* === DAVIVIENDA:COURSE (no editar) === */{_course_block(resources_js, mastery, titulo)}/* === END:COURSE === */"
    if _COURSE_RE.search(shell_html):
        return _COURSE_RE.sub(lambda _m: block, shell_html)
    return shell_html


# ── SCORM 1.2 API wrapper (genérico, compatible Territorium) ──────────────────
SCORM_API_JS = r"""/* SCORM 1.2 API Wrapper - Territorium */
const SCORM = {
  API: null, initialized: false,
  findAPI(win) {
    let n = 0;
    while ((!win.API && !win.API_1484_11) && win.parent !== win && n < 500) { n++; win = win.parent; }
    return win.API || win.API_1484_11 || null;
  },
  init() {
    try {
      this.API = this.findAPI(window) || (window.opener ? this.findAPI(window.opener) : null);
      if (this.API) {
        this.initialized = (this.API.LMSInitialize("") + "" === "true");
        if (this.initialized) this.setStatus('incomplete');
      } else { console.warn("SCORM API no encontrada - modo standalone"); }
    } catch (e) { console.error("SCORM init", e); }
    return this.initialized;
  },
  setStatus(s) {
    if (!this.API) return;
    if (['passed','completed','failed','incomplete','browsed','not attempted'].includes(s))
      this.setValue('cmi.core.lesson_status', s);
  },
  setScore(score) {
    if (!this.API) return;
    const v = Math.max(0, Math.min(100, Math.round(score)));
    this.setValue('cmi.core.score.raw', v.toString());
    this.setValue('cmi.core.score.min', '0');
    this.setValue('cmi.core.score.max', '100');
  },
  setProgress(p) { if (this.API) this.setValue('cmi.core.lesson_location', p.toString()); },
  getProgress() { return this.API ? parseInt(this.getValue('cmi.core.lesson_location') || '0') : 0; },
  setSuspendData(d) { if (this.API) this.setValue('cmi.suspend_data', (d + '').substring(0, 4096)); },
  getSuspendData() { return this.API ? this.getValue('cmi.suspend_data') : null; },
  setValue(el, val) {
    if (!this.API) return false;
    try { return (this.API.LMSSetValue(el, val) + "" === "true"); } catch (e) { return false; }
  },
  getValue(el) { if (!this.API) return ""; try { return this.API.LMSGetValue(el); } catch (e) { return ""; } },
  commit() { if (!this.API) return false; try { return (this.API.LMSCommit("") + "" === "true"); } catch (e) { return false; } },
  finish() {
    if (!this.API || !this.initialized) return false;
    try { this.commit(); const r = this.API.LMSFinish(""); this.initialized = false; return (r + "" === "true"); }
    catch (e) { return false; }
  }
};
setInterval(() => { if (SCORM.initialized) SCORM.commit(); }, 30000);
window.addEventListener('beforeunload', () => SCORM.finish());
"""


# ── Player JS (navegación + tracking por score de quizzes) ────────────────────
# __MASTERY__ se reemplaza por el masteryscore. RESOURCES lo inyecta el index.html.
PLAYER_JS = r"""
(function () {
  const MASTERY = __MASTERY__;
  let current = 0;
  const visited = new Set();
  const quizScores = {}; // index -> {score,total}

  const frame = document.getElementById('contentFrame');
  const menu = document.getElementById('menu');
  const progressBar = document.getElementById('progressBar');
  const crumb = document.getElementById('crumb');
  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');
  const btnFinish = document.getElementById('btnFinish');

  function renderMenu() {
    let lastBloque = null, hbar = '';
    RESOURCES.forEach((r, i) => {
      if (r.bloque && r.bloque !== lastBloque) {
        hbar += '<div class="menu-bloque">' + r.bloque + '</div>';
        lastBloque = r.bloque;
      }
      hbar += '<button class="menu-item" data-i="' + i + '">' +
              '<span class="menu-dot" id="dot' + i + '"></span>' + r.titulo + '</button>';
    });
    menu.innerHTML = hbar;
    menu.querySelectorAll('.menu-item').forEach(b =>
      b.addEventListener('click', () => show(parseInt(b.dataset.i))));
  }

  function show(i) {
    if (i < 0 || i >= RESOURCES.length) return;
    current = i;
    frame.src = 'resources/' + RESOURCES[i].file;
    crumb.textContent = (RESOURCES[i].bloque ? RESOURCES[i].bloque + ' · ' : '') + RESOURCES[i].titulo;
    visited.add(i);
    menu.querySelectorAll('.menu-item').forEach((b, j) => {
      b.classList.toggle('active', j === i);
      const dot = document.getElementById('dot' + j);
      if (dot && visited.has(j)) dot.classList.add('done');
    });
    btnPrev.disabled = (i === 0);
    btnNext.style.display = (i === RESOURCES.length - 1) ? 'none' : '';
    btnFinish.style.display = (i === RESOURCES.length - 1) ? '' : 'none';
    progressBar.style.width = (visited.size / RESOURCES.length * 100) + '%';
    SCORM.setProgress(i);
    SCORM.commit();
  }

  function computeAndReport(finishCourse) {
    const keys = Object.keys(quizScores);
    if (keys.length) {
      let got = 0, tot = 0;
      keys.forEach(k => { got += quizScores[k].score; tot += quizScores[k].total; });
      const pct = tot ? Math.round(got / tot * 100) : 0;
      SCORM.setScore(pct);
      SCORM.setStatus(pct >= MASTERY ? 'passed' : 'failed');
    } else if (visited.size >= RESOURCES.length) {
      SCORM.setStatus('completed');
    }
    SCORM.commit();
    if (finishCourse) SCORM.finish();
  }

  window.addEventListener('message', (e) => {
    const d = e.data || {};
    if (d.type === 'scorm-quiz-score' && typeof d.total === 'number') {
      quizScores[current] = { score: d.score || 0, total: d.total };
      computeAndReport(false);
    }
  });

  btnPrev.addEventListener('click', () => show(current - 1));
  btnNext.addEventListener('click', () => show(current + 1));
  btnFinish.addEventListener('click', () => {
    computeAndReport(true);
    crumb.textContent = '✓ Curso finalizado';
  });

  SCORM.init();
  renderMenu();
  show(Math.min(SCORM.getProgress() || 0, RESOURCES.length - 1));
})();
"""


# Lógica del player (lee window.RESOURCES / window.MASTERY / window.COURSE_TITLE).
# Soporta files data:/http (preview) y resources/NN.html (paquete).
_PLAYER_LOGIC = r"""
(function () {
  const RESOURCES = window.RESOURCES || [];
  const MASTERY = window.MASTERY || 70;
  let current = 0; const visited = new Set(); const quizScores = {};
  const $ = (id) => document.getElementById(id);
  const frame = $('contentFrame'), menu = $('menu'), progressBar = $('progressBar'),
        crumb = $('crumb'), btnPrev = $('btnPrev'), btnNext = $('btnNext'), btnFinish = $('btnFinish');
  const titleEl = $('courseTitle');
  if (titleEl && window.COURSE_TITLE) titleEl.textContent = window.COURSE_TITLE;
  if (window.COURSE_TITLE) document.title = window.COURSE_TITLE;

  function renderMenu() {
    let lastBloque = null, h = '';
    RESOURCES.forEach((r, i) => {
      if (r.bloque && r.bloque !== lastBloque) { h += '<div class="menu-bloque">' + r.bloque + '</div>'; lastBloque = r.bloque; }
      h += '<button class="menu-item" data-i="' + i + '"><span class="menu-dot" id="dot' + i + '"></span>' + r.titulo + '</button>';
    });
    if (menu) { menu.innerHTML = h; menu.querySelectorAll('.menu-item').forEach(b => b.addEventListener('click', () => show(parseInt(b.dataset.i)))); }
  }
  function show(i) {
    if (i < 0 || i >= RESOURCES.length) return;
    current = i; const f = RESOURCES[i];
    if (frame) frame.src = /^(data:|https?:)/.test(f.file) ? f.file : 'resources/' + f.file;
    if (crumb) crumb.textContent = (f.bloque ? f.bloque + ' · ' : '') + f.titulo;
    visited.add(i);
    if (menu) menu.querySelectorAll('.menu-item').forEach((b, j) => { b.classList.toggle('active', j === i); const d = $('dot' + j); if (d && visited.has(j)) d.classList.add('done'); });
    if (btnPrev) btnPrev.disabled = (i === 0);
    if (btnNext) btnNext.style.display = (i === RESOURCES.length - 1) ? 'none' : '';
    if (btnFinish) btnFinish.style.display = (i === RESOURCES.length - 1) ? '' : 'none';
    if (progressBar) progressBar.style.width = (visited.size / RESOURCES.length * 100) + '%';
    SCORM.setProgress(i); SCORM.commit();
  }
  function report(finish) {
    const ks = Object.keys(quizScores);
    if (ks.length) { let g = 0, t = 0; ks.forEach(k => { g += quizScores[k].score; t += quizScores[k].total; }); const pct = t ? Math.round(g / t * 100) : 0; SCORM.setScore(pct); SCORM.setStatus(pct >= MASTERY ? 'passed' : 'failed'); }
    else if (visited.size >= RESOURCES.length) SCORM.setStatus('completed');
    SCORM.commit(); if (finish) SCORM.finish();
  }
  window.addEventListener('message', (e) => { const d = e.data || {}; if (d.type === 'scorm-quiz-score' && typeof d.total === 'number') { quizScores[current] = { score: d.score || 0, total: d.total }; report(false); } });
  if (btnPrev) btnPrev.addEventListener('click', () => show(current - 1));
  if (btnNext) btnNext.addEventListener('click', () => show(current + 1));
  if (btnFinish) btnFinish.addEventListener('click', () => { report(true); if (crumb) crumb.textContent = '✓ Curso finalizado'; });
  SCORM.init(); renderMenu(); show(Math.min(SCORM.getProgress() || 0, RESOURCES.length - 1));
})();
"""

# Recursos de muestra (data URI) para que el preview del shell renderice sin el paquete real.
_SAMPLE_COURSE = """
/* === DAVIVIENDA:COURSE (no editar) === */
window.RESOURCES = [
  { titulo: "Bienvenida", bloque: "Introducción", file: "data:text/html;charset=utf-8," + encodeURIComponent("<body style='font-family:sans-serif;padding:40px'><h1 style='color:#DA291C'>Bienvenida</h1><p>Contenido del recurso 1.</p></body>") },
  { titulo: "Desarrollo", bloque: "Contenido", file: "data:text/html;charset=utf-8," + encodeURIComponent("<body style='font-family:sans-serif;padding:40px'><h1>Desarrollo</h1><p>Contenido del recurso 2.</p></body>") },
  { titulo: "Evaluación", bloque: "Cierre", file: "data:text/html;charset=utf-8," + encodeURIComponent("<body style='font-family:sans-serif;padding:40px'><h1>Evaluación</h1></body>") }
];
window.MASTERY = 70;
window.COURSE_TITLE = "Vista previa del curso";
/* === END:COURSE === */
"""

DEFAULT_SHELL = (
    """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Curso Davivienda</title>
<style>
  :root { --red:#DA291C; --yellow:#FFD700; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Segoe UI',Arial,sans-serif; height:100vh; display:flex; flex-direction:column; overflow:hidden; }
  header { background:var(--red); color:#fff; padding:14px 20px; display:flex; align-items:center; gap:12px; }
  header h1 { font-size:18px; font-weight:700; }
  .progress { height:4px; background:#eee; } .progress > div { height:100%; width:0; background:var(--yellow); transition:width .3s; }
  .main { flex:1; display:flex; min-height:0; }
  .sidebar { width:280px; background:#f7f7f8; border-right:1px solid #e5e5e5; overflow-y:auto; padding:12px; }
  .menu-bloque { font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:#999; margin:14px 8px 6px; font-weight:700; }
  .menu-item { display:flex; align-items:center; gap:8px; width:100%; text-align:left; border:0; background:none; padding:9px 10px; border-radius:8px; cursor:pointer; font-size:13px; color:#444; }
  .menu-item:hover { background:#ececec; } .menu-item.active { background:#fdeaea; color:var(--red); font-weight:600; }
  .menu-dot { width:8px; height:8px; border-radius:50%; background:#ccc; flex:0 0 auto; } .menu-dot.done { background:#2bb24c; }
  .content { flex:1; display:flex; flex-direction:column; min-width:0; }
  .crumb { padding:8px 16px; font-size:13px; color:#666; border-bottom:1px solid #eee; background:#fff; }
  iframe { flex:1; width:100%; border:0; background:#fff; }
  footer { display:flex; align-items:center; gap:10px; padding:10px 16px; border-top:1px solid #e5e5e5; background:#fff; }
  button.nav { border:0; border-radius:8px; padding:9px 18px; font-size:14px; font-weight:600; cursor:pointer; }
  button.nav:disabled { opacity:.4; cursor:default; } .nav.prev { background:#eee; color:#333; } .nav.next,.nav.finish { background:var(--red); color:#fff; }
  .spacer { flex:1; }
</style>
</head>
<body>
  <header><h1 id="courseTitle">Curso Davivienda</h1></header>
  <div class="progress"><div id="progressBar"></div></div>
  <div class="main">
    <nav class="sidebar" id="menu"></nav>
    <div class="content">
      <div class="crumb" id="crumb"></div>
      <iframe id="contentFrame" title="contenido"></iframe>
      <footer>
        <button class="nav prev" id="btnPrev">‹ Anterior</button>
        <div class="spacer"></div>
        <button class="nav next" id="btnNext">Siguiente ›</button>
        <button class="nav finish" id="btnFinish" style="display:none">Finalizar curso ✓</button>
      </footer>
    </div>
  </div>
  <script>/* === SCORM API (no editar) === */
"""
    + SCORM_API_JS
    + "\n/* === END:SCORM API === */</script>\n  <script>"
    + _SAMPLE_COURSE
    + "</script>\n  <script>/* === PLAYER (no editar) === */"
    + _PLAYER_LOGIC
    + "/* === END:PLAYER === */</script>\n</body>\n</html>"
)


def _player_index(curso_nombre: str, resources_js: str) -> str:
    """index.html del player (shell con menú, iframe, nav y branding Davivienda)."""
    title = _html.escape(curso_nombre)
    return (
        """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>__TITLE__</title>
<style>
  :root { --red:#DA291C; --yellow:#FFD700; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Open Sans','Segoe UI',sans-serif; height:100vh; display:flex; flex-direction:column; overflow:hidden; }
  header { background:var(--red); color:#fff; padding:14px 20px; display:flex; align-items:center; gap:12px; }
  header h1 { font-size:18px; font-weight:700; }
  .progress { height:4px; background:#eee; }
  .progress > div { height:100%; width:0; background:var(--yellow); transition:width .3s; }
  .main { flex:1; display:flex; min-height:0; }
  .sidebar { width:280px; background:#f7f7f8; border-right:1px solid #e5e5e5; overflow-y:auto; padding:12px; }
  .menu-bloque { font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:#999; margin:14px 8px 6px; font-weight:700; }
  .menu-item { display:flex; align-items:center; gap:8px; width:100%; text-align:left; border:0; background:none;
    padding:9px 10px; border-radius:8px; cursor:pointer; font-size:13px; color:#444; }
  .menu-item:hover { background:#ecec; background:#ececec; }
  .menu-item.active { background:#fdeaea; color:var(--red); font-weight:600; }
  .menu-dot { width:8px; height:8px; border-radius:50%; background:#ccc; flex:0 0 auto; }
  .menu-dot.done { background:#2bb24c; }
  .content { flex:1; display:flex; flex-direction:column; min-width:0; }
  .crumb { padding:8px 16px; font-size:13px; color:#666; border-bottom:1px solid #eee; background:#fff; }
  iframe { flex:1; width:100%; border:0; background:#fff; }
  footer { display:flex; align-items:center; gap:10px; padding:10px 16px; border-top:1px solid #e5e5e5; background:#fff; }
  button.nav { border:0; border-radius:8px; padding:9px 18px; font-size:14px; font-weight:600; cursor:pointer; }
  button.nav:disabled { opacity:.4; cursor:default; }
  .nav.prev { background:#eee; color:#333; }
  .nav.next, .nav.finish { background:var(--red); color:#fff; }
  .spacer { flex:1; }
</style>
</head>
<body>
  <header>
    <h1>__TITLE__</h1>
  </header>
  <div class="progress"><div id="progressBar"></div></div>
  <div class="main">
    <nav class="sidebar" id="menu"></nav>
    <div class="content">
      <div class="crumb" id="crumb"></div>
      <iframe id="contentFrame" title="contenido"></iframe>
      <footer>
        <button class="nav prev" id="btnPrev">‹ Anterior</button>
        <div class="spacer"></div>
        <button class="nav next" id="btnNext">Siguiente ›</button>
        <button class="nav finish" id="btnFinish" style="display:none">Finalizar curso ✓</button>
      </footer>
    </div>
  </div>
  <script src="scorm_api.js"></script>
  <script>const RESOURCES = __RESOURCES__;</script>
  <script src="player.js"></script>
</body>
</html>"""
        .replace("__TITLE__", title)
        .replace("__RESOURCES__", resources_js)
    )


def _manifest(curso_nombre: str, mastery: int, all_files: list[str]) -> str:
    title = _html.escape(curso_nombre)
    files_xml = "\n".join(
        f'            <file href="{_html.escape(f)}"/>' for f in all_files
    )
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="davivienda_scorm" version="1.0"
    xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
    xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
                        http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="org">
    <organization identifier="org">
      <title>{title}</title>
      <item identifier="item_1" identifierref="resource_1">
        <title>{title}</title>
        <adlcp:masteryscore>{mastery}</adlcp:masteryscore>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="resource_1" type="webcontent" adlcp:scormtype="sco" href="index.html">
{files_xml}
    </resource>
  </resources>
</manifest>
"""


# URLs http(s) en atributos src/href/data-src y <source>
_URL_ATTR_RE = re.compile(r"""(src|href|data-src)\s*=\s*["'](https?://[^"']+)["']""", re.I)


def _slug(text: str, fallback: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", (text or "").lower()).strip("-")
    return s[:40] or fallback


def _ext_from(url: str, content_type: str | None) -> str:
    path = urlparse(url).path
    if "." in path.split("/")[-1]:
        return path.split(".")[-1].split("?")[0][:5]
    ct = (content_type or "").lower()
    if "mpeg" in ct or "mp3" in ct:
        return "mp3"
    if "mp4" in ct:
        return "mp4"
    if "png" in ct:
        return "png"
    if "jpeg" in ct or "jpg" in ct:
        return "jpg"
    return "bin"


def _download_assets(html: str, asset_cache: dict[str, str], blobs: dict[str, bytes]) -> str:
    """Descarga las URLs del HTML a assets/ y reescribe a rutas relativas (../assets/...).
    asset_cache: url -> nombre de archivo (dedup global). blobs: nombre -> bytes."""
    def repl(m: re.Match) -> str:
        attr, url = m.group(1), m.group(2)
        local = asset_cache.get(url)
        if not local:
            try:
                r = requests.get(url, timeout=60)
                r.raise_for_status()
                name = f"asset_{len(asset_cache) + 1}_{_slug(urlparse(url).path.split('/')[-1], 'a')}.{_ext_from(url, r.headers.get('content-type'))}"
                asset_cache[url] = name
                blobs[name] = r.content
                local = name
            except Exception:
                return m.group(0)  # si falla la descarga, dejamos la URL original
        # Las páginas de recurso viven en resources/, así que el asset queda en ../assets/
        return f'{attr}="../assets/{local}"'

    return _URL_ATTR_RE.sub(repl, html)


def _video_page(titulo: str, video_url: str) -> str:
    return (
        """<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><title>__T__</title>
<style>body{margin:0;background:#000;height:100vh;display:flex;align-items:center;justify-content:center}
video{max-width:100%;max-height:100vh}</style></head>
<body><video src="__V__" controls></video></body></html>"""
        .replace("__T__", _html.escape(titulo)).replace("__V__", _html.escape(video_url))
    )


def empaquetar_scorm(payload: dict[str, Any]) -> bytes:
    """Construye el zip SCORM en memoria y devuelve sus bytes."""
    curso_nombre = payload.get("curso_nombre") or "Curso Davivienda"
    mastery = int(payload.get("passing_score") or 70)
    recursos = payload.get("recursos") or []

    asset_cache: dict[str, str] = {}
    asset_blobs: dict[str, bytes] = {}
    resource_files: list[dict[str, str]] = []  # para RESOURCES del player
    page_blobs: dict[str, str] = {}            # resources/NN.html -> html

    for idx, r in enumerate(recursos):
        titulo = r.get("titulo") or f"Recurso {idx + 1}"
        bloque = r.get("bloque") or ""
        html = r.get("html")
        if not html and r.get("video_url"):
            html = _video_page(titulo, r["video_url"])
        if not html:
            html = f"<!DOCTYPE html><html><body><h2>{_html.escape(titulo)}</h2></body></html>"
        # asset extra explícito (ej: video_url usado dentro de un html propio)
        html = _download_assets(html, asset_cache, asset_blobs)
        fname = f"{idx + 1:02d}-{_slug(titulo, 'recurso')}.html"
        page_blobs[fname] = html
        resource_files.append({"file": fname, "titulo": titulo, "bloque": bloque, "tipo": r.get("tipo", "")})

    # RESOURCES como JS (lista de objetos)
    resources_js = _json.dumps(resource_files, ensure_ascii=False)

    # Shell self-contained (CSS + lógica + COURSE inline). El editado (shell_html) o el
    # por defecto; se le inyecta el bloque COURSE con los recursos reales.
    shell = payload.get("shell_html") or DEFAULT_SHELL
    index_html = inject_course(shell, resources_js, mastery, curso_nombre)

    all_files = (
        [f"resources/{n}" for n in page_blobs]
        + [f"assets/{n}" for n in asset_blobs]
    )
    manifest = _manifest(curso_nombre, mastery, all_files)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("index.html", index_html)
        z.writestr("imsmanifest.xml", manifest)
        for name, content in page_blobs.items():
            z.writestr(f"resources/{name}", content)
        for name, content in asset_blobs.items():
            z.writestr(f"assets/{name}", content)
    return buf.getvalue()
