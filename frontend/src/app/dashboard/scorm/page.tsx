"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { listarSolicitudes, obtenerMalla, empaquetarScorm, obtenerScormShell, guardarScormShell, AGENT_URL, SolicitudListItem, MallaItem, Guion, type ScormRecurso } from "@/lib/api";
import { resourceFinalHtml } from "@/lib/resource-final-html";
import { useCompany, useWsPreviewSrc } from "@/contexts/CompanyContext";
import { useAgentJobs } from "@/contexts/AgentJobsContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const SHELL_MODELS = [
  { value: "claude-haiku-4-5", label: "Haiku 4.5 (económico)" },
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6 (recomendado)" },
  { value: "claude-opus-4-8", label: "Opus 4.8 (máxima calidad)" },
];

// Editor IA del shell (envoltorio) del paquete SCORM. Self-contained → preview directo.
function ShellEditor({ sessionKey, seedHtml, onHtmlChange }: {
  sessionKey: string;
  seedHtml: string;
  onHtmlChange: (html: string) => void;
}) {
  const { getJob, start, getDraft, setDraft } = useAgentJobs();
  const job = getJob(sessionKey);
  const instruction = getDraft(sessionKey);
  const running = job?.running ?? false;
  const events = job?.events ?? [];
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [previewKey, setPreviewKey] = useState(0);
  const [hasEdited, setHasEdited] = useState(() => Boolean(job));
  const applied = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (job?.html && job.htmlVersion > applied.current) {
      applied.current = job.htmlVersion;
      setHasEdited(true);
      setPreviewKey((k) => k + 1);
      onHtmlChange(job.html);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.htmlVersion]);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [events.length]);

  const previewSrc = useWsPreviewSrc(sessionKey, previewKey);
  return (
    <div className="rounded-lg border bg-white">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className="text-sm font-semibold text-gray-700">🎨 Editar plantilla del paquete con IA</span>
        <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700">Claude Agent SDK</span>
        <span className="ml-auto text-xs text-gray-400">{job?.status ?? "listo"}</span>
      </div>
      <div className="bg-gray-200 p-2">
        <iframe
          key={`${hasEdited}-${previewKey}`}
          {...(hasEdited ? { src: previewSrc } : { srcDoc: seedHtml })}
          className="w-full rounded bg-white"
          style={{ height: 460, border: 0 }}
          title="shell"
        />
      </div>
      <div className="space-y-2 p-3">
        <textarea
          value={instruction}
          onChange={(e) => setDraft(sessionKey, e.target.value)}
          placeholder="Ej: Header azul corporativo, menú arriba en vez de lateral, tipografía más grande, agregá una portada con el logo. (No rompas la navegación.)"
          className="h-20 w-full resize-y rounded-lg border border-gray-300 p-2.5 text-sm focus:border-red-500 focus:outline-none"
        />
        <div className="flex items-center gap-2">
          <select value={model} onChange={(e) => setModel(e.target.value)} className="rounded-lg border border-gray-300 p-1.5 text-xs">
            {SHELL_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <Button size="sm" className="ml-auto" disabled={running || !instruction.trim()} onClick={() => start(sessionKey, { instruction, model, seedHtml })}>
            {running ? "Trabajando…" : "Editar con IA"}
          </Button>
        </div>
        {events.length > 0 && (
          <div ref={logRef} className="max-h-32 overflow-y-auto rounded border border-gray-100 p-2 text-xs">
            {events.map((e) => (
              <div key={e.id} className="flex gap-1.5 py-0.5">
                <span className="w-3 shrink-0 text-center">{e.icon}</span>
                <span className={e.cls === "tool" ? "font-mono text-gray-500" : e.cls === "result" ? "font-semibold text-green-700" : e.cls === "error" ? "text-red-600" : "text-gray-800"}>{e.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ScormPage() {
  const { company } = useCompany();
  const searchParams = useSearchParams();
  const router = useRouter();
  const mallaId = searchParams.get("malla");

  const [loading, setLoading] = useState(true);
  const [enProcesoList, setEnProcesoList] = useState<SolicitudListItem[]>([]);
  const [mallaItems, setMallaItems] = useState<MallaItem[]>([]);
  const [guiones, setGuiones] = useState<Guion[]>([]);
  const [cursoNombre, setCursoNombre] = useState("");
  const [packaging, setPackaging] = useState(false);
  const [packaged, setPackaged] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [packageError, setPackageError] = useState<string | null>(null);
  // Shell (envoltorio) del paquete
  const [shellHtml, setShellHtml] = useState<string>("");
  const [shellDefault, setShellDefault] = useState<string>("");
  const [shellGlobal, setShellGlobal] = useState<string>("");
  const [shellMsg, setShellMsg] = useState<string | null>(null);
  const [savingShell, setSavingShell] = useState(false);

  useEffect(() => {
    if (mallaId) {
      loadMalla();
    } else {
      loadEnProceso();
    }
  }, [mallaId]);

  const loadEnProceso = async () => {
    setLoading(true);
    try {
      const result = await listarSolicitudes({ status: "en_proceso" });
      setEnProcesoList(result.solicitudes.filter(s => s.malla_id));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadMalla = async () => {
    if (!mallaId) return;
    setLoading(true);
    try {
      const malla = await obtenerMalla(mallaId);
      setMallaItems(malla.malla || []);
      setGuiones(malla.guiones || []);
      if (malla.solicitud?.curso?.nombre) setCursoNombre(malla.solicitud.curso.nombre);
      // Shell: override del curso → global → default.
      try {
        const sh = await obtenerScormShell();
        setShellDefault(sh.default);
        setShellGlobal(sh.global || "");
        setShellHtml(malla.scorm_shell_html || sh.global || sh.default);
      } catch { /* sin shell config */ }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePackage = async () => {
    if (!mallaId) return;
    setPackaging(true);
    setPackageError(null);
    setPackaged(false);
    setDownloadUrl(null);
    try {
      const cursoNombre = enProcesoList.find(s => s.malla_id === mallaId)?.curso_nombre
        || mallaItems[0]?.bloque || `Curso ${company.nombre}`;
      // Por cada recurso: su HTML final (editado o generado) o el video.
      const recursos: ScormRecurso[] = mallaItems.map((item, i) => {
        const guion = guiones.find(g => g.id === item.id);
        const base = { id: item.id, orden: i, titulo: item.recurso, bloque: item.bloque, tipo: item.tipo_recurso };
        // Para video: el compuesto (split/slides) si existe, si no el avatar/video crudo.
        const c = (guion?.contenido || {}) as { composed_url?: string; video_url?: string };
        const videoUrl = c.composed_url || c.video_url;
        if ((item.tipo_recurso === "Video" || item.tipo_recurso === "Video avatar") && videoUrl) {
          return { ...base, video_url: videoUrl };
        }
        return { ...base, html: guion ? resourceFinalHtml(guion, item.tipo_recurso, item.recurso, company) : undefined };
      });

      const result = await empaquetarScorm({
        malla_id: mallaId,
        curso_nombre: cursoNombre,
        passing_score: 70,
        recursos,
        shell_html: shellHtml || undefined,
      });
      setDownloadUrl(result.download_url);
      setPackaged(true);
    } catch (e) {
      setPackageError(e instanceof Error ? e.message : "Error al empaquetar");
    } finally {
      setPackaging(false);
    }
  };

  // Previsualiza el curso REAL dentro del shell: inyecta los recursos (HTML como
  // data-URI, o el video por URL) en el bloque COURSE y abre el resultado.
  const previewCurso = () => {
    if (!shellHtml) return;
    const resources = mallaItems.map((item) => {
      const guion = guiones.find((g) => g.id === item.id);
      const html = guion ? resourceFinalHtml(guion, item.tipo_recurso, item.recurso, company) : `<h1>${item.recurso}</h1>`;
      const file = "data:text/html;charset=utf-8," + encodeURIComponent(html);
      return { titulo: item.recurso, bloque: item.bloque, tipo: item.tipo_recurso, file };
    });
    const block =
      `/* === DAVIVIENDA:COURSE (no editar) === */\n` +
      `window.RESOURCES = ${JSON.stringify(resources)};\n` +
      `window.MASTERY = 70;\n` +
      `window.COURSE_TITLE = ${JSON.stringify(cursoNombre || "Curso")};\n` +
      `/* === END:COURSE === */`;
    const full = shellHtml.replace(
      /\/\* === DAVIVIENDA:COURSE[\s\S]*?=== \*\/[\s\S]*?\/\* === END:COURSE === \*\//,
      () => block
    );
    const url = URL.createObjectURL(new Blob([full], { type: "text/html" }));
    window.open(url, "_blank");
  };

  const saveShell = async (scope: "global" | "course") => {
    setSavingShell(true);
    setShellMsg(null);
    try {
      await guardarScormShell(scope, shellHtml, mallaId || undefined);
      if (scope === "global") setShellGlobal(shellHtml);
      setShellMsg(scope === "global" ? "✓ Guardado como plantilla global (todos los cursos)" : "✓ Guardado para este curso");
    } catch (e) {
      setShellMsg(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSavingShell(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
      </div>
    );
  }

  if (!mallaId) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">SCORM</h1>
          <p className="text-gray-500">Empaqueta el curso en formato SCORM 1.2</p>
        </div>

        {enProcesoList.length > 0 ? (
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-700 flex items-center gap-2">
              <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
              Trabajos en Progreso
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {enProcesoList.map((sol) => (
                <Card
                  key={sol.id}
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => router.push(`/dashboard/scorm?malla=${sol.malla_id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-gray-900">{sol.curso_nombre}</h3>
                      <Badge className="bg-yellow-100 text-yellow-700">Sin empaquetar</Badge>
                    </div>
                    <p className="text-sm text-gray-500 mb-3">{sol.area}</p>
                    <Button size="sm" className="w-full">Empaquetar SCORM</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <p className="text-gray-500 mb-4">Primero genera el contenido del curso</p>
              <Button onClick={() => router.push("/dashboard/contenido")}>Ir a Contenido</Button>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/scorm")}>
            <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Cursos
          </Button>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 truncate">{cursoNombre || "Empaquetado SCORM"}</h1>
            <p className="text-sm text-gray-500">Empaquetado SCORM · {mallaItems.length} recursos | {guiones.length} guiones</p>
          </div>
          {packaged && (
            <Button onClick={() => router.push(`/dashboard/lms?malla=${mallaId}`)}>
              Continuar a LMS
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Package info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              Paquete SCORM 1.2
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Recursos</span>
                <p className="font-medium">{mallaItems.length}</p>
              </div>
              <div>
                <span className="text-gray-500">Guiones</span>
                <p className="font-medium">{guiones.length}</p>
              </div>
              <div>
                <span className="text-gray-500">Formato</span>
                <p className="font-medium">SCORM 1.2</p>
              </div>
              <div>
                <span className="text-gray-500">Compatible con</span>
                <p className="font-medium">Territorium LMS</p>
              </div>
            </div>

            {packaged ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-4 bg-green-50 rounded-lg text-green-700">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Paquete SCORM generado exitosamente
                </div>
                <a href={downloadUrl || "#"} download target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="w-full">
                    <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Descargar SCORM.zip
                  </Button>
                </a>
                <Button variant="ghost" className="w-full text-gray-500" onClick={() => { setPackaged(false); setDownloadUrl(null); }}>
                  Volver a generar
                </Button>
              </div>
            ) : packaging ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-4 bg-blue-50 rounded-lg text-blue-700">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                  Generando paquete SCORM...
                </div>
                <Progress value={66} className="h-2" />
              </div>
            ) : (
              <div className="space-y-2">
                <Button onClick={handlePackage} className="w-full bg-red-600 hover:bg-red-700">
                  <svg className="mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  Generar Paquete SCORM
                </Button>
                {packageError && (
                  <p className="text-sm text-red-600">{packageError}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Content preview */}
        <Card>
          <CardHeader>
            <CardTitle>Contenido del paquete</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-80 overflow-auto">
              {mallaItems.map((item, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">
                      {item.tipo_recurso === "Video avatar" && "🎬"}
                      {item.tipo_recurso === "Video" && "📹"}
                      {item.tipo_recurso === "Quiz" && "❓"}
                      {item.tipo_recurso === "Infografía" && "📊"}
                      {item.tipo_recurso === "Interactivo" && "🖱️"}
                      {item.tipo_recurso === "Comparador" && "⚖️"}
                      {item.tipo_recurso === "Flashcards" && "🃏"}
                      {item.tipo_recurso === "Caso práctico" && "💼"}
                    </span>
                    <div>
                      <p className="font-medium text-sm text-gray-900">{item.recurso}</p>
                      <p className="text-xs text-gray-500">{item.tipo_recurso}</p>
                    </div>
                  </div>
                  <Badge className="bg-green-100 text-green-700 text-xs">Listo</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Plantilla del paquete (envoltorio / shell) */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Plantilla del paquete (envoltorio)</CardTitle>
          <p className="text-sm text-gray-500">
            Editá el player que rodea al contenido (header, menú, navegación, colores, portada).
            El preview usa recursos de muestra. Al empaquetar se usa con los recursos reales.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {shellHtml ? (
            <ShellEditor
              sessionKey={`${mallaId}_scorm_shell`}
              seedHtml={shellHtml}
              onHtmlChange={setShellHtml}
            />
          ) : (
            <p className="text-sm text-gray-500">Cargando plantilla…</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={previewCurso} disabled={!shellHtml || mallaItems.length === 0}>
              👁 Previsualizar curso completo
            </Button>
            <Button size="sm" onClick={() => saveShell("course")} disabled={savingShell || !shellHtml}>
              Guardar para este curso
            </Button>
            <Button size="sm" variant="outline" onClick={() => saveShell("global")} disabled={savingShell || !shellHtml}>
              Guardar como global (todos)
            </Button>
            <Button size="sm" variant="ghost" className="text-gray-500" disabled={!shellDefault} onClick={() => { setShellHtml(shellGlobal || shellDefault); setShellMsg("Restablecido (no guardado)"); }}>
              Restablecer
            </Button>
            {shellMsg && <span className="text-xs text-gray-500">{shellMsg}</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
