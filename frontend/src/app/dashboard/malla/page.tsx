"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  obtenerSolicitud,
  crearMalla,
  obtenerMalla,
  iterarMalla,
  guardarMalla,
  actualizarSolicitud,
  listarSolicitudes,
  listarTemplates,
  sugerirTemplate,
  Solicitud,
  MallaItem,
  MallaTemplate,
  SolicitudListItem,
  TemplateSugerencia,
  COURSE_TYPE_CONFIG,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ProcessStepper } from "@/components/process-stepper";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const TIPO_RECURSO_ICONS: Record<string, string> = {
  "Video avatar": "🎬",
  "Video": "📹",
  "Manual": "📖",
  "Interactivo": "🖱️",
  "Infografía": "📊",
  "Comparador": "⚖️",
  "Flashcards": "🃏",
  "Caso práctico": "💼",
  "Quiz": "❓",
  "Video externo": "▶️",
};

const ETAPA_COLORS: Record<string, string> = {
  "Introducción": "bg-blue-100 text-blue-800",
  "Desarrollo": "bg-purple-100 text-purple-800",
  "Cierre": "bg-green-100 text-green-800",
};

const ETAPAS = ["Introducción", "Desarrollo", "Cierre"];
const TIPOS = Object.keys(TIPO_RECURSO_ICONS);

export default function MallaPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const solicitudId = searchParams.get("solicitud");

  const [solicitud, setSolicitud] = useState<Solicitud | null>(null);
  const [mallaItems, setMallaItems] = useState<MallaItem[]>([]);
  const [mallaId, setMallaId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  // Selección de template: la IA sugiere, el humano valida (o cambia) y recién
  // ahí se genera la malla.
  const [sugiriendo, setSugiriendo] = useState(false);
  const [sugerencia, setSugerencia] = useState<TemplateSugerencia | null>(null);
  const [templates, setTemplates] = useState<MallaTemplate[]>([]);
  const [templateElegido, setTemplateElegido] = useState<string>("");
  // Gate del Perfil de Salida: la malla se diseña sobre el perfil aprobado por
  // el área. "sinPerfil" es el override explícito (no recomendado).
  const [sinPerfil, setSinPerfil] = useState(false);
  const [iterating, setIterating] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  // Learning decide si la IA puede incluir cursos externos (YouTube/oficiales)
  // para herramientas técnicas de terceros (Slack, HubSpot, etc.).
  const [permitirExternos, setPermitirExternos] = useState(false);

  // For showing in-progress work
  const [enProcesoList, setEnProcesoList] = useState<SolicitudListItem[]>([]);

  useEffect(() => {
    if (solicitudId) {
      loadSolicitud();
    } else {
      loadEnProceso();
    }
  }, [solicitudId]);

  const loadEnProceso = async () => {
    setLoading(true);
    try {
      // Incluye también trabajos ya completados/aprobados (antes solo
      // "en_proceso" y los cursos terminados desaparecían del landing).
      const result = await listarSolicitudes({});
      setEnProcesoList(
        result.solicitudes.filter(
          (s) => s.status === "en_proceso" || s.status === "completado" || s.status === "aprobado"
        )
      );
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadSolicitud = async () => {
    if (!solicitudId) return;
    setLoading(true);
    try {
      const data = await obtenerSolicitud(solicitudId);
      setSolicitud(data);

      // If there's a malla_id, load the malla
      if (data.malla_id) {
        setMallaId(data.malla_id);
        const malla = await obtenerMalla(data.malla_id);
        setMallaItems(malla.malla);
      }
    } catch (err) {
      setError("Error al cargar la solicitud");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Paso 1: la IA lee la solicitud y sugiere qué template usar.
  const handleSuggestTemplate = async () => {
    if (!solicitud) return;
    setSugiriendo(true);
    setError(null);
    try {
      const [sug, tpls] = await Promise.all([
        sugerirTemplate(solicitud.curso),
        listarTemplates(),
      ]);
      setTemplates(tpls.templates);
      setSugerencia(sug);
      setTemplateElegido(sug.template_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error sugiriendo template");
    } finally {
      setSugiriendo(false);
    }
  };

  // Paso 2 (tras validación humana del template): generar la malla.
  const handleGenerateMalla = async () => {
    if (!solicitud) return;
    // Guard contra doble generación: si ya hay malla, no crear otra
    // (refuerza el disabled={generating} del botón).
    if (mallaId) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await crearMalla({
        solicitud_id: solicitud.id,
        curso: solicitud.curso,
        template_id: templateElegido || undefined,
        perfil_salida:
          solicitud.perfil_salida?.status === "aprobado"
            ? solicitud.perfil_salida.contenido
            : undefined,
        permitir_externos: permitirExternos,
        cursos_externos: solicitud.intake?.cursos_externos || [],
      });
      setMallaId(result.id);
      setMallaItems(result.malla);

      // Update solicitud with malla_id
      await actualizarSolicitud(solicitud.id, { malla_id: result.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar la malla");
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  const handleIterate = async () => {
    if (!mallaId || !feedback.trim()) return;
    setIterating(true);
    setError(null);
    try {
      const result = await iterarMalla(mallaId, feedback);
      setMallaItems(result.malla);
      setFeedback("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iterar la malla");
      console.error(err);
    } finally {
      setIterating(false);
    }
  };

  // Edición manual
  const updateItem = (index: number, field: keyof MallaItem, value: string | number) => {
    setMallaItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
  };
  const addRow = () => {
    setMallaItems((prev) => [
      ...prev,
      // id = max + 1 (no length + 1): tras borrar filas, length + 1 puede
      // colisionar con un id existente.
      { id: Math.max(0, ...prev.map((i) => i.id)) + 1, etapa: "Desarrollo", bloque: "", tipo_recurso: "Infografía", recurso: "", descripcion: "", duracion_min: 2 } as MallaItem,
    ]);
  };
  const deleteRow = (index: number) => setMallaItems((prev) => prev.filter((_, i) => i !== index));
  const moveRow = (index: number, dir: -1 | 1) => {
    setMallaItems((prev) => {
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[index], copy[j]] = [copy[j], copy[index]];
      return copy;
    });
  };
  const saveMalla = async () => {
    if (!mallaId) return;
    setSaving(true);
    setError(null);
    try {
      const result = await guardarMalla(mallaId, mallaItems);
      setMallaItems(result.malla);
      setEditMode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar la malla");
    } finally {
      setSaving(false);
    }
  };
  const cancelEdit = async () => {
    setEditMode(false);
    if (mallaId) {
      const malla = await obtenerMalla(mallaId);
      setMallaItems(malla.malla);
    }
  };

  const totalDuration = mallaItems.reduce((sum, item) => sum + item.duracion_min, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
      </div>
    );
  }

  // No solicitud selected - show list of in-progress work
  if (!solicitudId) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Malla Curricular</h1>
          <p className="text-gray-500">Diseña la estructura del curso</p>
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
                  onClick={() => router.push(`/dashboard/malla?solicitud=${sol.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-gray-900">{sol.curso_nombre}</h3>
                      {sol.malla_id ? (
                        <Badge className="bg-green-100 text-green-700">Malla lista</Badge>
                      ) : (
                        <Badge className="bg-yellow-100 text-yellow-700">Sin malla</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mb-3">{sol.area}</p>
                    <Button size="sm" className="w-full">
                      {sol.malla_id ? "Continuar editando" : "Crear malla"}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-gray-500 mb-4">
                No hay solicitudes en producción
              </p>
              <Button onClick={() => router.push("/dashboard")}>
                Ir a Solicitudes
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="p-6">
      <ProcessStepper current="malla" solicitudId={solicitudId} />
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/malla")}>
            <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Trabajos
          </Button>
          <span className="text-gray-400">/</span>
          <span className="text-gray-600 truncate">{solicitud?.curso.nombre}</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 truncate">
              {solicitud?.curso.nombre || "Malla Curricular"}
            </h1>
            <p className="text-sm text-gray-500">
              Malla Curricular
              {mallaItems.length > 0 && ` · ${mallaItems.length} recursos · ${totalDuration} min`}
            </p>
          </div>
          {mallaItems.length > 0 && !editMode && (
            <Button
              size="lg"
              onClick={() => router.push(`/dashboard/diseno?malla=${mallaId}`)}
              className="shrink-0 bg-red-600 hover:bg-red-700 shadow-sm"
            >
              Continuar a Diseño →
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 p-4 text-red-700">{error}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {mallaItems.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Generar Malla</CardTitle>
                <CardDescription>
                  La IA generará una malla curricular basada en los datos del curso
                </CardDescription>
              </CardHeader>
              <CardContent>
                {solicitud && (
                  <div className="mb-6 space-y-3 text-sm">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-gray-500">Audiencia:</span>{" "}
                        <span className="font-medium">{solicitud.curso.audiencia}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Nivel:</span>{" "}
                        <span className="font-medium">{solicitud.curso.nivel}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Tipo de curso:</span>{" "}
                        <span className="font-medium">
                          {solicitud.curso.course_type
                            ? COURSE_TYPE_CONFIG[solicitud.curso.course_type]?.label || solicitud.curso.course_type
                            : "Compliance crítico"}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Duración:</span>{" "}
                        <span className="font-medium">{solicitud.curso.duracion_min} min</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Evaluación:</span>{" "}
                        <span className="font-medium">{solicitud.curso.requiere_eval ? "Sí" : "No"}</span>
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500">Objetivo:</span>
                      <p className="mt-1 text-gray-700">{solicitud.curso.objetivo}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Temas:</span>
                      <p className="mt-1 whitespace-pre-wrap text-gray-700">{solicitud.curso.temas}</p>
                    </div>
                  </div>
                )}
                {/* Gate: la malla se diseña sobre el Perfil de Salida aprobado */}
                {solicitud?.perfil_salida?.status !== "aprobado" && !sinPerfil ? (
                  <div className="space-y-3 rounded-lg border-2 border-yellow-300 bg-yellow-50 p-4">
                    <p className="font-medium text-yellow-900">
                      🎯 Falta el Perfil de Salida validado
                    </p>
                    <p className="text-sm text-yellow-800">
                      {solicitud?.perfil_salida?.status === "en_validacion"
                        ? "El perfil está esperando la validación del área solicitante."
                        : solicitud?.perfil_salida?.status === "con_cambios"
                        ? "El área pidió cambios en el perfil — ajustalo y reenvialo."
                        : "Antes de diseñar la malla, definí el perfil de salida (competencias + temario) y validalo con el área que pidió el curso."}
                    </p>
                    <div className="flex items-center gap-3">
                      <Button
                        onClick={() => router.push(`/dashboard/perfil?solicitud=${solicitud?.id}`)}
                        className="bg-brand hover:bg-brand/90"
                      >
                        Ir al Perfil de Salida →
                      </Button>
                      <button
                        className="text-xs text-gray-400 underline"
                        onClick={() => setSinPerfil(true)}
                      >
                        generar sin perfil (no recomendado)
                      </button>
                    </div>
                  </div>
                ) : !sugerencia ? (
                  <Button
                    onClick={handleSuggestTemplate}
                    disabled={sugiriendo}
                    className="w-full bg-brand hover:bg-brand/90"
                  >
                    {sugiriendo ? (
                      <span className="flex items-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Analizando la solicitud...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Generar Malla con IA
                      </span>
                    )}
                  </Button>
                ) : (
                  /* Validación humana del template sugerido por la IA */
                  <div className="space-y-4 rounded-lg border-2 border-brand/30 bg-brand/5 p-4">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">🤖</span>
                      <div>
                        <p className="font-semibold text-gray-900">
                          La IA sugiere el template: {sugerencia.nombre}
                          <span className="ml-2 text-xs font-normal text-gray-500">
                            confianza {Math.round(sugerencia.confianza * 100)}%
                          </span>
                        </p>
                        <p className="mt-1 text-sm text-gray-600">{sugerencia.razon}</p>
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Template a usar (podés cambiarlo)
                      </label>
                      <select
                        value={templateElegido}
                        onChange={(e) => setTemplateElegido(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                      >
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.nombre}
                            {t.id === sugerencia.template_id ? " (sugerido)" : ""}
                            {t.id === sugerencia.alternativa_id ? " (alternativa)" : ""}
                          </option>
                        ))}
                      </select>
                      {templates.find((t) => t.id === templateElegido) && (
                        <p className="mt-1 text-xs text-gray-500">
                          {templates.find((t) => t.id === templateElegido)?.descripcion}
                        </p>
                      )}
                    </div>
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <input
                        type="checkbox"
                        checked={permitirExternos}
                        onChange={(e) => setPermitirExternos(e.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-brand"
                      />
                      <span className="text-sm">
                        <span className="font-medium text-gray-800">
                          Permitir cursos externos (YouTube / oficiales)
                        </span>
                        <span className="mt-0.5 block text-xs text-gray-500">
                          Para herramientas técnicas de terceros (Slack, HubSpot, Excel…) la IA podrá
                          sumar recursos tipo &quot;Video externo&quot; con enlaces a videos o cursos públicos.
                          {solicitud?.intake?.cursos_externos?.length
                            ? ` El solicitante recomendó ${solicitud.intake.cursos_externos.length} curso(s).`
                            : ""}
                        </span>
                      </span>
                    </label>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleGenerateMalla}
                        disabled={generating}
                        className="flex-1 bg-brand hover:bg-brand/90"
                      >
                        {generating ? (
                          <span className="flex items-center gap-2">
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            Generando malla...
                          </span>
                        ) : (
                          "✓ Confirmar template y generar"
                        )}
                      </Button>
                      <Button variant="outline" onClick={() => setSugerencia(null)} disabled={generating}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Malla Curricular</CardTitle>
                  <CardDescription>
                    {mallaItems.length} recursos | {totalDuration} minutos totales
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {editMode ? (
                    <>
                      <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>
                        Cancelar
                      </Button>
                      <Button size="sm" onClick={saveMalla} disabled={saving} className="bg-red-600 hover:bg-red-700">
                        {saving ? "Guardando…" : "Guardar cambios"}
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
                      ✎ Editar manualmente
                    </Button>
                  )}
                </div>
              </CardHeader>
              {editMode ? (
                <CardContent className="space-y-3">
                  {mallaItems.map((item, index) => (
                    <div key={index} className="rounded-lg border bg-gray-50/60 p-3 space-y-2">
                      {/* fila superior: orden, etapa, tipo, duración, acciones */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-gray-400 w-5 text-center">{index + 1}</span>
                        <Select value={item.etapa} onValueChange={(v) => updateItem(index, "etapa", v || "")}>
                          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ETAPAS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Select value={item.tipo_recurso} onValueChange={(v) => updateItem(index, "tipo_recurso", v || "")}>
                          <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {TIPOS.map((t) => <SelectItem key={t} value={t}>{TIPO_RECURSO_ICONS[t]} {t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <div className="ml-auto flex items-center gap-1">
                          <Input
                            type="number" min={0}
                            className="h-8 w-16 text-right text-sm"
                            value={item.duracion_min}
                            onChange={(e) => updateItem(index, "duracion_min", parseInt(e.target.value) || 0)}
                          />
                          <span className="text-xs text-gray-400 mr-1">min</span>
                          <button type="button" onClick={() => moveRow(index, -1)} disabled={index === 0} className="rounded px-1.5 py-1 text-gray-500 hover:bg-gray-200 disabled:opacity-30" title="Subir">↑</button>
                          <button type="button" onClick={() => moveRow(index, 1)} disabled={index === mallaItems.length - 1} className="rounded px-1.5 py-1 text-gray-500 hover:bg-gray-200 disabled:opacity-30" title="Bajar">↓</button>
                          <button type="button" onClick={() => deleteRow(index)} className="rounded px-1.5 py-1 text-red-500 hover:bg-red-50" title="Eliminar">🗑</button>
                        </div>
                      </div>
                      {/* campos de texto a todo el ancho */}
                      <Input className="h-8 text-sm" value={item.bloque} onChange={(e) => updateItem(index, "bloque", e.target.value)} placeholder="Bloque (ej: Identificación de clientes)" />
                      <Input className="h-8 text-sm" value={item.recurso} onChange={(e) => updateItem(index, "recurso", e.target.value)} placeholder="Nombre del recurso" />
                      <Input className="h-8 text-sm" value={item.descripcion} onChange={(e) => updateItem(index, "descripcion", e.target.value)} placeholder="Descripción" />
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addRow} className="w-full border-dashed">
                    + Agregar recurso
                  </Button>
                </CardContent>
              ) : (
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Etapa</TableHead>
                        <TableHead>Bloque</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Recurso</TableHead>
                        <TableHead className="text-right">Duración</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mallaItems.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-mono text-gray-500">{index + 1}</TableCell>
                          <TableCell>
                            <Badge className={ETAPA_COLORS[item.etapa] || "bg-gray-100"}>{item.etapa}</Badge>
                          </TableCell>
                          <TableCell className="font-medium">{item.bloque}</TableCell>
                          <TableCell>
                            <span className="flex items-center gap-1">
                              <span>{TIPO_RECURSO_ICONS[item.tipo_recurso] || "📄"}</span>
                              <span className="text-sm text-gray-600">{item.tipo_recurso}</span>
                            </span>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{item.recurso}</p>
                              <p className="text-xs text-gray-500 line-clamp-1">{item.descripcion}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{item.duracion_min} min</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              )}
            </Card>
          )}

          {/* Iterate section */}
          {!editMode && mallaItems.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Iterar Malla</CardTitle>
                <CardDescription>
                  Describe los cambios que quieres hacer y la IA actualizará la malla
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="Ej: Agregar un video introductorio, reducir la duración del quiz, cambiar el orden de los bloques..."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={3}
                />
                <Button
                  onClick={handleIterate}
                  disabled={iterating || !feedback.trim()}
                  className="w-full"
                >
                  {iterating ? (
                    <span className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Actualizando...
                    </span>
                  ) : (
                    "Aplicar cambios"
                  )}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* El progreso vive en el ProcessStepper de arriba */}
          {solicitud && (
            <Card>
              <CardHeader>
                <CardTitle>Información del Curso</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <span className="text-gray-500">Nombre:</span>
                  <p className="font-medium">{solicitud.curso.nombre}</p>
                </div>
                <div>
                  <span className="text-gray-500">Solicitante:</span>
                  <p className="font-medium">{solicitud.solicitante.nombre}</p>
                  <p className="text-gray-500">{solicitud.solicitante.area}</p>
                </div>
                <div>
                  <span className="text-gray-500">Arquetipo:</span>
                  <p className="font-medium">
                    {solicitud.curso.course_type
                      ? COURSE_TYPE_CONFIG[solicitud.curso.course_type]?.label || solicitud.curso.course_type
                      : "Compliance crítico"}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Duración objetivo:</span>
                  <p className="font-medium">{solicitud.curso.duracion_min} minutos</p>
                </div>
                {mallaItems.length > 0 && (
                  <div className="pt-2 border-t">
                    <span className="text-gray-500">Duración actual:</span>
                    <p className={`font-medium ${totalDuration > solicitud.curso.duracion_min ? 'text-orange-600' : 'text-green-600'}`}>
                      {totalDuration} minutos
                      {totalDuration > solicitud.curso.duracion_min && (
                        <span className="text-xs ml-1">
                          (+{totalDuration - solicitud.curso.duracion_min} min)
                        </span>
                      )}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {mallaItems.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Resumen por Tipo</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(
                    mallaItems.reduce((acc, item) => {
                      acc[item.tipo_recurso] = (acc[item.tipo_recurso] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>)
                  ).map(([tipo, count]) => (
                    <div key={tipo} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span>{TIPO_RECURSO_ICONS[tipo] || "📄"}</span>
                        {tipo}
                      </span>
                      <Badge variant="secondary">{count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

