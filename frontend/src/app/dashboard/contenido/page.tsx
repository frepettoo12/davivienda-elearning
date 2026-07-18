"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  obtenerMalla,
  listarSolicitudes,
  generarAudio,
  generarVideo,
  obtenerJob,
  guardarGuion,
  MallaItem,
  Guion,
  SolicitudListItem,
} from "@/lib/api";
import { AGENT_URL, composeSplitVideo, composeSlidesVideo, iterarGuionRequest } from "@/lib/api";
import { useAgentJobs, type AgentImage } from "@/contexts/AgentJobsContext";
import { openResourceInNewTab, generateResourceHTML } from "@/lib/resource-renderer";
import { Brand, DEFAULT_BRAND, safeFont } from "@/lib/brand";
import { useCompany, useWsPreviewSrc } from "@/contexts/CompanyContext";
import { RenderComponents, isComponentContent, type ResourceComponent } from "@/lib/component-renderer";
import { openComponentsInNewTab, generateFullHTML, type ComponentContentWithConfig } from "@/lib/component-html-generator";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProcessStepper } from "@/components/process-stepper";

const TIPO_RECURSO_ICONS: Record<string, string> = {
  "Video avatar": "🎬",
  "Video": "📹",
  "Interactivo": "🖱️",
  "Infografía": "📊",
  "Comparador": "⚖️",
  "Flashcards": "🃏",
  "Caso práctico": "💼",
  "Quiz": "❓",
};

// Resources that need audio/video generation
const NEEDS_GENERATION = ["Video avatar", "Video"];

// Resources that have background music in final SCORM

type VisualFormatOption = {
  id: string;
  label: string;
  hint: string;
  keywords: RegExp;
  instruction: string;
};

type SlideAddOptionId =
  | "detalle_profundo"
  | "caso_aplicado"
  | "checklist_accion"
  | "quiz_rapido"
  | "mitos_realidad";

type SlideAddOption = {
  id: SlideAddOptionId;
  label: string;
  hint: string;
};

const INTERACTIVE_VISUAL_FORMATS: VisualFormatOption[] = [
  {
    id: "none",
    label: "Sin forzar formato",
    hint: "Solo edición de contenido",
    keywords: /$^/,
    instruction: "",
  },
  {
    id: "tabs_horizontal",
    label: "Tabs horizontal",
    hint: "Contenido en pestañas lado a lado",
    keywords: /(horizontal|en fila|lado a lado|tabs|pestañas|pestanas)/i,
    instruction: `CONVERSION DE FORMATO (permitida):
- Convierte el recurso a formato Tabs horizontales.
- Mantén estrictamente la estructura JSON de Interactivo:
  {"titulo":"...","elementos":[{"etiqueta":"...","contenido_oculto":"..."}]}
- Reescribe "etiqueta" como nombres cortos de pestañas (max 3 palabras).
- Reescribe "contenido_oculto" como contenido resumido por pestaña.
- Actualiza título o instrucción incluyendo la palabra "Tabs".`,
  },
  {
    id: "roadmap_timeline",
    label: "Roadmap / Timeline",
    hint: "Vista por pasos secuenciales",
    keywords: /(roadmap|línea de tiempo|linea de tiempo|timeline|paso a paso|secuencia|proceso)/i,
    instruction: `CONVERSION DE FORMATO (permitida):
- Convierte el recurso a formato Roadmap / Línea de tiempo.
- Mantén estrictamente la estructura JSON de Interactivo:
  {"titulo":"...","elementos":[{"etiqueta":"...","contenido_oculto":"..."}]}
- Usa "etiqueta" para el nombre de cada paso.
- Usa "contenido_oculto" para el detalle operativo de cada paso.
- Incluye en título o instrucción la palabra "Roadmap" o "Timeline".`,
  },
  {
    id: "cards_grid",
    label: "Cards en grilla",
    hint: "Bloques visuales tipo tarjetas",
    keywords: /(tarjetas|cards|mosaico|grilla|grid|bloques|paneles)/i,
    instruction: `CONVERSION DE FORMATO (permitida):
- Convierte el recurso a formato Cards en grilla.
- Mantén estrictamente la estructura JSON de Interactivo:
  {"titulo":"...","elementos":[{"etiqueta":"...","contenido_oculto":"..."}]}
- Usa "etiqueta" como título de cada card y "contenido_oculto" como descripción.
- Incluye en título o instrucción la palabra "Cards" o "Tarjetas".`,
  },
  {
    id: "checklist_steps",
    label: "Checklist de pasos",
    hint: "Lista accionable de verificación",
    keywords: /(checklist|check list|lista de chequeo|verificación|verificacion|pasos clave)/i,
    instruction: `CONVERSION DE FORMATO (permitida):
- Convierte el recurso a formato Checklist de pasos.
- Mantén estrictamente la estructura JSON de Interactivo:
  {"titulo":"...","elementos":[{"etiqueta":"...","contenido_oculto":"..."}]}
- Cada "etiqueta" debe ser una acción concreta.
- Cada "contenido_oculto" debe explicar criterio de cumplimiento.
- Incluye en título o instrucción la palabra "Checklist".`,
  },
  {
    id: "matrix_2x2",
    label: "Matriz 2x2",
    hint: "Organización por cuadrantes",
    keywords: /(matriz|2x2|cuadrantes|priorización|priorizacion|impacto|esfuerzo)/i,
    instruction: `CONVERSION DE FORMATO (permitida):
- Convierte el recurso a formato Matriz 2x2.
- Mantén estrictamente la estructura JSON de Interactivo:
  {"titulo":"...","elementos":[{"etiqueta":"...","contenido_oculto":"..."}]}
- Limita a 4 elementos clave (uno por cuadrante) o agrupa los existentes.
- "etiqueta" debe nombrar cuadrante, "contenido_oculto" debe detallar criterio.
- Incluye en título o instrucción la palabra "Matriz".`,
  },
];

const GENERIC_REDESIGN_INTENT = /(más linda|mas linda|más visual|mas visual|más ordenad|mas ordenad|más claro|mas claro|más dinámic|mas dinam|mejor diseño|mejor diseno|otra estructura|otro formato|reacomod|redistribu|más prolijo|mas prolijo|disruptiv|techie|tech|futurist|innovador|wow|premium|más moderno|mas moderno|repens|replante|no como|en vez de|en lugar de|otra manera|otra forma|sin tabla|no tabla|tabla no|no me gusta como se ve|no me gusta cómo se ve)/i;
const ADD_SLIDE_INTENT = /(agreg(a|á)|sum(a|á)|inclu(i|í)|cre(a|á)|gener(a|á)|a[nñ]ad(i|í)).*(slide|pantalla|lámina|lamina|sección|seccion)|(nueva|otra|segunda|2da|adicional)\s+(slide|pantalla|lámina|lamina|sección|seccion)|slide\s+(siguiente|extra|nueva|adicional|segunda|2da)/i;
const STYLE_EDIT_INTENT = /(color\s+de\s+fondo|fondo|background|paleta|color primari|color secundari|tema visual|tipograf|fuente|estilo visual)/i;

const SLIDE_ADD_OPTIONS: SlideAddOption[] = [
  { id: "detalle_profundo", label: "Detalle profundo", hint: "Amplía cada punto clave con más contexto" },
  { id: "caso_aplicado", label: "Caso aplicado", hint: "Escenario práctico con decisiones" },
  { id: "checklist_accion", label: "Checklist acción", hint: "Pasos accionables para ejecutar" },
  { id: "quiz_rapido", label: "Quiz rápido", hint: "Validación corta de comprensión" },
  { id: "mitos_realidad", label: "Mitos vs realidad", hint: "Aclarar confusiones frecuentes" },
];

interface ResourceGeneration {
  audioJobId?: string;
  audioStatus?: "pending" | "processing" | "completed" | "failed";
  audioUrl?: string;
  videoJobId?: string;
  videoStatus?: "pending" | "processing" | "completed" | "failed";
  videoUrl?: string;
}

export default function ContenidoPage() {
  const { company } = useCompany();
  const searchParams = useSearchParams();
  const router = useRouter();
  const mallaId = searchParams.get("malla");

  const [mallaItems, setMallaItems] = useState<MallaItem[]>([]);
  const [guiones, setGuiones] = useState<Guion[]>([]);
  const [cursoNombre, setCursoNombre] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enProcesoList, setEnProcesoList] = useState<SolicitudListItem[]>([]);
  const [generations, setGenerations] = useState<Record<number, ResourceGeneration>>({});
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [selectedItem, setSelectedItem] = useState<number | null>(null);
  const [previewVersions, setPreviewVersions] = useState<Record<number, number>>({});
  const [activeTabByResource, setActiveTabByResource] = useState<Record<number, string>>({});
  // Chat histories keyed by resource ID - persists across tab switches
  const [chatHistories, setChatHistories] = useState<Record<number, Array<{ role: "user" | "assistant"; content: string }>>>({});

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
      // Restaurar audio/video ya generados (persistidos en el guión) para que
      // sigan visibles tras recargar.
      const restored: Record<number, ResourceGeneration> = {};
      const toResume: Array<{ jobId: string; resourceId: number }> = [];
      for (const g of malla.guiones || []) {
        const c = g.contenido as { audio_url?: string; video_url?: string; video_job_id?: string };
        if (c.audio_url || c.video_url) {
          restored[g.id] = {
            ...(c.audio_url ? { audioStatus: "completed", audioUrl: c.audio_url } : {}),
            ...(c.video_url ? { videoStatus: "completed", videoUrl: c.video_url } : {}),
          };
        }
        // Video iniciado pero sin URL final → reanudar polling (HeyGen pudo terminar mientras no mirabas).
        if (c.video_job_id && !c.video_url) {
          restored[g.id] = { ...(restored[g.id] || {}), videoStatus: "processing", videoJobId: c.video_job_id };
          toResume.push({ jobId: c.video_job_id, resourceId: g.id });
        }
      }
      if (Object.keys(restored).length) setGenerations(restored);
      toResume.forEach(({ jobId, resourceId }) => pollJob(jobId, resourceId, "video"));
    } catch (err) {
      setError("Error al cargar la malla");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getGuionForItem = (itemId: number) => guiones.find(g => g.id === itemId);

  // Poll job status
  const pollJob = async (
    jobId: string,
    resourceId: number,
    type: "audio" | "video",
    onComplete?: (url: string) => void
  ) => {
    const poll = async () => {
      try {
        const job = await obtenerJob(jobId);

        setGenerations(prev => ({
          ...prev,
          [resourceId]: {
            ...prev[resourceId],
            ...(type === "audio"
              ? { audioStatus: job.status, audioUrl: job.output_url }
              : { videoStatus: job.status, videoUrl: job.output_url }
            ),
          }
        }));

        if (job.status === "completed" && job.output_url) {
          // Persistir la URL en el guión para que sobreviva al recargar.
          if (mallaId) {
            const field = type === "audio" ? "audio_url" : "video_url";
            void guardarGuion(mallaId, resourceId, { [field]: job.output_url }).catch(() => {});
          }
          if (onComplete) onComplete(job.output_url);
        } else if (job.status === "pending" || job.status === "processing") {
          setTimeout(poll, 3000);
        }
      } catch (err) {
        // Reintentar ante errores transitorios (no matar el polling).
        console.error("Error polling job (reintenta):", err);
        setTimeout(poll, 5000);
      }
    };
    poll();
  };

  // Generate audio for a resource
  const handleGenerateAudio = async (item: MallaItem) => {
    const guion = getGuionForItem(item.id);
    if (!guion || !mallaId) return;

    const voiceover = guion.contenido.voiceover || guion.contenido.texto;
    if (!voiceover) {
      setError("Este recurso no tiene texto para generar audio");
      return;
    }

    setGeneratingId(item.id);
    setError(null);

    try {
      const result = await generarAudio(mallaId, item.id, voiceover);
      setGenerations(prev => ({
        ...prev,
        [item.id]: {
          ...prev[item.id],
          audioJobId: result.job_id,
          audioStatus: "pending",
        }
      }));
      pollJob(result.job_id, item.id, "audio");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar audio");
    } finally {
      setGeneratingId(null);
    }
  };

  // Generate video (HeyGen) after audio is ready
  const handleGenerateVideo = async (item: MallaItem) => {
    const gen = generations[item.id];
    if (!gen?.audioUrl || !mallaId) return;

    setGeneratingId(item.id);
    setError(null);

    try {
      const result = await generarVideo(mallaId, item.id, gen.audioUrl);
      setGenerations(prev => ({
        ...prev,
        [item.id]: {
          ...prev[item.id],
          videoJobId: result.job_id,
          videoStatus: "pending",
        }
      }));
      // Persistir el job_id para poder reanudar el polling tras recargar/navegar.
      void guardarGuion(mallaId, item.id, { video_job_id: result.job_id }).catch(() => {});
      pollJob(result.job_id, item.id, "video");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar video");
    } finally {
      setGeneratingId(null);
    }
  };

  const needsGeneration = (tipo: string) => NEEDS_GENERATION.includes(tipo);
  const getDefaultTab = (tipo: string) => (needsGeneration(tipo) ? "generar" : "preview");

  // Calculate progress
  const itemsNeedingGen = mallaItems.filter(item => needsGeneration(item.tipo_recurso));
  const completedCount = itemsNeedingGen.filter(item => {
    const gen = generations[item.id];
    if (item.tipo_recurso === "Video avatar") {
      // Video avatar needs both audio and video
      return gen?.videoStatus === "completed";
    }
    // Video (slides) only needs audio, composition happens in SCORM
    return gen?.audioStatus === "completed";
  }).length;
  const progress = itemsNeedingGen.length > 0 ? (completedCount / itemsNeedingGen.length) * 100 : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
      </div>
    );
  }

  // Landing page - no malla selected
  if (!mallaId) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Contenido</h1>
          <p className="text-gray-500">Genera y previsualiza los recursos del curso</p>
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
                  onClick={() => router.push(`/dashboard/contenido?malla=${sol.malla_id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-gray-900">{sol.curso_nombre}</h3>
                      <Badge className="bg-yellow-100 text-yellow-700">Pendiente</Badge>
                    </div>
                    <p className="text-sm text-gray-500 mb-3">{sol.area}</p>
                    <Button size="sm" className="w-full">Generar contenido</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <p className="text-gray-500 mb-4">Primero genera los guiones desde Diseño</p>
              <Button onClick={() => router.push("/dashboard/diseno")}>Ir a Diseño</Button>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  const selectedMallaItem = selectedItem ? mallaItems.find(i => i.id === selectedItem) : null;
  const selectedGuion = selectedItem ? getGuionForItem(selectedItem) : null;
  const selectedGen = selectedItem ? generations[selectedItem] : undefined;

  return (
    <div className="p-6">
      <ProcessStepper current="contenido" mallaId={mallaId} />
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/contenido")}>
            <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Cursos
          </Button>
        </div>
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 truncate">{cursoNombre || "Generación de Contenido"}</h1>
            <p className="text-sm text-gray-500">Generación de Contenido · {mallaItems.length} recursos</p>
          </div>
          <Button onClick={() => router.push(`/dashboard/scorm?malla=${mallaId}`)}>
            Continuar a SCORM
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 p-4 text-red-700">{error}</div>
      )}

      {/* Progress */}
      {itemsNeedingGen.length > 0 && (
        <Card className="mb-6">
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Progreso de generación</span>
              <span className="text-sm text-gray-500">{completedCount} / {itemsNeedingGen.length} videos</span>
            </div>
            <Progress value={progress} className="h-2" />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Resources list */}
        <div className="space-y-3">
          <h2 className="font-semibold text-gray-700">Recursos</h2>
          {mallaItems.map((item) => {
            const guion = getGuionForItem(item.id);
            const gen = generations[item.id];
            const isSelected = selectedItem === item.id;
            const needsGen = needsGeneration(item.tipo_recurso);

            // Determine status
            let statusBadge = null;
            if (needsGen) {
              if (item.tipo_recurso === "Video avatar" && gen?.videoStatus === "completed") {
                statusBadge = <Badge className="bg-green-100 text-green-700">Video listo</Badge>;
              } else if (gen?.audioStatus === "completed" && item.tipo_recurso !== "Video avatar") {
                statusBadge = <Badge className="bg-green-100 text-green-700">Audio listo</Badge>;
              } else if (gen?.videoStatus === "processing" || gen?.audioStatus === "processing") {
                statusBadge = <Badge className="bg-blue-100 text-blue-700">Generando...</Badge>;
              } else if (guion) {
                statusBadge = <Badge className="bg-yellow-100 text-yellow-700">Pendiente</Badge>;
              }
            } else if (guion) {
              statusBadge = <Badge className="bg-green-100 text-green-700">Listo</Badge>;
            }

            return (
              <Card
                key={item.id}
                className={`cursor-pointer transition-all ${isSelected ? "ring-2 ring-red-500" : "hover:shadow-md"}`}
                onClick={() => setSelectedItem(item.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{TIPO_RECURSO_ICONS[item.tipo_recurso] || "📄"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-gray-900 truncate">{item.recurso}</p>
                        {statusBadge}
                      </div>
                      <p className="text-sm text-gray-500">{item.tipo_recurso}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2">
          {selectedMallaItem && selectedGuion ? (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{TIPO_RECURSO_ICONS[selectedMallaItem.tipo_recurso]}</span>
                  <div>
                    <CardTitle>{selectedMallaItem.recurso}</CardTitle>
                    <p className="text-sm text-gray-500">{selectedMallaItem.tipo_recurso} | {selectedMallaItem.duracion_min} min</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs
                  value={activeTabByResource[selectedMallaItem.id] || getDefaultTab(selectedMallaItem.tipo_recurso)}
                  onValueChange={(tab) => {
                    setActiveTabByResource(prev => ({ ...prev, [selectedMallaItem.id]: tab }));
                  }}
                >
                  <TabsList>
                    <TabsTrigger value="guion">Guión</TabsTrigger>
                    {needsGeneration(selectedMallaItem.tipo_recurso) && (
                      <TabsTrigger value="generar">Generar</TabsTrigger>
                    )}
                    {/* El editor de HTML solo aplica a recursos no-video (los de video se
                        editan en Generar → panel del split). */}
                    {!needsGeneration(selectedMallaItem.tipo_recurso) && (
                      <TabsTrigger value="preview">Preview + Editor IA</TabsTrigger>
                    )}
                  </TabsList>

                  {/* Botón Ver Recurso Final - para recursos que no necesitan generación */}
                  {!needsGeneration(selectedMallaItem.tipo_recurso) && selectedGuion && (
                    <div className="mt-4 mb-2">
                      <Button
                        onClick={() => {
                          // Si el agente editó el HTML, esa es la realidad → abrir ESE,
                          // no regenerar desde el JSON (que ignora los cambios del editor).
                          const editedHtml = selectedGuion.contenido.html;
                          if (typeof editedHtml === "string" && editedHtml.trim()) {
                            const url = URL.createObjectURL(new Blob([editedHtml], { type: "text/html" }));
                            window.open(url, "_blank");
                          } else if (isComponentContent(selectedGuion.contenido)) {
                            // Modo componentes - usar generador de componentes
                            openComponentsInNewTab(selectedGuion.contenido, selectedMallaItem.recurso, company);
                          } else {
                            // Modo legacy - usar templates
                            openResourceInNewTab(selectedGuion, selectedMallaItem.tipo_recurso, company);
                          }
                        }}
                        className="w-full bg-green-600 hover:bg-green-700"
                      >
                        <svg className="mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        Ver Recurso Final (nueva pestaña)
                      </Button>
                    </div>
                  )}

                  {/* Guión tab */}
                  <TabsContent value="guion" className="mt-4">
                    <GuionPreview guion={selectedGuion} tipo={selectedMallaItem.tipo_recurso} />
                  </TabsContent>

                  {/* Generate tab */}
                  {needsGeneration(selectedMallaItem.tipo_recurso) && (
                    <TabsContent value="generar" className="mt-4">
                      <GenerationPanel
                        item={selectedMallaItem}
                        guion={selectedGuion}
                        gen={selectedGen}
                        mallaId={mallaId || ""}
                        generating={generatingId === selectedMallaItem.id}
                        onGenerateAudio={() => handleGenerateAudio(selectedMallaItem)}
                        onGenerateVideo={() => handleGenerateVideo(selectedMallaItem)}
                      />
                    </TabsContent>
                  )}

                  {/* Preview + Editor IA (Modo Agente · Claude Agent SDK) */}
                  <TabsContent value="preview" className="mt-4">
                    <ResourceAgentEditor
                      key={`agent-${selectedGuion.id}`}
                      item={selectedMallaItem}
                      guion={selectedGuion}
                      mallaId={mallaId || ""}
                      onUpdate={(newGuion) => {
                        setGuiones(prev => prev.map(g => g.id === newGuion.id ? newGuion : g));
                        setPreviewVersions(prev => ({
                          ...prev,
                          [newGuion.id]: (prev[newGuion.id] || 0) + 1,
                        }));
                        // Persistir el HTML editado para que sobreviva al recargar.
                        if (mallaId && typeof newGuion.contenido.html === "string") {
                          void guardarGuion(mallaId, newGuion.id, { html: newGuion.contenido.html }).catch(() => {});
                        }
                      }}
                    />
                  </TabsContent>

                </Tabs>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-gray-500">
                <svg className="mx-auto h-12 w-12 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <p>Selecciona un recurso para ver detalles</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Editor IA · Modo Agente (Claude Agent SDK). Reemplaza al chat gpt-4o single-shot.
// El agente edita el HTML real del recurso (semilla generada desde el guión JSON)
// en un workspace aislado del agent-service: edita → renderiza headless → mira el
// resultado → se autocorrige. Preview en vivo + persistencia del HTML en el guión.
// ─────────────────────────────────────────────────────────────────────────────
type AgentEv = { id: number; cls: string; icon: string; text: string };

const AGENT_MODELS = [
  { value: "claude-haiku-4-5", label: "Haiku 4.5 (económico)" },
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6 (recomendado)" },
  { value: "claude-opus-4-8", label: "Opus 4.8 (máxima calidad)" },
];

// Biblioteca de música libre con link directo (verificado). Créditos:
// Kevin MacLeod (incompetech.com) — CC BY 4.0 · SoundHelix (T. Schürger) — uso libre.
const MUSIC_LIBRARY = [
  { nombre: "Inspired", mood: "Inspirador / corporativo", url: "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Inspired.mp3", credito: "Kevin MacLeod · CC BY 4.0" },
  { nombre: "Enchanted Valley", mood: "Ambiente tranquilo", url: "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Enchanted%20Valley.mp3", credito: "Kevin MacLeod · CC BY 4.0" },
  { nombre: "Local Forecast – Elevator", mood: "Suave / de fondo", url: "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Local%20Forecast%20-%20Elevator.mp3", credito: "Kevin MacLeod · CC BY 4.0" },
  { nombre: "Wallpaper", mood: "Sutil / minimal", url: "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Wallpaper.mp3", credito: "Kevin MacLeod · CC BY 4.0" },
  { nombre: "Sincerely", mood: "Emotivo / piano", url: "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Sincerely.mp3", credito: "Kevin MacLeod · CC BY 4.0" },
  { nombre: "Carefree", mood: "Alegre / liviano", url: "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Carefree.mp3", credito: "Kevin MacLeod · CC BY 4.0" },
  { nombre: "SoundHelix 1", mood: "Dinámico / electrónico", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", credito: "SoundHelix · uso libre" },
  { nombre: "SoundHelix 8", mood: "Energético", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3", credito: "SoundHelix · uso libre" },
];

function ResourceAgentEditor({ item, guion, mallaId, onUpdate }: {
  item: MallaItem;
  guion: Guion;
  mallaId: string;
  onUpdate: (guion: Guion) => void;
}) {
  const { company } = useCompany();
  const sessionKey = `${mallaId || "m"}_${guion.id}`;
  // Estado de la corrida vive en el contexto global → sobrevive cambiar de recurso/página.
  const { getJob, start, getDraft, setDraft } = useAgentJobs();
  const job = getJob(sessionKey);
  const instruction = getDraft(sessionKey);
  const events = job?.events ?? [];
  const running = job?.running ?? false;
  const status = job?.status ?? "listo";
  const lastCost = job?.lastCost ?? null;

  const [model, setModel] = useState("claude-sonnet-4-6");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [previewKey, setPreviewKey] = useState(0);
  // HTML editado existente, o un job en curso/terminado → mostrar workspace en vivo.
  const [hasAgentHtml, setHasAgentHtml] = useState(() => Boolean(guion.contenido.html) || Boolean(job));
  const [images, setImages] = useState<AgentImage[]>([]);
  // Mini-form "Agregar audio"
  const [showAudio, setShowAudio] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [audioLoop, setAudioLoop] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);
  const appliedVersion = useRef(0);

  // HTML semilla: lo ya editado por el agente, o el render del guión JSON.
  const seedHtml = useMemo(() => {
    if (guion.contenido.html) return guion.contenido.html;
    if (isComponentContent(guion.contenido)) {
      return generateFullHTML(guion.contenido as unknown as ComponentContentWithConfig, item.recurso, company);
    }
    return generateResourceHTML(guion, item.tipo_recurso, company);
  }, [guion, item, company]);

  const previewSrc = useWsPreviewSrc(sessionKey, previewKey);

  // Cuando el agente termina (aunque hayas navegado), aplicar el HTML resultante.
  useEffect(() => {
    if (job?.html && job.htmlVersion > appliedVersion.current) {
      appliedVersion.current = job.htmlVersion;
      setHasAgentHtml(true);
      setPreviewKey((k) => k + 1);
      onUpdate({ ...guion, contenido: { ...guion.contenido, html: job.html } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.htmlVersion]);

  // Autoscroll del log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [events.length]);

  const run = (override?: string) => {
    start(sessionKey, { instruction: override ?? instruction, model, seedHtml, images });
    setImages([]);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-5">
      {/* Preview en vivo */}
      <div className="xl:col-span-3">
        <div className="rounded-lg border bg-white">
          <div className="flex items-center gap-2 border-b px-3 py-2 text-sm">
            <span className="text-gray-500">Preview</span>
            {hasAgentHtml && (
              <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                HTML editado por IA
              </span>
            )}
            <div className="ml-auto flex gap-1.5">
              <button
                onClick={() => setDevice("desktop")}
                className={`rounded px-2.5 py-1 text-xs ${device === "desktop" ? "bg-red-600 text-white" : "bg-gray-100 text-gray-700"}`}
              >
                🖥 Desktop
              </button>
              <button
                onClick={() => setDevice("mobile")}
                className={`rounded px-2.5 py-1 text-xs ${device === "mobile" ? "bg-red-600 text-white" : "bg-gray-100 text-gray-700"}`}
              >
                📱 Mobile
              </button>
              {hasAgentHtml && (
                <button
                  onClick={() => setPreviewKey((k) => k + 1)}
                  className="rounded bg-gray-100 px-2.5 py-1 text-xs text-gray-700"
                >
                  ↻
                </button>
              )}
            </div>
          </div>
          <div className="flex justify-center overflow-auto bg-gray-200 p-3" style={{ minHeight: 420, maxHeight: 620 }}>
            {hasAgentHtml ? (
              <iframe
                key={previewKey}
                src={previewSrc}
                className="bg-white shadow"
                style={{ width: device === "mobile" ? 390 : "100%", height: 600, transition: "width .2s" }}
              />
            ) : (
              // Mismo HTML standalone que abre "Ver Recurso Final" (no el render React),
              // para que el preview refleje la realidad del recurso final.
              <iframe
                key={`seed-${previewKey}`}
                srcDoc={seedHtml}
                className="bg-white shadow"
                style={{ width: device === "mobile" ? 390 : "100%", height: 600, transition: "width .2s" }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Panel del agente */}
      <div className="xl:col-span-2">
        <div className="flex flex-col rounded-lg border bg-white" style={{ maxHeight: 620 }}>
          <div className="border-b p-3">
            <div className="mb-2 flex items-center gap-2">
              <p className="text-sm font-semibold text-gray-700">🤖 Editor IA · Modo Agente</p>
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700">
                Claude Agent SDK
              </span>
              <span className="ml-auto text-xs text-gray-400">{status}</span>
            </div>
            <textarea
              value={instruction}
              onChange={(e) => setDraft(sessionKey, e.target.value)}
              placeholder="Ej: Hacé el comparador más visual con tarjetas, fondo degradado y los colores de la marca. Arreglá el overflow en mobile."
              className="h-24 w-full resize-y rounded-lg border border-gray-300 p-2.5 text-sm focus:border-red-500 focus:outline-none"
            />
            <div className="mt-2 space-y-2">
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded-lg border border-gray-300 p-2 text-xs"
              >
                {AGENT_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAudio((s) => !s)}
                  disabled={running}
                  className={`flex items-center gap-1 whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-medium ${showAudio ? "border-red-500 bg-red-50 text-red-700" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}
                  title="Agregar música / audio al recurso"
                >
                  🎵 Agregar audio
                </button>
                <ImageAttach images={images} setImages={setImages} />
                <Button size="sm" onClick={() => run()} disabled={running} className="ml-auto">
                  {running ? "Trabajando…" : "Ejecutar agente"}
                </Button>
              </div>
            </div>

            {showAudio && (
              <div className="mt-2 space-y-2 rounded-lg border border-red-100 bg-red-50/40 p-3">
                <p className="text-xs font-semibold text-gray-700">🎵 Insertar audio con IA</p>
                <select
                  value={MUSIC_LIBRARY.some((t) => t.url === audioUrl) ? audioUrl : ""}
                  onChange={(e) => {
                    const t = MUSIC_LIBRARY.find((x) => x.url === e.target.value);
                    if (t) setAudioUrl(t.url);
                  }}
                  className="w-full rounded border border-gray-300 p-1.5 text-xs focus:border-red-500 focus:outline-none"
                >
                  <option value="">🎚️ Elegir de la biblioteca…</option>
                  {MUSIC_LIBRARY.map((t) => (
                    <option key={t.url} value={t.url}>{t.nombre} — {t.mood}</option>
                  ))}
                </select>
                <input
                  value={audioUrl}
                  onChange={(e) => setAudioUrl(e.target.value)}
                  placeholder="…o pegá una URL (https://…/pista.mp3)"
                  className="w-full rounded border border-gray-300 p-1.5 text-xs focus:border-red-500 focus:outline-none"
                />
                {audioUrl.trim() && (
                  <div className="space-y-0.5">
                    <audio controls src={audioUrl} className="w-full" style={{ height: 32 }} />
                    {MUSIC_LIBRARY.find((t) => t.url === audioUrl)?.credito && (
                      <p className="text-[10px] text-gray-400">
                        Crédito: {MUSIC_LIBRARY.find((t) => t.url === audioUrl)?.credito}
                      </p>
                    )}
                  </div>
                )}
                <label className="flex items-center gap-1 text-xs text-gray-600">
                  <input type="checkbox" checked={audioLoop} onChange={(e) => setAudioLoop(e.target.checked)} />
                  Repetir en bucle (música de fondo discreta, control flotante)
                </label>
                <Button
                  size="sm"
                  disabled={running || !audioUrl.trim()}
                  onClick={() => {
                    const credito = MUSIC_LIBRARY.find((t) => t.url === audioUrl)?.credito;
                    const instr =
                      `Agregá MÚSICA DE FONDO discreta al recurso (NO un reproductor grande que ocupe el contenido). ` +
                      `Implementala como un control flotante CHICO fijo abajo a la derecha (position:fixed; bottom/right): ` +
                      `un botón con ícono 🔊/🔇 que prende/apaga la música. ` +
                      `Fuente exacta del audio (no la cambies): ${audioUrl.trim()} . ` +
                      `Usá un <audio${audioLoop ? " loop" : ""}> oculto, volumen ~0.3. ` +
                      `Intentá autoplay al cargar y, si el browser lo bloquea, que arranque al primer click del botón. ` +
                      `NO debe tapar ni desplazar el texto del recurso. ` +
                      (credito ? `Incluí el crédito "Música: ${credito}" en letra muy chica junto al control. ` : "") +
                      `No toques el resto del contenido.`;
                    setShowAudio(false);
                    void run(instr);
                  }}
                  className="w-full"
                >
                  Insertar con IA
                </Button>
              </div>
            )}
          </div>
          <div ref={logRef} className="min-h-0 flex-1 overflow-y-auto p-3 text-sm" style={{ minHeight: 160 }}>
            {events.length === 0 ? (
              <p className="text-xs text-gray-400">
                El agente edita el HTML real del recurso: lee, edita, renderiza headless, mira el
                resultado y se autocorrige. El progreso aparece acá en vivo.
              </p>
            ) : (
              events.map((e) => (
                <div key={e.id} className="flex gap-2 border-b border-gray-100 py-1.5">
                  <span className="w-4 shrink-0 text-center">{e.icon}</span>
                  <span
                    className={
                      e.cls === "tool"
                        ? "font-mono text-xs text-gray-600"
                        : e.cls === "result"
                        ? "font-semibold text-green-700"
                        : e.cls === "error"
                        ? "font-semibold text-red-600"
                        : "text-gray-900"
                    }
                  >
                    {e.text}
                  </span>
                </div>
              ))
            )}
          </div>
          {lastCost !== null && (
            <div className="border-t px-3 py-1.5 text-[11px] text-gray-400">
              Costo estimado última edición: ${lastCost.toFixed(4)} · workspace <code>{sessionKey}</code>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Guión preview - shows the script content
function GuionPreview({ guion, tipo }: { guion: Guion; tipo: string }) {
  const { contenido } = guion;
  const voiceover = contenido.voiceover || contenido.texto;

  return (
    <div className="space-y-4">
      {voiceover && (
        <div>
          <label className="text-sm font-medium text-gray-500">Texto del guión</label>
          <div className="mt-2 p-4 bg-gray-50 rounded-lg text-sm text-gray-700 whitespace-pre-wrap">
            {voiceover}
          </div>
        </div>
      )}

      {contenido.puntos_clave && contenido.puntos_clave.length > 0 && (
        <div>
          <label className="text-sm font-medium text-gray-500">Puntos clave</label>
          <ul className="mt-2 space-y-1">
            {contenido.puntos_clave.map((punto, i) => (
              <li key={i} className="flex items-start gap-2 text-gray-700">
                <span className="text-red-500">•</span> {punto}
              </li>
            ))}
          </ul>
        </div>
      )}

      {contenido.slides && contenido.slides.length > 0 && (
        <div>
          <label className="text-sm font-medium text-gray-500">Slides</label>
          <div className="mt-2 space-y-2">
            {contenido.slides.map((slide, i) => (
              <div key={i} className="p-3 bg-gray-50 rounded-lg">
                <p className="font-medium">{i + 1}. {slide.titulo}</p>
                {(slide.bullets || slide.puntos) && (
                  <ul className="mt-1 text-sm text-gray-600">
                    {(slide.bullets || slide.puntos || []).map((b, j) => (
                      <li key={j}>• {b}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!voiceover && !contenido.puntos_clave?.length && !contenido.slides?.length && (
        <pre className="p-4 bg-gray-50 rounded-lg text-sm overflow-auto">
          {JSON.stringify(contenido, null, 2)}
        </pre>
      )}
    </div>
  );
}

// Panel de contenido (lado derecho del video split) generado desde el guión.
// Brandeado por empresa. Para v1: título + bullets (puntos_clave o títulos de slides).
function buildAvatarPanelHtml(guion: Guion, titulo: string, brand: Brand = DEFAULT_BRAND): string {
  const c = guion.contenido;
  let bullets: string[] = [];
  if (Array.isArray(c.puntos_clave) && c.puntos_clave.length) {
    bullets = c.puntos_clave as string[];
  } else if (Array.isArray(c.slides) && c.slides.length) {
    bullets = (c.slides as Array<{ titulo?: string }>).map((s) => s.titulo || "").filter(Boolean);
  }
  bullets = bullets.slice(0, 5);
  const esc = (s: string) => String(s).replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const items = bullets.map((b) => `<li>${esc(b)}</li>`).join("");
  const fuente = safeFont(brand.fuenteTitulos, "Montserrat");
  const fam = encodeURIComponent(fuente).replace(/%20/g, "+");
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><style>
    @import url('https://fonts.googleapis.com/css2?family=${fam}:wght@700;800&display=swap');
    *{margin:0;box-sizing:border-box}
    :root{--brand-primary:${brand.colorPrimario};--brand-secondary:${brand.colorSecundario}}
    body{width:1248px;height:1080px;background:linear-gradient(135deg,#1a1a2e 0%,#16213e 55%,#0f3460 100%);
      font-family:'${fuente}','Segoe UI',sans-serif;color:#fff;display:flex;flex-direction:column;justify-content:center;padding:90px 80px}
    .bar{width:90px;height:8px;background:var(--brand-primary);border-radius:4px;margin-bottom:34px}
    h1{font-size:62px;line-height:1.1;font-weight:800;margin-bottom:40px}
    ul{list-style:none;padding:0}
    li{font-size:36px;line-height:1.5;margin:18px 0;padding-left:46px;position:relative}
    li::before{content:'';position:absolute;left:0;top:14px;width:22px;height:22px;border-radius:50%;
      background:var(--brand-secondary);box-shadow:0 0 0 6px color-mix(in srgb, var(--brand-secondary) 18%, transparent)}
    .logo{position:absolute;bottom:60px;font-size:24px;font-weight:700;color:rgba(255,255,255,0.6)}
  </style></head><body>
    <div class="bar"></div>
    <h1>${esc(titulo)}</h1>
    ${items ? `<ul>${items}</ul>` : ""}
    <div class="logo">${esc(brand.nombre)}</div>
  </body></html>`;
}

// Deck de slides (N secciones 1920x1080 apiladas) para el video. Brandeado por empresa.
// Cada <section class="slide"> es una slide; el agent-service las recorta y arma el video.
function buildDeckHtml(guion: Guion, titulo: string, brand: Brand = DEFAULT_BRAND): string {
  const c = guion.contenido;
  const esc = (s: string) => String(s).replace(/</g, "&lt;").replace(/>/g, "&gt;");
  type S = { titulo?: string; bullets?: string[]; puntos?: string[] };
  let slides: S[] = Array.isArray(c.slides) && c.slides.length ? (c.slides as S[]) : [];
  if (!slides.length) {
    // Fallback: una sola slide con los puntos clave / título.
    slides = [{ titulo, bullets: (Array.isArray(c.puntos_clave) ? c.puntos_clave as string[] : []) }];
  }
  const sections = slides.map((s, i) => {
    const bullets = (s.bullets || s.puntos || []).slice(0, 6);
    const items = bullets.map((b) => `<li>${esc(b)}</li>`).join("");
    return `<section class="slide">
      <div class="bar"></div>
      <h1>${esc(s.titulo || titulo)}</h1>
      ${items ? `<ul>${items}</ul>` : ""}
      <div class="num">${i + 1} / ${slides.length}</div>
      <div class="logo">${esc(brand.nombre)}</div>
    </section>`;
  }).join("");
  const fuente = safeFont(brand.fuenteTitulos, "Montserrat");
  const fam = encodeURIComponent(fuente).replace(/%20/g, "+");
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><style>
    @import url('https://fonts.googleapis.com/css2?family=${fam}:wght@700;800&display=swap');
    *{margin:0;box-sizing:border-box}
    :root{--brand-primary:${brand.colorPrimario};--brand-secondary:${brand.colorSecundario}}
    body{width:1920px;font-family:'${fuente}','Segoe UI',sans-serif}
    .slide{width:1920px;height:1080px;position:relative;color:#fff;padding:110px 130px;
      display:flex;flex-direction:column;justify-content:center;
      background:linear-gradient(135deg,#1a1a2e 0%,#16213e 55%,#0f3460 100%)}
    .bar{width:110px;height:9px;background:var(--brand-primary);border-radius:5px;margin-bottom:40px}
    h1{font-size:84px;line-height:1.08;font-weight:800;margin-bottom:54px;max-width:1500px}
    ul{list-style:none;padding:0}
    li{font-size:44px;line-height:1.5;margin:22px 0;padding-left:58px;position:relative;max-width:1550px}
    li::before{content:'';position:absolute;left:0;top:18px;width:26px;height:26px;border-radius:50%;background:var(--brand-secondary);box-shadow:0 0 0 7px color-mix(in srgb, var(--brand-secondary) 18%, transparent)}
    .num{position:absolute;top:70px;right:130px;font-size:28px;font-weight:700;color:rgba(255,255,255,0.4)}
    .logo{position:absolute;bottom:70px;right:130px;font-size:30px;font-weight:700;color:rgba(255,255,255,0.55)}
  </style></head><body>${sections}</body></html>`;
}

// Adjuntar imágenes para el agente (se suben al workspace; el agente las usa/ve).
function ImageAttach({ images, setImages }: {
  images: AgentImage[];
  setImages: (fn: (prev: AgentImage[]) => AgentImage[]) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files).slice(0, 6)) {
      if (!f.type.startsWith("image/") || f.size > 6 * 1024 * 1024) continue;
      const dataUrl = await new Promise<string>((res) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.readAsDataURL(f);
      });
      setImages((prev) => (prev.length >= 6 ? prev : [...prev, { name: f.name, dataUrl }]));
    }
    if (ref.current) ref.current.value = "";
  };
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
        title="Adjuntar imágenes (logo, fotos…)"
      >
        📎 Imagen
      </button>
      <input ref={ref} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
      <div className="flex flex-wrap gap-1.5">
        {images.map((img, i) => (
          <div key={i} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.dataUrl} alt={img.name} className="h-9 w-9 rounded border object-cover" />
            <button
              type="button"
              onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
              className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-gray-800 text-[10px] text-white"
              title="Quitar"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Editor IA del panel del video split (Claude Agent SDK). Edita el HTML del slide
// del lado derecho; al terminar devuelve el HTML por onHtmlChange.
function PanelEditor({ sessionKey, seedHtml, onHtmlChange, avatarUrl, contentW = 1248, contentH = 1080 }: {
  sessionKey: string;
  seedHtml: string;
  onHtmlChange: (html: string) => void;
  avatarUrl?: string;
  contentW?: number;
  contentH?: number;
}) {
  const { getJob, start, getDraft, setDraft } = useAgentJobs();
  const job = getJob(sessionKey);
  const instruction = getDraft(sessionKey);
  const running = job?.running ?? false;
  const events = job?.events ?? [];
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [previewKey, setPreviewKey] = useState(0);
  // Si ya hay un job para este recurso (corriendo o terminado), mostrar el workspace
  // en vivo (sobrevive cambiar de pestaña/recurso).
  const [hasEdited, setHasEdited] = useState(() => Boolean(job));
  const [images, setImages] = useState<AgentImage[]>([]);
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
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [events.length]);

  const previewSrc = useWsPreviewSrc(sessionKey, previewKey);

  // Layout del preview: split (avatar + panel) o deck/slide full (scrolleable).
  const DISP_H = 351;
  const contentBoxW = avatarUrl ? 406 : 560;          // ancho de display del contenido
  const contentScale = contentBoxW / contentW;        // escala visual
  const isDeck = contentH > 1080;                     // varias slides apiladas
  const oneSlideH = Math.round(1080 * contentScale);  // alto de UNA slide escalada

  return (
    <div className="rounded-lg border bg-white">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className="text-sm font-semibold text-gray-700">🎨 Editar {avatarUrl ? "panel" : "slide"} con IA</span>
        <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700">Claude Agent SDK</span>
        <span className="ml-auto text-xs text-gray-400">{job?.status ?? "listo"}</span>
      </div>
      {/* Preview en vivo: split (avatar + panel) o deck de slides (scrolleable) */}
      <div className="flex flex-col items-center gap-1 bg-gray-200 p-3">
        <div className="flex bg-black shadow overflow-hidden" style={{ width: (avatarUrl ? 218 : 0) + contentBoxW, height: avatarUrl ? DISP_H : oneSlideH }}>
          {avatarUrl && (
            <video src={avatarUrl} muted loop playsInline autoPlay className="object-cover" style={{ width: 218, height: DISP_H }} />
          )}
          {/* Caja scrolleable: el div interno tiene el tamaño ESCALADO (clave para que el scroll del deck funcione) */}
          <div style={{ width: contentBoxW, height: avatarUrl ? DISP_H : oneSlideH, overflowY: isDeck ? "auto" : "hidden", overflowX: "hidden" }}>
            <div style={{ width: contentBoxW, height: Math.round(contentH * contentScale) }}>
              <iframe
                key={`${hasEdited}-${previewKey}`}
                {...(hasEdited ? { src: previewSrc } : { srcDoc: seedHtml })}
                style={{ width: contentW, height: contentH, border: 0, transform: `scale(${contentScale})`, transformOrigin: "top left" }}
                title="panel"
                scrolling="no"
              />
            </div>
          </div>
        </div>
        <span className="text-[10px] text-gray-400">
          {avatarUrl ? "Vista previa del split (avatar + panel)" : isDeck ? "Vista previa del deck · scrolleá para ver las slides" : "Vista previa del slide"} · así quedará el video
        </span>
      </div>
      <div className="space-y-2 p-3">
        <textarea
          value={instruction}
          onChange={(e) => setDraft(sessionKey, e.target.value)}
          placeholder="Ej: Poné un fondo más claro, el título en el color de acento de la marca, agregá un ícono por bullet y más aire entre líneas."
          className="h-20 w-full resize-y rounded-lg border border-gray-300 p-2.5 text-sm focus:border-red-500 focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-2">
          <select value={model} onChange={(e) => setModel(e.target.value)} className="rounded-lg border border-gray-300 p-1.5 text-xs">
            {AGENT_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <ImageAttach images={images} setImages={setImages} />
          <Button
            size="sm"
            className="ml-auto"
            disabled={running || !instruction.trim()}
            onClick={() => { start(sessionKey, { instruction, model, seedHtml, images }); setImages(() => []); }}
          >
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

// Generation panel - step by step generation
function GenerationPanel({ item, guion, gen, mallaId, generating, onGenerateAudio, onGenerateVideo }: {
  item: MallaItem;
  guion: Guion;
  gen?: ResourceGeneration;
  mallaId: string;
  generating: boolean;
  onGenerateAudio: () => void;
  onGenerateVideo: () => void;
}) {
  const { company } = useCompany();
  const isVideoAvatar = item.tipo_recurso === "Video avatar";
  const voiceover = guion.contenido.voiceover || guion.contenido.texto;

  const [composing, setComposing] = useState(false);
  const [composedUrl, setComposedUrl] = useState<string | null>(null);
  const [composeError, setComposeError] = useState<string | null>(null);
  // HTML del slide/panel. Editable con el agente; persistido. Avatar → panel 1248x1080;
  // Video (slides) → slide full-screen 1920x1080.
  const slideCount = Array.isArray(guion.contenido.slides)
    ? Math.max(1, (guion.contenido.slides as unknown[]).length)
    : 1;
  const [panelHtml, setPanelHtml] = useState<string>(
    () => (guion.contenido.panel_html as string) ||
      (isVideoAvatar ? buildAvatarPanelHtml(guion, item.recurso, company) : buildDeckHtml(guion, item.recurso, company))
  );

  const handleCompose = async () => {
    setComposing(true);
    setComposeError(null);
    try {
      let url: string;
      if (isVideoAvatar) {
        if (!gen?.videoUrl) throw new Error("Falta el avatar (generá el video primero)");
        ({ url } = await composeSplitVideo(gen.videoUrl, panelHtml, `${item.id}_split`));
      } else {
        if (!gen?.audioUrl) throw new Error("Falta el audio (generalo primero)");
        ({ url } = await composeSlidesVideo(gen.audioUrl, panelHtml, `${item.id}_slides`, slideCount));
      }
      setComposedUrl(`${url}?t=${Date.now()}`);
      // Persistir el video compuesto (URL de Storage) para preview/SCORM y que sobreviva al recargar.
      if (mallaId && url.startsWith("http")) {
        void guardarGuion(mallaId, item.id, { composed_url: url }).catch(() => {});
      }
    } catch (e) {
      setComposeError(e instanceof Error ? e.message : "Error al componer el video");
    } finally {
      setComposing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Step 1: Audio */}
      <div className="p-4 border rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${
              gen?.audioStatus === "completed" ? "bg-green-500" : "bg-gray-400"
            }`}>
              {gen?.audioStatus === "completed" ? "✓" : "1"}
            </div>
            <div>
              <h4 className="font-medium">Generar Audio</h4>
              <p className="text-sm text-gray-500">ElevenLabs - Voz Valeria</p>
            </div>
          </div>
          <StatusBadge status={gen?.audioStatus} />
        </div>

        {gen?.audioStatus === "completed" && gen.audioUrl ? (
          <div className="space-y-2">
            <audio controls className="w-full">
              <source src={gen.audioUrl} type="audio/mpeg" />
            </audio>
            <Button variant="outline" size="sm" onClick={() => window.open(gen.audioUrl, '_blank')}>
              Abrir en nueva pestaña
            </Button>
          </div>
        ) : gen?.audioStatus === "processing" || gen?.audioStatus === "pending" ? (
          <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg text-blue-700">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            Generando audio con ElevenLabs...
          </div>
        ) : (
          <Button onClick={onGenerateAudio} disabled={generating || !voiceover} className="w-full">
            {generating ? (
              <span className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Iniciando...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                Generar Audio
              </span>
            )}
          </Button>
        )}
      </div>

      {/* Step 2: Video (HeyGen for avatar, slides composition for Video) */}
      {isVideoAvatar && (
        <div className={`p-4 border rounded-lg ${!gen?.audioUrl ? "opacity-50" : ""}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${
                gen?.videoStatus === "completed" ? "bg-green-500" : "bg-gray-400"
              }`}>
                {gen?.videoStatus === "completed" ? "✓" : "2"}
              </div>
              <div>
                <h4 className="font-medium">Generar Video con Avatar</h4>
                <p className="text-sm text-gray-500">HeyGen - Avatar Hada LivelyGestures</p>
              </div>
            </div>
            <StatusBadge status={gen?.videoStatus} />
          </div>

          {gen?.videoStatus === "completed" && gen.videoUrl ? (
            <div className="space-y-2">
              <video controls className="w-full rounded-lg">
                <source src={gen.videoUrl} type="video/mp4" />
              </video>
              <Button variant="outline" size="sm" onClick={() => window.open(gen.videoUrl, '_blank')}>
                Abrir en nueva pestaña
              </Button>
            </div>
          ) : gen?.videoStatus === "processing" || gen?.videoStatus === "pending" ? (
            <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg text-blue-700">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              Generando video con HeyGen... (puede tomar 1-2 minutos)
            </div>
          ) : (
            <Button
              onClick={onGenerateVideo}
              disabled={generating || !gen?.audioUrl}
              className="w-full"
            >
              {generating ? (
                <span className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Iniciando...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Generar Video con Avatar
                </span>
              )}
            </Button>
          )}
        </div>
      )}

      {/* Step 3: Componer video split (avatar + slide branded) */}
      {isVideoAvatar && gen?.videoStatus === "completed" && gen.videoUrl && (
        <div className="p-4 border rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${composedUrl ? "bg-green-500" : "bg-gray-400"}`}>
                {composedUrl ? "✓" : "3"}
              </div>
              <div>
                <h4 className="font-medium">Componer video split</h4>
                <p className="text-sm text-gray-500">Avatar (35%) + contenido branded (65%) · FFmpeg</p>
              </div>
            </div>
          </div>

          {/* Editor IA del panel (lado derecho del split) */}
          <div className="mb-3">
            <PanelEditor
              sessionKey={`${mallaId || "m"}_${item.id}_panel`}
              seedHtml={panelHtml}
              avatarUrl={gen?.videoUrl}
              onHtmlChange={(html) => {
                setPanelHtml(html);
                if (mallaId) void guardarGuion(mallaId, item.id, { panel_html: html }).catch(() => {});
              }}
            />
          </div>

          {composedUrl ? (
            <div className="space-y-2">
              <video controls className="w-full rounded-lg">
                <source src={composedUrl} type="video/mp4" />
              </video>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => window.open(composedUrl, "_blank")}>
                  Abrir en nueva pestaña
                </Button>
                <Button variant="ghost" size="sm" onClick={handleCompose} disabled={composing}>
                  Recomponer
                </Button>
              </div>
            </div>
          ) : composing ? (
            <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg text-blue-700">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              Componiendo con FFmpeg… (puede tomar ~1 min según el largo)
            </div>
          ) : (
            <div className="space-y-2">
              <Button onClick={handleCompose} className="w-full bg-red-600 hover:bg-red-700">
                🎬 Componer video split
              </Button>
              <p className="text-xs text-gray-500">
                Combina el avatar con un slide branded generado del guión. El look lo controla el HTML
                (lo podés ajustar con el Editor IA).
              </p>
              {composeError && <p className="text-sm text-red-600">{composeError}</p>}
            </div>
          )}
        </div>
      )}

      {/* Step 2 for Video (slides): Auto-composition in SCORM */}
      {item.tipo_recurso === "Video" && (
        <div className={`p-4 border rounded-lg ${!gen?.audioUrl ? "opacity-50" : ""}`}>
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${
              gen?.audioStatus === "completed" ? "bg-green-500" : "bg-gray-400"
            }`}>
              {gen?.audioStatus === "completed" ? "✓" : "2"}
            </div>
            <div>
              <h4 className="font-medium">Composición de Video</h4>
              <p className="text-sm text-gray-500">Slides + Audio → Video MP4</p>
            </div>
          </div>

          {gen?.audioStatus === "completed" ? (
            <div className="space-y-3">
              <div className="mb-1">
                <PanelEditor
                  sessionKey={`${mallaId || "m"}_${item.id}_slide`}
                  seedHtml={panelHtml}
                  contentW={1920}
                  contentH={slideCount * 1080}
                  onHtmlChange={(html) => {
                    setPanelHtml(html);
                    if (mallaId) void guardarGuion(mallaId, item.id, { panel_html: html }).catch(() => {});
                  }}
                />
              </div>
              {composedUrl ? (
                <div className="space-y-2">
                  <video controls className="w-full rounded-lg">
                    <source src={composedUrl} type="video/mp4" />
                  </video>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => window.open(composedUrl, "_blank")}>Abrir en nueva pestaña</Button>
                    <Button variant="ghost" size="sm" onClick={handleCompose} disabled={composing}>Recomponer</Button>
                  </div>
                </div>
              ) : composing ? (
                <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg text-blue-700">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                  Componiendo con FFmpeg… (puede tomar ~1 min)
                </div>
              ) : (
                <div className="space-y-2">
                  <Button onClick={handleCompose} className="w-full bg-red-600 hover:bg-red-700">🎬 Componer video (slides + voz)</Button>
                  {composeError && <p className="text-sm text-red-600">{composeError}</p>}
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 bg-gray-50 rounded-lg text-gray-500 text-sm">
              Primero generá el audio. Después podés editar el slide con IA y componer el video.
            </div>
          )}
        </div>
      )}

      {/* Info about costs */}
      <div className="p-3 bg-yellow-50 rounded-lg text-sm text-yellow-800">
        💰 <strong>Costos estimados:</strong> Audio ~$0.02
        {isVideoAvatar && " | Video HeyGen ~$0.50"}
        {item.tipo_recurso === "Video" && " | Composición slides: gratis"}
      </div>
    </div>
  );
}

// Result panel - shows generated content
function ResultPanel({ gen, tipo }: { gen: ResourceGeneration; tipo: string }) {
  const isVideoAvatar = tipo === "Video avatar";

  return (
    <div className="space-y-4">
      <h3 className="font-medium text-gray-900">Contenido Generado</h3>

      {/* Audio result */}
      {gen.audioUrl && (
        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">🎤 Audio</span>
            <Button variant="ghost" size="sm" onClick={() => window.open(gen.audioUrl, '_blank')}>
              Abrir ↗
            </Button>
          </div>
          <audio controls className="w-full">
            <source src={gen.audioUrl} type="audio/mpeg" />
          </audio>
        </div>
      )}

      {/* Video result */}
      {isVideoAvatar && gen.videoUrl && (
        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">🎬 Video con Avatar</span>
            <Button variant="ghost" size="sm" onClick={() => window.open(gen.videoUrl, '_blank')}>
              Abrir ↗
            </Button>
          </div>
          <video controls className="w-full rounded-lg">
            <source src={gen.videoUrl} type="video/mp4" />
          </video>
        </div>
      )}

      {isVideoAvatar && !gen.videoUrl && gen.audioUrl && (
        <div className="p-4 border-2 border-dashed rounded-lg text-center text-gray-500">
          <p>Video pendiente de generar</p>
          <p className="text-sm mt-1">Ve a la pestaña Generar para crear el video con avatar</p>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return null;

  const config: Record<string, { label: string; cls: string }> = {
    pending: { label: "En cola", cls: "bg-yellow-100 text-yellow-700" },
    processing: { label: "Procesando", cls: "bg-blue-100 text-blue-700" },
    completed: { label: "Completado", cls: "bg-green-100 text-green-700" },
    failed: { label: "Error", cls: "bg-red-100 text-red-700" },
  };
  const { label, cls } = config[status] || config.pending;
  return <Badge className={cls}>{label}</Badge>;
}

function ResourcePreview({ item, guion }: { item: MallaItem; guion: Guion }) {
  const { company } = useCompany();
  const { contenido } = guion;
  const tipo = item.tipo_recurso;
  const [interactiveTabIndex, setInteractiveTabIndex] = useState(0);

  // MODO COMPONENTES - Si tiene array de componentes
  if (isComponentContent(contenido)) {
    const config = contenido.config;
    const bgStyle = config?.fondo_imagen
      ? {
          backgroundImage: `linear-gradient(${config.fondo_overlay || 'rgba(0,0,0,0.75)'}, ${config.fondo_overlay || 'rgba(0,0,0,0.75)'}), url('${config.fondo_imagen}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }
      : { background: 'linear-gradient(135deg, #1a1a2e, #16213e, #0f3460)' };

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-green-600">
            <span>🧩</span>
            <span className="font-medium">Modo componentes</span>
            {config?.fondo_imagen && <span className="text-xs text-blue-500">+ fondo</span>}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openComponentsInNewTab(contenido, item.recurso, company)}
          >
            Ver SCORM final ↗
          </Button>
        </div>
        <div className="border rounded-lg p-6 text-white" style={bgStyle}>
          <RenderComponents componentes={contenido.componentes} />
        </div>
        <details className="mt-2">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Ver JSON</summary>
          <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-48">
            {JSON.stringify(contenido, null, 2)}
          </pre>
        </details>
      </div>
    );
  }

  // Video avatar preview
  if (tipo === "Video avatar") {
    return (
      <div className="space-y-4">
        <div className="flex gap-4 p-4 bg-gradient-to-r from-red-50 to-orange-50 rounded-lg border border-red-100">
          <div className="w-24 h-24 bg-gradient-to-br from-red-500 to-red-700 rounded-full flex items-center justify-center text-4xl shadow-lg">
            👩‍💼
          </div>
          <div className="flex-1">
            <h4 className="font-bold text-gray-900">Hada LivelyGestures</h4>
            <p className="text-sm text-gray-500">Avatar con gestos animados naturales</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="px-2 py-1 bg-white rounded text-xs">🎤 Voz: Valeria</span>
              <span className="px-2 py-1 bg-white rounded text-xs">📐 720x1280</span>
            </div>
          </div>
        </div>
        <p className="text-sm text-gray-500 italic">
          El video se genera en la pestaña Generar con costos de HeyGen (~$0.50/min)
        </p>
      </div>
    );
  }

  // Video slides preview
  if (tipo === "Video") {
    const slides = contenido.slides || [];
    return (
      <div className="space-y-4">
        {slides.length > 0 ? (
          <div className="grid gap-3">
            {slides.map((slide, i) => (
              <div key={i} className="p-4 bg-gradient-to-r from-gray-900 to-gray-800 rounded-lg text-white">
                <h4 className="font-bold mb-2">{slide.titulo}</h4>
                <ul className="space-y-1 text-sm text-gray-300">
                  {(slide.bullets || slide.puntos || []).map((b: string, j: number) => (
                    <li key={j} className="flex items-start gap-2">
                      <span className="text-red-400">•</span> {b}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <div className="aspect-video bg-gradient-to-br from-gray-900 to-gray-800 rounded-lg p-8 text-white flex items-center justify-center">
            <div className="text-center">
              <span className="text-4xl mb-4 block">📹</span>
              <p className="text-lg font-medium">{item.recurso}</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Quiz preview
  if (tipo === "Quiz") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = contenido as any;
    const preguntas = c.preguntas || [];
    return (
      <div className="space-y-4">
        {(c.titulo || c.titulo_principal) && <h3 className="text-xl font-bold text-gray-900 border-b pb-2">{c.titulo || c.titulo_principal}</h3>}
        {preguntas.map((q: { pregunta: string; opciones: string[]; correcta: number }, i: number) => (
          <div key={i} className="p-4 bg-gray-50 rounded-lg">
            <p className="font-medium mb-3">{i + 1}. {q.pregunta}</p>
            <div className="grid gap-2">
              {q.opciones.map((opt: string, j: number) => (
                <div
                  key={j}
                  className={`p-3 rounded-lg border ${j === q.correcta ? "border-green-500 bg-green-50" : "border-gray-200"}`}
                >
                  {opt}
                  {j === q.correcta && <span className="ml-2 text-green-600">✓</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
        {preguntas.length === 0 && <p className="text-gray-500 italic">Sin preguntas definidas</p>}
        <details className="mt-4">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Ver JSON completo</summary>
          <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-48">
            {JSON.stringify(contenido, null, 2)}
          </pre>
        </details>
      </div>
    );
  }

  // Flashcards preview
  if (tipo === "Flashcards") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = contenido as any;
    const items = c.items || c.tarjetas || c.flashcards || [];
    return (
      <div className="space-y-4">
        {(c.titulo || c.titulo_principal) && <h3 className="text-xl font-bold text-gray-900 border-b pb-2">{c.titulo || c.titulo_principal}</h3>}
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((card: { frente?: string; pregunta?: string; reverso?: string; respuesta?: string }, i: number) => (
            <div key={i} className="group cursor-pointer" style={{ perspective: "1000px" }}>
              <div className="relative h-40 transition-transform duration-500" style={{ transformStyle: "preserve-3d" }}>
                <div className="absolute inset-0 p-4 bg-red-600 text-white rounded-lg flex items-center justify-center text-center" style={{ backfaceVisibility: "hidden" }}>
                  <p className="font-medium">{card.frente || card.pregunta}</p>
                </div>
              </div>
              <p className="text-xs text-center text-gray-400 mt-1">Reverso: {card.reverso || card.respuesta}</p>
            </div>
          ))}
        </div>
        {items.length === 0 && <p className="text-gray-500 italic">Sin tarjetas definidas</p>}
        <details className="mt-4">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Ver JSON completo</summary>
          <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-48">
            {JSON.stringify(contenido, null, 2)}
          </pre>
        </details>
      </div>
    );
  }

  // Caso práctico preview
  if (tipo === "Caso práctico") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = contenido as any;
    const preguntas = c.preguntas || [];
    return (
      <div className="space-y-4">
        {(c.titulo || c.titulo_principal) && <h3 className="text-xl font-bold text-gray-900 border-b pb-2">{c.titulo || c.titulo_principal}</h3>}
        {c.escenario && (
          <div className="p-4 bg-blue-50 border-l-4 border-blue-500 rounded-r-lg">
            <p className="font-medium text-blue-900 mb-1">📋 Escenario</p>
            <p className="text-blue-800">{c.escenario}</p>
          </div>
        )}
        {preguntas.map((q: { pregunta: string; opciones: string[]; correcta: number; feedback?: string }, i: number) => (
          <div key={i} className="p-4 bg-gray-50 rounded-lg">
            <p className="font-medium mb-3">{i + 1}. {q.pregunta}</p>
            <div className="space-y-2">
              {q.opciones.map((opt: string, j: number) => (
                <div
                  key={j}
                  className={`p-3 rounded-lg ${j === q.correcta ? "bg-green-100 border border-green-400" : "bg-white border border-gray-200"}`}
                >
                  {opt}
                </div>
              ))}
            </div>
            {q.feedback && <p className="mt-3 text-sm text-gray-600 italic">💡 {q.feedback}</p>}
          </div>
        ))}
        <details className="mt-4">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Ver JSON completo</summary>
          <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-48">
            {JSON.stringify(contenido, null, 2)}
          </pre>
        </details>
      </div>
    );
  }

  // Infografía preview
  if (tipo === "Infografía") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = contenido as any;
    return (
      <div className="space-y-4">
        {/* Render titulo from multiple possible field names */}
        {(c.titulo || c.titulo_principal) && (
          <h3 className="text-xl font-bold text-gray-900 border-b pb-2">{c.titulo || c.titulo_principal}</h3>
        )}
        {c.subtitulo && <p className="text-gray-600 italic">{c.subtitulo}</p>}
        {c.dato_destacado && (
          <div className="p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded-r-lg">
            <p className="text-yellow-800">💡 {c.dato_destacado}</p>
          </div>
        )}
        {/* Render secciones as cards */}
        {c.secciones && c.secciones.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {c.secciones.map((sec: { icono?: string; titulo?: string; descripcion?: string }, i: number) => (
              <div key={i} className="p-4 bg-gradient-to-br from-red-50 to-orange-50 rounded-lg border border-red-100">
                <div className="flex items-center gap-2 mb-2">
                  {sec.icono && <span className="text-2xl">{sec.icono}</span>}
                  {sec.titulo && <h4 className="font-bold text-gray-900">{sec.titulo}</h4>}
                </div>
                {sec.descripcion && <p className="text-sm text-gray-600">{sec.descripcion}</p>}
              </div>
            ))}
          </div>
        )}
        {/* Render cajitas/boxes/items if present */}
        {(c.cajitas || c.boxes || c.items || c.elementos) && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(c.cajitas || c.boxes || c.items || c.elementos || []).map((item: { titulo?: string; nombre?: string; icono?: string; descripcion?: string; contenido?: string }, i: number) => (
              <div key={i} className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-100">
                <div className="flex items-center gap-2 mb-2">
                  {item.icono && <span className="text-2xl">{item.icono}</span>}
                  <h4 className="font-bold text-gray-900">{item.titulo || item.nombre || `Item ${i + 1}`}</h4>
                </div>
                <p className="text-sm text-gray-600">{item.descripcion || item.contenido}</p>
              </div>
            ))}
          </div>
        )}
        {/* Render cierre/frase_final/pie at the bottom */}
        {(c.cierre || c.frase_final || c.pie || c.mensaje_final || c.nota_final) && (
          <div className="mt-6 p-4 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg text-center">
            <p className="text-lg font-bold">{c.cierre || c.frase_final || c.pie || c.mensaje_final || c.nota_final}</p>
          </div>
        )}
        {/* Show raw JSON for debugging/visibility */}
        <details className="mt-4">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Ver JSON completo</summary>
          <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-48">
            {JSON.stringify(contenido, null, 2)}
          </pre>
        </details>
      </div>
    );
  }

  // Comparador preview
  if (tipo === "Comparador") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = contenido as any;
    const columnas = c.columnas || [];
    const filas = c.filas || [];
    return (
      <div className="space-y-4">
        {(c.titulo || c.titulo_principal) && <h3 className="text-xl font-bold text-gray-900 border-b pb-2">{c.titulo || c.titulo_principal}</h3>}
        {c.descripcion && <p className="text-gray-600">{c.descripcion}</p>}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-red-600 text-white">
                <th className="p-3 text-left border border-red-700">Aspecto</th>
                {columnas.map((col: string, i: number) => (
                  <th key={i} className="p-3 text-left border border-red-700">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((fila: { aspecto?: string; nombre?: string; valores?: string[] }, i: number) => (
                <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="p-3 border font-medium text-gray-900">{fila.aspecto || fila.nombre}</td>
                  {(fila.valores || []).map((val: string, j: number) => (
                    <td key={j} className="p-3 border text-gray-600">{val}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details className="mt-4">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Ver JSON completo</summary>
          <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-48">
            {JSON.stringify(contenido, null, 2)}
          </pre>
        </details>
      </div>
    );
  }

  // Interactivo preview
  if (tipo === "Interactivo") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = contenido as any;
    const visualBg = String(c.fondo_color || c.background_color || c.config_visual?.fondo_color || "").trim();
    const visualBorder = String(c.borde_color || c.config_visual?.borde_color || "").trim();
    const panelClass = visualBg
      ? "rounded-xl border p-4"
      : "rounded-xl border border-red-100 bg-gradient-to-b from-red-50 to-white p-4";
    const panelStyle = visualBg
      ? { background: visualBg, borderColor: visualBorder || "#fca5a5" }
      : undefined;

    const elementos = c.elementos || c.items || c.secciones || [];
    const titulo = c.titulo || c.titulo_principal || "";
    const instruccion = c.instruccion || "";
    const tituloLower = String(titulo).toLowerCase();
    const instruccionLower = String(instruccion).toLowerCase();
    const isRoadmapByTitle = /(roadmap|línea de tiempo|linea de tiempo|timeline|paso a paso)/.test(tituloLower);
    const isTabsByTitle = /(tabs|pestañas|pestanas|horizontal)/.test(tituloLower);
    const isTabsByInstruction = /(horizontal|en fila|lado a lado|tabs|pestañas|pestanas)/.test(instruccionLower);
    const isCardsByTitle = /(cards|tarjetas|mosaico|grid|grilla|paneles)/.test(tituloLower);
    const isCardsByInstruction = /(cards|tarjetas|mosaico|grid|grilla|paneles)/.test(instruccionLower);
    const isChecklistByTitle = /(checklist|check list|lista de chequeo|lista de verificación|lista de verificacion)/.test(tituloLower);
    const isChecklistByInstruction = /(checklist|check list|lista de chequeo|lista de verificación|lista de verificacion)/.test(instruccionLower);
    const isMatrixByTitle = /(matriz|2x2|cuadrantes)/.test(tituloLower);
    const isMatrixByInstruction = /(matriz|2x2|cuadrantes)/.test(instruccionLower);
    const isRoadmapBySteps = elementos.length > 2 && elementos.every((elem: { etiqueta?: string; titulo?: string; nombre?: string }, i: number) => {
      const label = String(elem.etiqueta || elem.titulo || elem.nombre || "");
      const startsWithNumber = new RegExp(`^${i + 1}[\\.)\\s\\-:]`).test(label.trim());
      return startsWithNumber;
    });
    const isTabsLayout = !isRoadmapByTitle && (isTabsByTitle || isTabsByInstruction);
    const isCardsLayout = !isRoadmapByTitle && !isTabsLayout && (isCardsByTitle || isCardsByInstruction);
    const isChecklistLayout = !isRoadmapByTitle && !isTabsLayout && !isCardsLayout && (isChecklistByTitle || isChecklistByInstruction);
    const isMatrixLayout = !isRoadmapByTitle && !isTabsLayout && !isCardsLayout && !isChecklistLayout && (isMatrixByTitle || isMatrixByInstruction);
    const isRoadmap = isRoadmapByTitle || isRoadmapBySteps;

    if (isMatrixLayout) {
      const rows = elementos.slice(0, 4);
      const extraRows = elementos.slice(4);
      const padded = [...rows];
      while (padded.length < 4) {
        padded.push({ etiqueta: `Cuadrante ${padded.length + 1}`, contenido_oculto: "Completa este cuadrante con criterio clave." });
      }

      return (
        <div className="space-y-4">
          {titulo && <h3 className="text-xl font-bold text-gray-900 border-b pb-2">{titulo}</h3>}
          {instruccion && <p className="text-sm text-gray-600 italic">{instruccion}</p>}
          <div className={panelClass} style={panelStyle}>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-red-700 shadow-sm">
              <span>🧭</span>
              Vista Matriz 2x2
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {padded.map((elem, i) => (
                <div key={i} className="rounded-lg border border-red-100 bg-white p-4 shadow-sm">
                  <p className="font-semibold text-gray-900">{elem.etiqueta || elem.titulo || elem.nombre || `Cuadrante ${i + 1}`}</p>
                  <p className="mt-2 text-sm text-gray-700">{elem.contenido_oculto || elem.descripcion || elem.contenido || ""}</p>
                </div>
              ))}
            </div>
            {extraRows.length > 0 && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                  Extensiones / Conclusión ({extraRows.length})
                </p>
                <div className="mt-3 grid gap-3">
                  {extraRows.map((elem: { etiqueta?: string; titulo?: string; nombre?: string; contenido_oculto?: string; descripcion?: string; contenido?: string }, i: number) => (
                    <div key={i} className="rounded-md border border-amber-200 bg-white p-3">
                      <p className="font-semibold text-gray-900">{elem.etiqueta || elem.titulo || elem.nombre || `Extensión ${i + 1}`}</p>
                      <p className="mt-1 text-sm text-gray-700">{elem.contenido_oculto || elem.descripcion || elem.contenido || ""}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <details className="mt-4">
            <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Ver JSON completo</summary>
            <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-48">
              {JSON.stringify(contenido, null, 2)}
            </pre>
          </details>
        </div>
      );
    }

    if (isCardsLayout) {
      return (
        <div className="space-y-4">
          {titulo && <h3 className="text-xl font-bold text-gray-900 border-b pb-2">{titulo}</h3>}
          {instruccion && <p className="text-sm text-gray-600 italic">{instruccion}</p>}
          <div className={panelClass} style={panelStyle}>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-red-700 shadow-sm">
              <span>🧩</span>
              Vista Cards
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {elementos.map((elem: { etiqueta?: string; titulo?: string; nombre?: string; contenido_oculto?: string; descripcion?: string; contenido?: string }, i: number) => (
                <div key={i} className="rounded-lg border border-red-100 bg-white p-4 shadow-sm">
                  <p className="font-semibold text-gray-900">{elem.etiqueta || elem.titulo || elem.nombre || `Card ${i + 1}`}</p>
                  <p className="mt-2 text-sm text-gray-700">{elem.contenido_oculto || elem.descripcion || elem.contenido || ""}</p>
                </div>
              ))}
            </div>
          </div>
          <details className="mt-4">
            <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Ver JSON completo</summary>
            <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-48">
              {JSON.stringify(contenido, null, 2)}
            </pre>
          </details>
        </div>
      );
    }

    if (isChecklistLayout) {
      return (
        <div className="space-y-4">
          {titulo && <h3 className="text-xl font-bold text-gray-900 border-b pb-2">{titulo}</h3>}
          {instruccion && <p className="text-sm text-gray-600 italic">{instruccion}</p>}
          <div className={panelClass} style={panelStyle}>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-red-700 shadow-sm">
              <span>✅</span>
              Vista Checklist
            </div>
            <div className="space-y-2">
              {elementos.map((elem: { etiqueta?: string; titulo?: string; nombre?: string; contenido_oculto?: string; descripcion?: string; contenido?: string }, i: number) => (
                <div key={i} className="rounded-lg border border-red-100 bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-green-600">✓</span>
                    <div>
                      <p className="font-semibold text-gray-900">{elem.etiqueta || elem.titulo || elem.nombre || `Paso ${i + 1}`}</p>
                      <p className="mt-1 text-sm text-gray-700">{elem.contenido_oculto || elem.descripcion || elem.contenido || ""}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <details className="mt-4">
            <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Ver JSON completo</summary>
            <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-48">
              {JSON.stringify(contenido, null, 2)}
            </pre>
          </details>
        </div>
      );
    }

    if (isTabsLayout) {
      const safeActiveIndex = Math.min(interactiveTabIndex, Math.max(elementos.length - 1, 0));
      const active = elementos[safeActiveIndex];
      const activeTitle = active?.etiqueta || active?.titulo || active?.nombre || "Detalle";
      const activeContent = active?.contenido_oculto || active?.descripcion || active?.contenido || "";

      return (
        <div className="space-y-4">
          {titulo && <h3 className="text-xl font-bold text-gray-900 border-b pb-2">{titulo}</h3>}
          {instruccion && <p className="text-sm text-gray-600 italic">{instruccion}</p>}

          <div className={panelClass} style={panelStyle}>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-red-700 shadow-sm">
              <span>📑</span>
              Vista Tabs horizontal
            </div>
            <div className="flex flex-wrap gap-2">
              {elementos.map((elem: { etiqueta?: string; titulo?: string; nombre?: string }, i: number) => {
                const label = elem.etiqueta || elem.titulo || elem.nombre || `Tab ${i + 1}`;
                const isActive = i === safeActiveIndex;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setInteractiveTabIndex(i)}
                    className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-red-600 text-white"
                        : "bg-white text-red-700 border border-red-200 hover:bg-red-50"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 rounded-lg border border-red-100 bg-white p-4">
              <p className="font-semibold text-gray-900">{activeTitle}</p>
              <p className="mt-2 text-sm text-gray-700">{activeContent}</p>
            </div>
          </div>

          <details className="mt-4">
            <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Ver JSON completo</summary>
            <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-48">
              {JSON.stringify(contenido, null, 2)}
            </pre>
          </details>
        </div>
      );
    }

    if (isRoadmap) {
      return (
        <div className="space-y-4">
          {titulo && <h3 className="text-xl font-bold text-gray-900 border-b pb-2">{titulo}</h3>}
          {c.instruccion && <p className="text-sm text-gray-600 italic">{c.instruccion}</p>}
          <div className={panelClass} style={panelStyle}>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-red-700 shadow-sm">
              <span>🗺️</span>
              Vista Roadmap
            </div>
            <div className="space-y-0">
              {elementos.map((elem: { etiqueta?: string; titulo?: string; nombre?: string; contenido_oculto?: string; descripcion?: string; contenido?: string }, i: number) => {
                const stepTitle = elem.etiqueta || elem.titulo || elem.nombre || `Paso ${i + 1}`;
                const normalizedStepTitle = String(stepTitle).replace(/^\d+[\.)\s\-:]+/, "").trim() || stepTitle;
                const stepContent = elem.contenido_oculto || elem.descripcion || elem.contenido || "";
                const isLast = i === elementos.length - 1;
                return (
                  <div key={i} className="relative pl-12">
                    {!isLast && (
                      <span className="absolute left-5 top-9 h-[calc(100%-1rem)] w-0.5 bg-red-200" />
                    )}
                    <div className="absolute left-0 top-1 flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-sm font-bold text-white shadow-sm">
                      {i + 1}
                    </div>
                    <div className="mb-4 rounded-lg border border-red-100 bg-white p-4 shadow-sm">
                      <p className="font-semibold text-gray-900">{normalizedStepTitle}</p>
                      {stepContent && <p className="mt-2 text-sm text-gray-600">{stepContent}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <details className="mt-4">
            <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Ver JSON completo</summary>
            <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-48">
              {JSON.stringify(contenido, null, 2)}
            </pre>
          </details>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {titulo && <h3 className="text-xl font-bold text-gray-900 border-b pb-2">{titulo}</h3>}
        {c.instruccion && <p className="text-sm text-gray-600 italic">{c.instruccion}</p>}
        <div className="space-y-3">
          {elementos.map((elem: { etiqueta?: string; titulo?: string; nombre?: string; contenido_oculto?: string; descripcion?: string; contenido?: string }, i: number) => (
            <details key={i} className="group">
              <summary className="p-4 bg-red-600 text-white rounded-lg cursor-pointer hover:bg-red-700 transition-colors list-none flex items-center justify-between">
                <span className="font-medium">{elem.etiqueta || elem.titulo || elem.nombre || `Elemento ${i + 1}`}</span>
                <svg className="h-5 w-5 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="p-4 bg-gray-50 border border-t-0 border-gray-200 rounded-b-lg">
                <p className="text-gray-700">{elem.contenido_oculto || elem.descripcion || elem.contenido}</p>
              </div>
            </details>
          ))}
        </div>
        <details className="mt-4">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Ver JSON completo</summary>
          <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-48">
            {JSON.stringify(contenido, null, 2)}
          </pre>
        </details>
      </div>
    );
  }

  // Default
  return (
    <pre className="p-4 bg-gray-50 rounded-lg overflow-auto text-sm">
      {JSON.stringify(contenido, null, 2)}
    </pre>
  );
}

// Chat component for iterating content with AI
function IterationChat({ guion, tipo, mallaId, history, onHistoryUpdate, onUpdate }: {
  guion: Guion;
  tipo: string;
  mallaId: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  onHistoryUpdate: (history: Array<{ role: "user" | "assistant"; content: string }>) => void;
  onUpdate: (guion: Guion, persisted?: boolean) => void;
}) {
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [intentModeSupported, setIntentModeSupported] = useState<boolean | null>(null);
  const [selectedFormatId, setSelectedFormatId] = useState<string>("none");
  const [formatProposal, setFormatProposal] = useState<{
    triggerMessage: string;
    recommendedId: string;
    optionIds: string[];
    reason: string;
  } | null>(null);
  const [slideProposal, setSlideProposal] = useState<{
    triggerMessage: string;
    recommendedId: SlideAddOptionId;
    optionIds: SlideAddOptionId[];
    reason: string;
  } | null>(null);

  type IntentAnalysisAction = "agregar_slide" | "cambiar_formato" | "editar_contenido" | "editar_estilo" | "aclarar";
  type IntentAnalysisResult = {
    accion: IntentAnalysisAction;
    confianza: number;
    resumen_entendido?: string;
    pregunta_confirmacion?: string;
    propuesta?: {
      tipo_slide?: string | null;
      formato_visual?: string | null;
      tema?: string | null;
      mantener_existente?: boolean;
    };
  };

  useEffect(() => {
    let isMounted = true;
    const probe = async () => {
      try {
        const res = await iterarGuionRequest({
          modo: "analizar_intencion",
          feedback: "ping",
          tipo_recurso: tipo,
          contenido_actual: {},
        });
        const result = await res.json().catch(() => null);
        const supported = Boolean(res.ok && result?.ok && result?.modo === "analizar_intencion");
        if (isMounted) setIntentModeSupported(supported);
      } catch {
        if (isMounted) setIntentModeSupported(false);
      }
    };
    void probe();
    return () => {
      isMounted = false;
    };
  }, [tipo]);

  const inferFormatFromText = (rawMessage: string): string => {
    const msg = rawMessage.toLowerCase();
    const found = INTERACTIVE_VISUAL_FORMATS.find((opt) => opt.id !== "none" && opt.keywords.test(msg));
    return found?.id || "none";
  };

  const buildVisualFallbackContent = (current: Guion["contenido"], formatId: string): Guion["contenido"] => {
    if (isComponentContent(current)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const content = current as any;
      const componentes = Array.isArray(content.componentes) ? content.componentes : [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tableIndex = componentes.findIndex((c: any) => {
        const t = String(c?.tipo || "").toLowerCase();
        return t === "tabla" || t === "comparador";
      });

      if (tableIndex === -1) return current;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tableComp = componentes[tableIndex] as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = Array.isArray(tableComp.filas) ? tableComp.filas : [];
      const titleBase = String(tableComp.titulo || "Comparación");

      const cardsItems = rows.map((row) => ({
        titulo: String(row?.aspecto || "Aspecto"),
        descripcion: Array.isArray(row?.valores) ? row.valores.filter(Boolean).join(" — ") : String(row?.valores || ""),
      }));

      const listItems = rows.map((row) => {
        const aspect = String(row?.aspecto || "Punto");
        const detail = Array.isArray(row?.valores) ? row.valores.filter(Boolean).join(" — ") : String(row?.valores || "");
        return `${aspect}: ${detail}`;
      });

      const acordeonItems = rows.map((row) => ({
        titulo: String(row?.aspecto || "Tema"),
        contenido: Array.isArray(row?.valores) ? row.valores.filter(Boolean).join(" — ") : String(row?.valores || ""),
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let replacement: any = tableComp;
      if (formatId === "cards_grid") {
        replacement = { tipo: "cards", columnas: 2, items: cardsItems };
      } else if (formatId === "checklist_steps") {
        replacement = { tipo: "lista", titulo: `Checklist: ${titleBase}`, estilo: "checks", items: listItems };
      } else if (formatId === "roadmap_timeline") {
        replacement = { tipo: "lista", titulo: `Roadmap: ${titleBase}`, estilo: "numbers", items: listItems };
      } else if (formatId === "matrix_2x2") {
        replacement = { tipo: "cards", columnas: 2, items: cardsItems.slice(0, 4) };
      } else if (formatId === "tabs_horizontal") {
        replacement = { tipo: "acordeon", items: acordeonItems };
      }

      const newComponents = [...componentes];
      newComponents[tableIndex] = replacement;
      return {
        ...content,
        componentes: newComponents,
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = current as any;
    const elementosBase = c.elementos || c.items || c.secciones || [];
    const elementos = elementosBase.map((elem: { etiqueta?: string; titulo?: string; nombre?: string; contenido_oculto?: string; descripcion?: string; contenido?: string }, i: number) => ({
      etiqueta: elem.etiqueta || elem.titulo || elem.nombre || `Elemento ${i + 1}`,
      contenido_oculto: elem.contenido_oculto || elem.descripcion || elem.contenido || "",
    }));

    const tituloBase = c.titulo || c.titulo_principal || "Exploración interactiva";
    if (formatId === "tabs_horizontal") {
      return {
        ...c,
        titulo: /tabs/i.test(tituloBase) ? tituloBase : `Tabs: ${tituloBase}`,
        instruccion: "Explora cada pestaña para ver el detalle.",
        elementos,
      };
    }

    if (formatId === "roadmap_timeline") {
      const roadmapElements = elementos.map((elem: { etiqueta: string; contenido_oculto: string }, i: number) => ({
        etiqueta: `${i + 1}. ${elem.etiqueta}`.replace(/^\d+\.\s*\d+\.\s*/, `${i + 1}. `),
        contenido_oculto: elem.contenido_oculto,
      }));
      return {
        ...c,
        titulo: /roadmap|timeline|línea de tiempo|linea de tiempo/i.test(tituloBase) ? tituloBase : `Roadmap: ${tituloBase}`,
        instruccion: "Sigue los pasos en orden para completar el proceso.",
        elementos: roadmapElements,
      };
    }

    if (formatId === "cards_grid") {
      return {
        ...c,
        titulo: /cards|tarjetas|grilla|grid/i.test(tituloBase) ? tituloBase : `Cards: ${tituloBase}`,
        instruccion: "Explora las tarjetas para revisar ideas clave.",
        elementos,
      };
    }

    if (formatId === "checklist_steps") {
      return {
        ...c,
        titulo: /checklist|lista de chequeo|lista de verificación|lista de verificacion/i.test(tituloBase) ? tituloBase : `Checklist: ${tituloBase}`,
        instruccion: "Valida cada punto antes de avanzar.",
        elementos,
      };
    }

    if (formatId === "matrix_2x2") {
      return {
        ...c,
        titulo: /matriz|2x2|cuadrantes/i.test(tituloBase) ? tituloBase : `Matriz 2x2: ${tituloBase}`,
        instruccion: "Analiza cada cuadrante para priorizar mejor.",
        elementos: elementos.slice(0, 4),
      };
    }

    return { ...c, elementos };
  };

  const hasGenericFormatIntent = (rawMessage: string) => GENERIC_REDESIGN_INTENT.test(rawMessage.toLowerCase());
  const supportsFormatProposal = tipo === "Interactivo" || tipo === "Comparador" || isComponentContent(guion.contenido);
  const supportsSlideProposal = tipo !== "Video avatar";

  const hasAddSlideIntent = (rawMessage: string) => ADD_SLIDE_INTENT.test(rawMessage.toLowerCase());

  const detectSlideOptionFromText = (rawMessage: string): SlideAddOptionId | null => {
    const msg = rawMessage.toLowerCase();
    if (/(quiz|pregunta|evalu(a|á)|test|valida)/.test(msg)) return "quiz_rapido";
    if (/(caso|escenario|situaci[oó]n|pr[aá]ctic)/.test(msg)) return "caso_aplicado";
    if (/(check|lista|paso|acciones)/.test(msg)) return "checklist_accion";
    if (/(mito|realidad|creencia|error frecuente)/.test(msg)) return "mitos_realidad";
    if (/(detalle|detallad|profund|amplia|expand)/.test(msg)) return "detalle_profundo";
    return null;
  };

  const inferSlideOptionFromText = (rawMessage: string): SlideAddOptionId => {
    return detectSlideOptionFromText(rawMessage) || "detalle_profundo";
  };

  const extractTopicFromMessage = (rawMessage: string): string | null => {
    const msg = rawMessage.replace(/\s+/g, " ").trim();

    const explicitTopic =
      msg.match(/(?:sobre|acerca de|de|en torno a)\s+(.+)$/i)?.[1] ||
      msg.match(/(?:tema|topico|tópico)\s*[:\-]\s*(.+)$/i)?.[1];
    if (!explicitTopic) return null;

    const cleaned = explicitTopic
      .replace(/^((un|una|el|la|los|las)\s+)/i, "")
      .replace(/[.,;!?]+$/g, "")
      .trim();

    if (!cleaned || cleaned.length < 3) return null;
    return cleaned.slice(0, 90);
  };

  const hasStyleEditIntent = (rawMessage: string) => STYLE_EDIT_INTENT.test(rawMessage.toLowerCase());

  const hexToRgba = (hex: string, alpha: number) => {
    const clean = hex.replace("#", "").trim();
    const full = clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean;
    if (!/^[0-9a-f]{6}$/i.test(full)) return null;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  };

  const buildStyleFallbackContent = (current: Guion["contenido"], rawMessage: string): Guion["contenido"] | null => {
    const msg = rawMessage.toLowerCase();
    const hasBackgroundRequest = /(fondo|background|color de fondo)/.test(msg);
    const wantsNoBackground = msg.includes("sin fondo");
    const explicitHex = msg.match(/#([0-9a-f]{3}|[0-9a-f]{6})\b/i)?.[0] || null;

    let targetSolidColor: string | null = null;
    let targetOverlay: string | null = null;

    if (explicitHex && hasBackgroundRequest) {
      targetSolidColor = explicitHex;
      targetOverlay = hexToRgba(explicitHex, 0.96);
    } else if (hasBackgroundRequest) {
      if (/(blanc|white)/.test(msg)) {
        targetSolidColor = "#ffffff";
        targetOverlay = "rgba(255,255,255,0.98)";
      } else if (/(negro|black|oscuro)/.test(msg)) {
        targetSolidColor = "#111827";
        targetOverlay = "rgba(0,0,0,0.88)";
      } else if (/(gris|gray)/.test(msg)) {
        targetSolidColor = "#f3f4f6";
        targetOverlay = "rgba(243,244,246,0.98)";
      } else if (/(azul|blue)/.test(msg)) {
        targetSolidColor = "#0f3460";
        targetOverlay = "rgba(15,52,96,0.92)";
      } else if (/(rojo|red)/.test(msg)) {
        targetSolidColor = "#da291c";
        targetOverlay = "rgba(218,41,28,0.90)";
      } else if (/(verde|green)/.test(msg)) {
        targetSolidColor = "#166534";
        targetOverlay = "rgba(22,101,52,0.90)";
      }
    }

    if (isComponentContent(current)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const content = current as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prevConfig: any = typeof content.config === "object" && content.config ? content.config : {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nextConfig: any = { ...prevConfig };
      let changed = false;

      if (targetOverlay) {
        nextConfig.fondo_imagen = "";
        nextConfig.fondo_overlay = targetOverlay;
        changed = true;
      }

      if (wantsNoBackground) {
        nextConfig.fondo_imagen = "";
        changed = true;
      }

      if (!changed) return null;
      return {
        ...content,
        config: nextConfig,
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content = { ...(current as any) };
    let changed = false;

    if (targetSolidColor) {
      content.fondo_color = targetSolidColor;
      content.borde_color = /(blanc|white|gris|gray)/.test(msg) ? "#d1d5db" : "#fca5a5";
      changed = true;
    }

    if (wantsNoBackground) {
      delete content.fondo_color;
      delete content.background_color;
      delete content.borde_color;
      if (content.config_visual && typeof content.config_visual === "object") {
        delete content.config_visual.fondo_color;
      }
      changed = true;
    }

    return changed ? content : null;
  };

  const normalizeSlideOptionFromAI = (rawOption: unknown): SlideAddOptionId | null => {
    const value = String(rawOption || "").toLowerCase().trim();
    if (!value) return null;
    if (value === "detalle_profundo") return "detalle_profundo";
    if (value === "caso_aplicado") return "caso_aplicado";
    if (value === "checklist_accion") return "checklist_accion";
    if (value === "quiz_rapido") return "quiz_rapido";
    if (value === "mitos_realidad") return "mitos_realidad";

    if (/(detalle|profund)/.test(value)) return "detalle_profundo";
    if (/(caso|escenario)/.test(value)) return "caso_aplicado";
    if (/(check|lista|paso)/.test(value)) return "checklist_accion";
    if (/(quiz|pregunta|test)/.test(value)) return "quiz_rapido";
    if (/(mito|realidad)/.test(value)) return "mitos_realidad";
    return null;
  };

  const normalizeFormatFromAI = (rawOption: unknown): string | null => {
    const value = String(rawOption || "").toLowerCase().trim();
    if (!value) return null;

    const direct = INTERACTIVE_VISUAL_FORMATS.find((opt) => opt.id === value && opt.id !== "none");
    if (direct) return direct.id;

    if (/(tabs|pestañ|horizontal)/.test(value)) return "tabs_horizontal";
    if (/(roadmap|timeline|tiempo|secuencia|paso)/.test(value)) return "roadmap_timeline";
    if (/(cards|tarjeta|grilla|grid)/.test(value)) return "cards_grid";
    if (/(check|lista)/.test(value)) return "checklist_steps";
    if (/(matriz|2x2|cuadrant)/.test(value)) return "matrix_2x2";
    return null;
  };

  const analyzeIntentWithAI = async (rawMessage: string): Promise<IntentAnalysisResult | null> => {
    if (!intentModeSupported) return null;

    try {
      const res = await iterarGuionRequest({
        modo: "analizar_intencion",
        malla_id: mallaId,
        guion_id: guion.id,
        feedback: rawMessage,
        tipo_recurso: tipo,
        contenido_actual: guion.contenido,
      });
      const result = await res.json();
      if (!res.ok || !result?.ok || result?.modo !== "analizar_intencion") return null;
      const accion = String(result.accion || "").toLowerCase();
      if (!["agregar_slide", "cambiar_formato", "editar_contenido", "editar_estilo", "aclarar"].includes(accion)) return null;
      const confianza = Number(result.confianza || 0);
      return {
        accion: accion as IntentAnalysisAction,
        confianza: Number.isFinite(confianza) ? Math.max(0, Math.min(1, confianza)) : 0,
        resumen_entendido: typeof result.resumen_entendido === "string" ? result.resumen_entendido : undefined,
        pregunta_confirmacion: typeof result.pregunta_confirmacion === "string" ? result.pregunta_confirmacion : undefined,
        propuesta: typeof result.propuesta === "object" && result.propuesta !== null ? result.propuesta : undefined,
      };
    } catch {
      return null;
    }
  };

  const buildSlideProposal = (rawMessage: string) => {
    const recommendedId = inferSlideOptionFromText(rawMessage);
    const optionIds = SLIDE_ADD_OPTIONS.map((opt) => opt.id);
    const recommended = SLIDE_ADD_OPTIONS.find((opt) => opt.id === recommendedId);

    return {
      triggerMessage: rawMessage,
      recommendedId,
      optionIds,
      reason: recommended
        ? `Te propongo sumar una slide tipo "${recommended.label}" para reforzar aprendizaje sin romper la estructura actual.`
        : "Te propongo sumar una slide adicional para profundizar el recurso.",
    };
  };

  const extractSeedPoints = (current: Guion["contenido"]): string[] => {
    const points: string[] = [];
    const pushIfValid = (value: unknown) => {
      const text = String(value || "").replace(/\s+/g, " ").trim();
      if (!text) return;
      if (text.length < 3) return;
      if (!points.includes(text)) points.push(text);
    };

    if (isComponentContent(current)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const content = current as any;
      const componentes = Array.isArray(content.componentes) ? content.componentes : [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      componentes.forEach((comp: any) => {
        const compType = String(comp?.tipo || "").toLowerCase().trim();
        if (compType === "header") pushIfValid(comp.titulo);
        if (compType === "cards" && Array.isArray(comp.items)) comp.items.forEach((item: { titulo?: string }) => pushIfValid(item?.titulo));
        if (compType === "lista" && Array.isArray(comp.items)) comp.items.forEach((item: string) => pushIfValid(item));
        if ((compType === "tabla" || compType === "comparador") && Array.isArray(comp.filas)) comp.filas.forEach((row: { aspecto?: string }) => pushIfValid(row?.aspecto));
        if (compType === "acordeon" && Array.isArray(comp.items)) comp.items.forEach((item: { titulo?: string }) => pushIfValid(item?.titulo));
      });
      return points.slice(0, 8);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = current as any;
    pushIfValid(c.titulo);
    pushIfValid(c.titulo_principal);
    if (Array.isArray(c.slides)) c.slides.forEach((slide: { titulo?: string }) => pushIfValid(slide?.titulo));
    if (Array.isArray(c.elementos)) c.elementos.forEach((elem: { etiqueta?: string; titulo?: string; nombre?: string }) => pushIfValid(elem?.etiqueta || elem?.titulo || elem?.nombre));
    if (Array.isArray(c.secciones)) c.secciones.forEach((sec: { titulo?: string; nombre?: string }) => pushIfValid(sec?.titulo || sec?.nombre));
    if (Array.isArray(c.filas)) c.filas.forEach((fila: { aspecto?: string; nombre?: string }) => pushIfValid(fila?.aspecto || fila?.nombre));
    if (Array.isArray(c.items)) {
      c.items.forEach((item: { titulo?: string; nombre?: string; frente?: string }) => {
        pushIfValid(item?.titulo || item?.nombre || item?.frente);
      });
    }
    return points.slice(0, 8);
  };

  const inferTopicLabel = (current: Guion["contenido"]): string => {
    if (isComponentContent(current)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const content = current as any;
      const header = Array.isArray(content.componentes)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? content.componentes.find((comp: any) => String(comp?.tipo || "").toLowerCase().trim() === "header")
        : null;
      const title = String(header?.titulo || "").trim();
      if (title) return title;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = current as any;
    const title = String(c.titulo || c.titulo_principal || "").trim();
    if (title) return title;

    const seeds = extractSeedPoints(current);
    return seeds[0] || "este tema";
  };

  const buildOptionCopy = (optionId: SlideAddOptionId, topicLabel: string, seedPoints: string[]) => {
    const p1 = seedPoints[0] || "punto clave 1";
    const p2 = seedPoints[1] || "punto clave 2";
    const p3 = seedPoints[2] || "punto clave 3";
    const p4 = seedPoints[3] || "punto clave 4";

    if (optionId === "detalle_profundo") {
      return {
        slideTitle: `Profundización: ${topicLabel}`,
        slideDetail: `Desglosamos ${topicLabel} en acciones concretas y señales de riesgo.`,
        bullets: [
          `Qué implica ${p1} en la práctica diaria`,
          `Cómo ejecutar ${p2} sin fricción para el cliente`,
          `Errores típicos al trabajar ${p3}`,
          `Qué revisar antes de cerrar ${p4}`,
        ],
      };
    }

    if (optionId === "caso_aplicado") {
      return {
        slideTitle: `Caso aplicado: ${topicLabel}`,
        slideDetail: `Escenario real para decidir bien frente a ${topicLabel}.`,
        bullets: [
          "Contexto del cliente y señal inicial de alerta",
          `Decisión 1 vinculada a ${p1}`,
          `Decisión 2 vinculada a ${p2}`,
          "Resultado esperado y aprendizaje clave",
        ],
      };
    }

    if (optionId === "checklist_accion") {
      return {
        slideTitle: `Checklist de acción: ${topicLabel}`,
        slideDetail: `Secuencia mínima para ejecutar ${topicLabel} con calidad.`,
        bullets: [
          `Validar ${p1}`,
          `Confirmar ${p2}`,
          `Documentar ${p3}`,
          "Registrar evidencia y cierre",
        ],
      };
    }

    if (optionId === "quiz_rapido") {
      return {
        slideTitle: `Quiz rápido: ${topicLabel}`,
        slideDetail: "Dos preguntas cortas para validar comprensión inmediata.",
        bullets: [
          `Pregunta sobre ${p1}`,
          `Pregunta sobre ${p2}`,
          "Feedback inmediato para reforzar concepto",
        ],
      };
    }

    return {
      slideTitle: `Mitos y realidades: ${topicLabel}`,
      slideDetail: "Aclaramos ideas erróneas frecuentes para mejorar criterio.",
      bullets: [
        `Mito frecuente sobre ${p1}`,
        `Realidad operativa sobre ${p2}`,
        `Mito frecuente sobre ${p3}`,
        `Realidad operativa sobre ${p4}`,
      ],
    };
  };

  const buildAddedSlideContent = (
    current: Guion["contenido"],
    optionId: SlideAddOptionId,
    rawMessage?: string
  ): Guion["contenido"] => {
    const requestedTopic = rawMessage ? extractTopicFromMessage(rawMessage) : null;
    const topicLabel = requestedTopic || inferTopicLabel(current);
    const seedPointsBase = extractSeedPoints(current);
    const seedPoints = requestedTopic
      ? [requestedTopic, ...seedPointsBase.filter((point) => point.toLowerCase() !== requestedTopic.toLowerCase())]
      : seedPointsBase;
    const copy = buildOptionCopy(optionId, topicLabel, seedPoints);

    if (isComponentContent(current)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const content = current as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const componentes: any[] = Array.isArray(content.componentes) ? [...content.componentes] : [];
      const newComponents: ResourceComponent[] = [];
      const lastType = String(componentes[componentes.length - 1]?.tipo || "").toLowerCase().trim();

      if (lastType !== "separador") {
        newComponents.push({ tipo: "separador" });
      }

      newComponents.push({
        tipo: "header",
        titulo: copy.slideTitle,
        subtitulo: "Nueva slide propuesta por IA",
        icono: "🆕",
      });

      if (optionId === "detalle_profundo") {
        newComponents.push({
          tipo: "acordeon",
          items: copy.bullets.map((bullet) => ({
            titulo: bullet,
            contenido: `Aplicación práctica: ${bullet}.`,
          })),
        });
      } else if (optionId === "caso_aplicado") {
        newComponents.push({
          tipo: "caso",
          escenario: copy.slideDetail,
          preguntas: [
            {
              pregunta: `¿Cuál es el primer paso correcto frente a ${seedPoints[0] || "la situación"}?`,
              opciones: ["Ignorar la alerta", "Validar evidencia y contexto", "Escalar sin revisar"],
              correcta: 1,
              feedback: "Primero validamos contexto y evidencia para decidir con criterio.",
            },
            {
              pregunta: "¿Qué práctica reduce riesgo en este caso?",
              opciones: ["Actuar por intuición", "Aplicar el protocolo definido", "Cerrar rápido sin verificar"],
              correcta: 1,
              feedback: "Seguir protocolo mantiene consistencia y trazabilidad.",
            },
          ],
        });
      } else if (optionId === "checklist_accion") {
        newComponents.push({
          tipo: "lista",
          titulo: copy.slideTitle,
          estilo: "checks",
          items: copy.bullets,
        });
      } else if (optionId === "quiz_rapido") {
        newComponents.push({
          tipo: "quiz",
          preguntas: [
            {
              pregunta: `¿Qué describe mejor ${seedPoints[0] || topicLabel}?`,
              opciones: ["Una acción opcional", "Un paso clave del proceso", "Un detalle irrelevante"],
              correcta: 1,
            },
            {
              pregunta: "¿Cuál es la mejor forma de prevenir errores?",
              opciones: ["Saltar validaciones", "Aplicar checklist y evidencia", "Acelerar sin confirmar"],
              correcta: 1,
            },
          ],
        });
      } else {
        newComponents.push({
          tipo: "cards",
          columnas: 2,
          items: [
            { icono: "❌", titulo: copy.bullets[0] || "Mito 1", descripcion: "Realidad: valida fuentes antes de actuar." },
            { icono: "✅", titulo: copy.bullets[1] || "Realidad 1", descripcion: "Decidir con evidencia mejora resultados." },
            { icono: "❌", titulo: copy.bullets[2] || "Mito 2", descripcion: "Atajos sin criterio elevan riesgo." },
            { icono: "✅", titulo: copy.bullets[3] || "Realidad 2", descripcion: "El protocolo reduce errores repetidos." },
          ],
        });
      }

      return {
        ...content,
        componentes: [...componentes, ...newComponents],
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content = { ...(current as any) };
    const titleLower = String(content.titulo || content.titulo_principal || "").toLowerCase();
    const instructionLower = String(content.instruccion || "").toLowerCase();
    const existingElements = Array.isArray(content.elementos) ? content.elementos : [];
    const looksLikeMatrix =
      /(matriz|2x2|cuadrant)/.test(titleLower) ||
      /(matriz|2x2|cuadrant)/.test(instructionLower) ||
      (existingElements.length >= 4 && existingElements.slice(0, 4).every((elem: { etiqueta?: string; titulo?: string; nombre?: string }) => {
        const label = String(elem?.etiqueta || elem?.titulo || elem?.nombre || "").toLowerCase();
        return /cuadrant/.test(label);
      }));
    const wantsFifthQuadrant = Boolean(
      rawMessage &&
      /(5to|5°|5o|quint|quinta|quinto|5th)/i.test(rawMessage) &&
      /cuadrant/i.test(rawMessage)
    );

    let newLabel = copy.slideTitle;
    let newDetail = copy.slideDetail;
    if (looksLikeMatrix && wantsFifthQuadrant) {
      newLabel = "Cuadrante 5: Conclusión";
      newDetail = `Conclusión de la matriz: ${copy.slideDetail}`;
    } else if (looksLikeMatrix && optionId === "detalle_profundo") {
      newLabel = "Conclusión general de la matriz";
      newDetail = copy.slideDetail;
    }

    const newElement = {
      etiqueta: newLabel,
      contenido_oculto: newDetail,
    };

    if (Array.isArray(content.slides)) {
      content.slides = [
        ...content.slides,
        {
          titulo: copy.slideTitle,
          bullets: copy.bullets,
        },
      ];
      return content;
    }

    if (Array.isArray(content.elementos)) {
      content.elementos = [...content.elementos, newElement];
      return content;
    }

    if (Array.isArray(content.secciones)) {
      content.secciones = [
        ...content.secciones,
        {
          titulo: copy.slideTitle,
          descripcion: copy.slideDetail,
        },
      ];
      return content;
    }

    if (Array.isArray(content.items)) {
      const sample = content.items[0];
      if (sample && typeof sample === "object" && ("frente" in sample || "reverso" in sample)) {
        content.items = [
          ...content.items,
          {
            frente: copy.slideTitle,
            reverso: copy.slideDetail,
          },
        ];
      } else {
        content.items = [
          ...content.items,
          {
            titulo: copy.slideTitle,
            descripcion: copy.slideDetail,
          },
        ];
      }
      return content;
    }

    if (Array.isArray(content.filas)) {
      content.filas = [
        ...content.filas,
        {
          aspecto: copy.slideTitle,
          valores: copy.bullets.slice(0, 2),
        },
      ];
      return content;
    }

    if (Array.isArray(content.preguntas)) {
      content.preguntas = [
        ...content.preguntas,
        {
          pregunta: copy.slideTitle,
          opciones: copy.bullets.slice(0, 3),
          correcta: 0,
        },
      ];
      return content;
    }

    content.slides = [
      {
        titulo: copy.slideTitle,
        bullets: copy.bullets,
      },
    ];
    return content;
  };

  const getSuggestedFormatIds = (rawMessage: string): string[] => {
    if (!supportsFormatProposal) return [];
    const msg = rawMessage.trim().toLowerCase();
    const suggestions: string[] = [];

    if (!msg) return ["cards_grid", "tabs_horizontal", "roadmap_timeline"];
    if (/(proceso|paso|pasos|flujo|secuencia|ruta|camino)/.test(msg)) {
      suggestions.push("roadmap_timeline", "checklist_steps");
    }
    if (/(compar|versus|vs|opciones|prioriza|criterio|decisión|decision)/.test(msg)) {
      suggestions.push("matrix_2x2", "tabs_horizontal");
    }
    if (/(tabla|table|comparador|cuadro|filas|columnas)/.test(msg)) {
      suggestions.push("cards_grid", "tabs_horizontal", "roadmap_timeline");
    }
    if (/(linda|visual|moderno|dinámic|dinamic|impacto|prolijo)/.test(msg)) {
      suggestions.push("cards_grid", "tabs_horizontal");
    }
    if (/(disruptiv|tech|techie|futurist|innovador|wow|premium)/.test(msg)) {
      suggestions.push("cards_grid", "matrix_2x2", "tabs_horizontal");
    }
    if (/(resum|corto|rápido|rapido|scan|escanear)/.test(msg)) {
      suggestions.push("checklist_steps", "cards_grid");
    }

    if (suggestions.length === 0) {
      suggestions.push("cards_grid", "tabs_horizontal", "roadmap_timeline");
    }

    return Array.from(new Set(suggestions)).slice(0, 3);
  };

  const buildFormatProposal = (rawMessage: string) => {
    const optionIds = getSuggestedFormatIds(rawMessage);
    const recommendedId = optionIds[0] || "cards_grid";
    const recommended = INTERACTIVE_VISUAL_FORMATS.find((opt) => opt.id === recommendedId);
    const reasonByFormat: Record<string, string> = {
      tabs_horizontal: "organiza el contenido en secciones paralelas y mejora escaneo rápido",
      roadmap_timeline: "ordena la información como flujo de pasos y refuerza secuencia",
      cards_grid: "hace la lectura más visual y modular, ideal para resumir por bloques",
      checklist_steps: "convierte el contenido en acciones verificables y concretas",
      matrix_2x2: "facilita comparación y priorización por cuadrantes",
    };

    return {
      triggerMessage: rawMessage,
      recommendedId,
      optionIds,
      reason: recommended
        ? `Te propongo "${recommended.label}" porque ${reasonByFormat[recommended.id] || "mejora la claridad visual"}.`
        : "Te propongo un formato más estructurado para mejorar claridad.",
    };
  };

  const buildEffectiveFeedback = (rawMessage: string, explicitFormatId: string) => {
    const text = rawMessage.toLowerCase();
    const inferredFormatId = inferFormatFromText(rawMessage);
    const formatId = explicitFormatId !== "none" ? explicitFormatId : inferredFormatId;
    const selectedFormat = INTERACTIVE_VISUAL_FORMATS.find((opt) => opt.id === formatId);

    if (selectedFormat && selectedFormat.id !== "none" && isComponentContent(guion.contenido)) {
      return `${rawMessage}

CONVERSION DE FORMATO (MODO COMPONENTES):
- Convierte el contenido al formato "${selectedFormat.label}".
- Mantén la estructura raíz con "componentes" y "config".
- Preserva componentes existentes de contexto (ej: header, intro, cta, separador).
- Si hay un componente tipo tabla/comparador, transforma ese bloque al nuevo formato.
- Usa solo tipos soportados: header, intro, cards, lista, tabla, comparador, acordeon, cta, separador, flashcards, quiz, caso.
- No elimines información clave, solo reorganízala visualmente.`;
    }

    if (tipo === "Interactivo" && selectedFormat && selectedFormat.id !== "none") {
      return `${rawMessage}

CONVERSION DE FORMATO (permitida):
- ${selectedFormat.instruction}`;
    }

    // Bridge direct requests if no explicit selection
    if (tipo === "Interactivo" && /(horizontal|en fila|lado a lado|tabs|pestañas|pestanas)/.test(text)) {
      return `${rawMessage}

CONVERSION DE FORMATO (permitida):
- ${INTERACTIVE_VISUAL_FORMATS.find((opt) => opt.id === "tabs_horizontal")?.instruction}`;
    }

    return rawMessage;
  };

  const runIteration = async (rawMessage: string, forcedFormatId?: string) => {
    if (!rawMessage.trim() || isLoading) return;

    const userMessage = rawMessage.trim();
    const inferredFormatId = inferFormatFromText(userMessage);
    const effectiveFormatId = forcedFormatId || (selectedFormatId !== "none" ? selectedFormatId : inferredFormatId);
    const effectiveFeedback = buildEffectiveFeedback(userMessage, effectiveFormatId);

    onHistoryUpdate([...history, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      const payload = {
        malla_id: mallaId,
        guion_id: guion.id,
        feedback: effectiveFeedback,
        tipo_recurso: tipo,
        contenido_actual: guion.contenido,
      };

      const res = await iterarGuionRequest(payload);

      const result = await res.json();
      if (!res.ok || result.error) {
        throw new Error(result.error || "Error al iterar");
      }

      if (result.no_puede) {
        if (supportsFormatProposal && effectiveFormatId !== "none") {
          const fallbackContent = buildVisualFallbackContent(guion.contenido, effectiveFormatId);
          const newGuion = { ...guion, contenido: fallbackContent };
          onUpdate(newGuion, false);
          setFormatProposal(null);
          setSlideProposal(null);
          setSelectedFormatId("none");

          const selectedFormat = INTERACTIVE_VISUAL_FORMATS.find((opt) => opt.id === effectiveFormatId);
          onHistoryUpdate([...history,
            { role: "user", content: userMessage },
            { role: "assistant", content: `⚠️ La IA no pudo aplicar el cambio completo, pero convertí el preview a "${selectedFormat?.label || "formato seleccionado"}" para que puedas avanzar.` }
          ]);
          return;
        }

        onHistoryUpdate([...history,
          { role: "user", content: userMessage },
          { role: "assistant", content: `⚠️ ${result.mensaje}` }
        ]);
        return;
      }

      if (!result.contenido) {
        throw new Error("La IA no devolvió contenido actualizado.");
      }

      const currentContent = JSON.stringify(guion.contenido);
      const updatedContent = JSON.stringify(result.contenido);
      if (currentContent === updatedContent) {
        onHistoryUpdate([...history,
          { role: "user", content: userMessage },
          { role: "assistant", content: "⚠️ No hubo cambios reales en el contenido. Probá con una instrucción más específica." }
        ]);
        return;
      }

      const newGuion = { ...guion, contenido: result.contenido };
      onUpdate(newGuion, true);
      setFormatProposal(null);
      setSlideProposal(null);
      setSelectedFormatId("none");

      onHistoryUpdate([...history,
        { role: "user", content: userMessage },
        { role: "assistant", content: "✅ Listo! Actualicé el guión y abrí Preview con la nueva versión." }
      ]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Error desconocido";
      onHistoryUpdate([...history,
        { role: "user", content: userMessage },
        { role: "assistant", content: `❌ ${errorMsg}` }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if (!message.trim() || isLoading) return;

    const userMessage = message.trim();
    const inferredFormatId = inferFormatFromText(userMessage);
    const hasSpecificFormatIntent = inferredFormatId !== "none";
    const styleIntent = hasStyleEditIntent(userMessage);
    setMessage("");

    const aiIntent = await analyzeIntentWithAI(userMessage);

    if (styleIntent || aiIntent?.accion === "editar_estilo") {
      const styledContent = buildStyleFallbackContent(guion.contenido, userMessage);
      if (styledContent) {
        const newGuion = { ...guion, contenido: styledContent };
        onUpdate(newGuion, false);
        setSlideProposal(null);
        setFormatProposal(null);
        setSelectedFormatId("none");
        const resumen = aiIntent?.resumen_entendido ? `Interpretación IA: ${aiIntent.resumen_entendido}. ` : "";
        onHistoryUpdate([...history,
          { role: "user", content: userMessage },
          { role: "assistant", content: `✅ ${resumen}Apliqué el cambio visual de fondo en preview sin alterar la estructura del contenido.` }
        ]);
        return;
      }

      onHistoryUpdate([...history,
        { role: "user", content: userMessage },
        { role: "assistant", content: "⚠️ No detecté un color de fondo válido para aplicar. Probá con 'fondo blanco', 'fondo gris', 'fondo #f3f4f6' o similar." }
      ]);
      return;
    }

    if (aiIntent && aiIntent.confianza >= 0.55) {
      if (supportsSlideProposal && aiIntent.accion === "agregar_slide") {
        const aiSlideOption =
          normalizeSlideOptionFromAI(aiIntent.propuesta?.tipo_slide) ||
          detectSlideOptionFromText(userMessage) ||
          inferSlideOptionFromText(userMessage);
        const allSlideIds = SLIDE_ADD_OPTIONS.map((opt) => opt.id);
        const optionIds = Array.from(new Set([aiSlideOption, ...allSlideIds])) as SlideAddOptionId[];
        const selectedOption = SLIDE_ADD_OPTIONS.find((opt) => opt.id === aiSlideOption);
        const resumen = aiIntent.resumen_entendido ? `Entendí: ${aiIntent.resumen_entendido}. ` : "";
        const confirm = aiIntent.pregunta_confirmacion ? ` ${aiIntent.pregunta_confirmacion}` : "";

        setSlideProposal({
          triggerMessage: userMessage,
          recommendedId: aiSlideOption,
          optionIds,
          reason: `${resumen}Te recomiendo "${selectedOption?.label || "Detalle profundo"}".${confirm}`,
        });
        setFormatProposal(null);
        onHistoryUpdate([...history,
          { role: "user", content: userMessage },
          { role: "assistant", content: `🧠 Interpretación IA: ${resumen}Para evitar reemplazos, te propongo confirmar el tipo de slide y la agrego manteniendo lo existente.` }
        ]);
        return;
      }

      if (supportsFormatProposal && aiIntent.accion === "cambiar_formato" && !styleIntent) {
        const aiFormat = normalizeFormatFromAI(aiIntent.propuesta?.formato_visual) || inferredFormatId;
        const baseOptions = getSuggestedFormatIds(userMessage);
        const optionIds = Array.from(new Set([
          aiFormat !== "none" ? aiFormat : "",
          ...baseOptions,
        ].filter(Boolean))).slice(0, 4);
        const recommendedId = optionIds[0] || "cards_grid";
        const recommended = INTERACTIVE_VISUAL_FORMATS.find((opt) => opt.id === recommendedId);
        const resumen = aiIntent.resumen_entendido ? `Entendí: ${aiIntent.resumen_entendido}. ` : "";
        const confirm = aiIntent.pregunta_confirmacion ? ` ${aiIntent.pregunta_confirmacion}` : "";

        setFormatProposal({
          triggerMessage: userMessage,
          recommendedId,
          optionIds,
          reason: `${resumen}Te propongo "${recommended?.label || "Cards en grilla"}" para el rediseño.${confirm}`,
        });
        setSlideProposal(null);
        onHistoryUpdate([...history,
          { role: "user", content: userMessage },
          { role: "assistant", content: `🧠 Interpretación IA: ${resumen}Te muestro opciones de formato para que confirmes antes de aplicar.` }
        ]);
        return;
      }
    }

    if (supportsSlideProposal && hasAddSlideIntent(userMessage)) {
      const explicitSlideOption = detectSlideOptionFromText(userMessage);
      if (explicitSlideOption) {
        const selected = SLIDE_ADD_OPTIONS.find((opt) => opt.id === explicitSlideOption);
        const updatedContent = buildAddedSlideContent(guion.contenido, explicitSlideOption, userMessage);
        const currentSerialized = JSON.stringify(guion.contenido);
        const updatedSerialized = JSON.stringify(updatedContent);

        if (currentSerialized === updatedSerialized) {
          onHistoryUpdate([...history,
            { role: "user", content: userMessage },
            { role: "assistant", content: "⚠️ No pude agregar la nueva slide sin tocar el contenido existente. Probá seleccionando una opción manualmente." }
          ]);
          return;
        }

        const newGuion = { ...guion, contenido: updatedContent };
        onUpdate(newGuion, false);
        setSlideProposal(null);
        setFormatProposal(null);
        setSelectedFormatId("none");
        onHistoryUpdate([...history,
          { role: "user", content: userMessage },
          { role: "assistant", content: `✅ Nueva slide agregada sin reemplazar las anteriores: "${selected?.label || explicitSlideOption}".` }
        ]);
        return;
      }

      const proposal = buildSlideProposal(userMessage);
      const recommended = SLIDE_ADD_OPTIONS.find((opt) => opt.id === proposal.recommendedId);
      setSlideProposal(proposal);
      setFormatProposal(null);
      onHistoryUpdate([...history,
        { role: "user", content: userMessage },
        { role: "assistant", content: `🧠 Propuesta IA: ${proposal.reason} Recomendado: "${recommended?.label || "Tipo sugerido"}". Elegí una opción y te la aplico en preview.` }
      ]);
      return;
    }

    // If detected redesign intent but no specific format, AI proposes one first.
    if (supportsFormatProposal && hasGenericFormatIntent(userMessage) && !hasSpecificFormatIntent) {
      const proposal = buildFormatProposal(userMessage);
      setFormatProposal(proposal);
      setSlideProposal(null);

      const recommended = INTERACTIVE_VISUAL_FORMATS.find((opt) => opt.id === proposal.recommendedId);
      onHistoryUpdate([...history,
        { role: "user", content: userMessage },
        { role: "assistant", content: `🧠 Propuesta IA: ${proposal.reason} Recomendado: "${recommended?.label || "Formato sugerido"}". Si querés, lo aplico con un clic.` }
      ]);
      return;
    }

    await runIteration(userMessage);
  };

  const applyProposedFormat = async (formatId: string) => {
    if (!formatProposal || isLoading) return;
    setSelectedFormatId(formatId);
    const selected = INTERACTIVE_VISUAL_FORMATS.find((opt) => opt.id === formatId);
    setSlideProposal(null);

    if (isComponentContent(guion.contenido)) {
      const converted = buildVisualFallbackContent(guion.contenido, formatId);
      const newGuion = { ...guion, contenido: converted };
      onUpdate(newGuion, false);
      setFormatProposal(null);
      setSelectedFormatId("none");
      onHistoryUpdate([...history,
        { role: "user", content: formatProposal.triggerMessage },
        { role: "assistant", content: `✅ Propuesta aplicada: convertí el recurso a "${selected?.label || formatId}" en preview.` }
      ]);
      return;
    }

    const applyMessage = `${formatProposal.triggerMessage}\nAplicá específicamente el formato: ${selected?.label || formatId}.`;
    await runIteration(applyMessage, formatId);
  };

  const applyProposedSlide = (slideOptionId: SlideAddOptionId) => {
    if (!slideProposal || isLoading) return;
    const selected = SLIDE_ADD_OPTIONS.find((opt) => opt.id === slideOptionId);
    const updatedContent = buildAddedSlideContent(guion.contenido, slideOptionId, slideProposal.triggerMessage);

    const currentSerialized = JSON.stringify(guion.contenido);
    const updatedSerialized = JSON.stringify(updatedContent);
    if (currentSerialized === updatedSerialized) {
      onHistoryUpdate([...history,
        { role: "user", content: slideProposal.triggerMessage },
        { role: "assistant", content: "⚠️ No pude agregar la nueva slide de forma automática. Probá con otra opción." }
      ]);
      return;
    }

    const newGuion = { ...guion, contenido: updatedContent };
    onUpdate(newGuion, false);
    setSlideProposal(null);
    setFormatProposal(null);
    setSelectedFormatId("none");
    onHistoryUpdate([...history,
      { role: "user", content: slideProposal.triggerMessage },
      { role: "assistant", content: `✅ Nueva slide agregada en preview: "${selected?.label || slideOptionId}". Si querés, la iteramos más.` }
    ]);
  };

  return (
    <div className="space-y-4">
      {supportsSlideProposal && slideProposal && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-3">
          <p className="text-sm font-semibold text-emerald-900">Propuesta IA para nueva slide</p>
          <p className="text-sm text-emerald-900">{slideProposal.reason}</p>
          <div className="flex flex-wrap gap-2">
            {slideProposal.optionIds
              .map((id) => SLIDE_ADD_OPTIONS.find((opt) => opt.id === id))
              .filter((opt): opt is SlideAddOption => Boolean(opt))
              .map((opt) => {
                const isRecommended = opt.id === slideProposal.recommendedId;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => applyProposedSlide(opt.id)}
                    className={`rounded-md px-2 py-1 text-xs border transition-colors ${
                      isRecommended
                        ? "bg-emerald-700 text-white border-emerald-800"
                        : "bg-white text-emerald-900 border-emerald-300 hover:bg-emerald-100"
                    }`}
                    title={opt.hint}
                  >
                    {isRecommended ? `Agregar recomendado: ${opt.label}` : `Agregar: ${opt.label}`}
                  </button>
                );
              })}
          </div>
          <button
            type="button"
            onClick={() => setSlideProposal(null)}
            className="text-xs text-emerald-700 underline underline-offset-2"
          >
            Cerrar propuesta
          </button>
        </div>
      )}

      {supportsFormatProposal && formatProposal && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-3">
          <p className="text-sm font-semibold text-blue-900">Propuesta de formato IA</p>
          <p className="text-sm text-blue-900">{formatProposal.reason}</p>
          <div className="flex flex-wrap gap-2">
            {formatProposal.optionIds
              .map((id) => INTERACTIVE_VISUAL_FORMATS.find((opt) => opt.id === id))
              .filter((opt): opt is VisualFormatOption => Boolean(opt))
              .map((opt) => {
                const isRecommended = opt.id === formatProposal.recommendedId;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => applyProposedFormat(opt.id)}
                    className={`rounded-md px-2 py-1 text-xs border transition-colors ${
                      isRecommended
                        ? "bg-blue-700 text-white border-blue-800"
                        : "bg-white text-blue-900 border-blue-300 hover:bg-blue-100"
                    }`}
                  >
                    {isRecommended ? `Aplicar recomendado: ${opt.label}` : `Aplicar: ${opt.label}`}
                  </button>
                );
              })}
          </div>
          <button
            type="button"
            onClick={() => setFormatProposal(null)}
            className="text-xs text-blue-700 underline underline-offset-2"
          >
            Cerrar propuesta
          </button>
        </div>
      )}

      {/* Chat history */}
      <div className="border rounded-lg p-4 h-64 overflow-auto bg-gray-50 space-y-3">
        {history.length === 0 && (
          <div className="text-center text-gray-400 py-6">
            <p className="mb-3 font-medium">💬 Pedile cambios a la IA</p>
            <div className="space-y-1 text-sm">
              <p>&quot;Cambiá el título a: SOY DE DAVIVIENDA&quot;</p>
              <p>&quot;Agregá más tarjetas con ejemplos&quot;</p>
              <p>&quot;Quiero agregar una nueva slide&quot;</p>
              <p>&quot;Ponele un fondo de tecnología&quot;</p>
              <p>&quot;Hacé el texto más corto&quot;</p>
            </div>
          </div>
        )}
        {history.map((msg, i) => (
          <div key={i} className={`p-3 rounded-lg ${
            msg.role === "user"
              ? "bg-red-100 text-red-900 ml-8"
              : "bg-white border mr-8"
          }`}>
            <p className="text-sm">{msg.content}</p>
          </div>
        ))}
        {isLoading && (
          <div className="flex items-center gap-2 text-gray-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
            <span className="text-sm">Procesando cambios...</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Escribe qué cambios quieres hacer..."
          className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          disabled={isLoading}
        />
        <Button onClick={handleSend} disabled={isLoading || !message.trim()}>
          Enviar
        </Button>
      </div>
    </div>
  );
}
