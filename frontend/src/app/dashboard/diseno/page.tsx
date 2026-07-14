"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { obtenerMalla, generarGuiones, listarSolicitudes, MallaItem, Guion, SolicitudListItem } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

export default function DisenoPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const mallaId = searchParams.get("malla");

  const [mallaItems, setMallaItems] = useState<MallaItem[]>([]);
  const [guiones, setGuiones] = useState<Guion[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<number | null>(null);
  const [enProcesoList, setEnProcesoList] = useState<SolicitudListItem[]>([]);
  const [cursoNombre, setCursoNombre] = useState("");

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
      // Filter only those with malla_id
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
      if (malla.solicitud?.curso?.nombre) setCursoNombre(malla.solicitud.curso.nombre);
      // Check if guiones already exist in the malla data
      if (malla.guiones) {
        setGuiones(malla.guiones);
      }
    } catch (err) {
      setError("Error al cargar la malla");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateGuiones = async () => {
    if (!mallaId) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await generarGuiones(mallaId);
      setGuiones(result.guiones);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar guiones");
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  const getGuionForItem = (itemId: number) => {
    return guiones.find(g => g.id === itemId);
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
          <h1 className="text-2xl font-bold text-gray-900">Diseño</h1>
          <p className="text-gray-500">Diseña las slides y recursos visuales</p>
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
                  onClick={() => router.push(`/dashboard/diseno?malla=${sol.malla_id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-gray-900">{sol.curso_nombre}</h3>
                      <Badge className="bg-yellow-100 text-yellow-700">Sin guiones</Badge>
                    </div>
                    <p className="text-sm text-gray-500 mb-3">{sol.area}</p>
                    <Button size="sm" className="w-full">
                      Diseñar guiones
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-gray-500 mb-4">
                Primero genera una malla curricular desde una solicitud
              </p>
              <Button onClick={() => router.push("/dashboard/malla")}>
                Ir a Malla
              </Button>
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
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Volver
          </Button>
        </div>
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 truncate">{cursoNombre || "Diseño Instruccional"}</h1>
            <p className="text-sm text-gray-500">Diseño Instruccional · {mallaItems.length} recursos para diseñar</p>
          </div>
          {guiones.length === 0 && (
            <Button
              onClick={handleGenerateGuiones}
              disabled={generating}
              className="bg-red-600 hover:bg-red-700"
            >
              {generating ? (
                <span className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Generando guiones...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Generar Guiones con IA
                </span>
              )}
            </Button>
          )}
          {guiones.length > 0 && (
            <Button onClick={() => router.push(`/dashboard/contenido?malla=${mallaId}`)}>
              Continuar a Contenido
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 p-4 text-red-700">{error}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Resource list */}
        <div className="space-y-3">
          <h2 className="font-semibold text-gray-700">Recursos</h2>
          {mallaItems.map((item) => {
            const guion = getGuionForItem(item.id);
            const isSelected = selectedItem === item.id;
            return (
              <Card
                key={item.id}
                className={`cursor-pointer transition-all ${
                  isSelected ? "ring-2 ring-red-500" : "hover:shadow-md"
                }`}
                onClick={() => setSelectedItem(item.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{TIPO_RECURSO_ICONS[item.tipo_recurso] || "📄"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900 truncate">{item.recurso}</p>
                        {guion && (
                          <Badge className="bg-green-100 text-green-700 shrink-0">
                            Listo
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">{item.tipo_recurso}</p>
                      <p className="text-xs text-gray-400">{item.duracion_min} min</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Content preview */}
        <div className="lg:col-span-2">
          {selectedItem ? (
            <ResourceDetail
              item={mallaItems.find(i => i.id === selectedItem)!}
              guion={getGuionForItem(selectedItem)}
            />
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-gray-500">
                <svg className="mx-auto h-12 w-12 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
                <p>Selecciona un recurso para ver su detalle</p>
                {guiones.length === 0 && (
                  <p className="text-sm mt-2">
                    Genera los guiones primero para ver el contenido
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function ResourceDetail({ item, guion }: { item: MallaItem; guion?: Guion }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="text-3xl">{TIPO_RECURSO_ICONS[item.tipo_recurso] || "📄"}</span>
          <div>
            <CardTitle>{item.recurso}</CardTitle>
            <CardDescription>{item.bloque} | {item.etapa}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="info">
          <TabsList>
            <TabsTrigger value="info">Información</TabsTrigger>
            <TabsTrigger value="guion" disabled={!guion}>Guion</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium text-gray-500">Objetivo</label>
              <p className="text-gray-900">{item.objetivo}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Descripción</label>
              <p className="text-gray-900">{item.descripcion}</p>
            </div>
            <div className="flex gap-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Tipo</label>
                <p className="text-gray-900">{item.tipo_recurso}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Duración</label>
                <p className="text-gray-900">{item.duracion_min} minutos</p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="guion" className="mt-4">
            {guion ? (
              <GuionContent guion={guion} tipo={item.tipo_recurso} />
            ) : (
              <p className="text-gray-500 py-8 text-center">
                Genera los guiones para ver el contenido
              </p>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function GuionContent({ guion, tipo }: { guion: Guion; tipo: string }) {
  const { contenido } = guion;

  if (tipo === "Video avatar" || tipo === "Video") {
    const voiceover = contenido.voiceover || contenido.texto;
    const puntosClave = contenido.puntos_clave || [];
    const slides = contenido.slides || [];
    return (
      <div className="space-y-4">
        {puntosClave.length > 0 && (
          <div>
            <label className="text-sm font-medium text-gray-500">Puntos clave</label>
            <ul className="mt-2 space-y-1">
              {puntosClave.map((punto: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-gray-700">
                  <span className="text-red-500 mt-1">•</span>
                  {punto}
                </li>
              ))}
            </ul>
          </div>
        )}
        {slides.length > 0 && (
          <div>
            <label className="text-sm font-medium text-gray-500">Slides</label>
            <div className="mt-2 space-y-3">
              {slides.map((slide: { titulo: string; bullets?: string[]; puntos?: string[] }, i: number) => (
                <div key={i} className="p-3 bg-gray-50 rounded-lg">
                  <p className="font-medium text-gray-900 mb-1">{slide.titulo}</p>
                  <ul className="list-disc list-inside text-sm">
                    {(slide.bullets || slide.puntos || []).map((punto: string, j: number) => (
                      <li key={j} className="text-gray-600">{punto}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
        <div>
          <label className="text-sm font-medium text-gray-500">Guion de voz</label>
          <div className="mt-2 p-4 bg-gray-50 rounded-lg whitespace-pre-wrap text-gray-700">
            {voiceover || "Sin texto"}
          </div>
        </div>
      </div>
    );
  }

  if (tipo === "Quiz") {
    return (
      <div className="space-y-4">
        <label className="text-sm font-medium text-gray-500">Preguntas</label>
        {contenido.preguntas?.map((q, i) => (
          <div key={i} className="p-4 bg-gray-50 rounded-lg">
            <p className="font-medium mb-2">{i + 1}. {q.pregunta}</p>
            <ul className="space-y-1">
              {q.opciones.map((opt, j) => (
                <li
                  key={j}
                  className={`pl-4 ${j === q.correcta ? "text-green-600 font-medium" : "text-gray-600"}`}
                >
                  {String.fromCharCode(65 + j)}) {opt}
                  {j === q.correcta && " ✓"}
                </li>
              ))}
            </ul>
          </div>
        )) || <p className="text-gray-500">Sin preguntas</p>}
      </div>
    );
  }

  if (tipo === "Flashcards") {
    return (
      <div className="space-y-4">
        <label className="text-sm font-medium text-gray-500">Tarjetas</label>
        <div className="grid gap-3 sm:grid-cols-2">
          {contenido.items?.map((card, i) => (
            <div key={i} className="p-4 bg-gray-50 rounded-lg">
              <p className="font-medium text-gray-900">{card.frente}</p>
              <hr className="my-2" />
              <p className="text-gray-600 text-sm">{card.reverso}</p>
            </div>
          )) || <p className="text-gray-500">Sin tarjetas</p>}
        </div>
      </div>
    );
  }

  if (tipo === "Caso práctico") {
    const escenario = (contenido as { escenario?: string }).escenario;
    const preguntas = (contenido as { preguntas?: Array<{ pregunta: string; opciones: string[]; correcta: number; feedback?: string }> }).preguntas || [];
    return (
      <div className="space-y-4">
        {escenario && (
          <div>
            <label className="text-sm font-medium text-gray-500">Escenario</label>
            <div className="mt-2 p-4 bg-blue-50 rounded-lg text-gray-700 border-l-4 border-blue-500">
              {escenario}
            </div>
          </div>
        )}
        <div>
          <label className="text-sm font-medium text-gray-500">Preguntas del caso</label>
          <div className="mt-2 space-y-4">
            {preguntas.map((q, i) => (
              <div key={i} className="p-4 bg-gray-50 rounded-lg">
                <p className="font-medium mb-3">{i + 1}. {q.pregunta}</p>
                <ul className="space-y-2 mb-3">
                  {q.opciones.map((opt, j) => {
                    // Remove duplicate letter prefix if present (e.g., "A) A) texto" -> "A) texto")
                    const cleanOpt = opt.replace(/^[A-Z]\)\s*[A-Z]\)\s*/, (match) => match.slice(0, 3));
                    return (
                      <li
                        key={j}
                        className={`pl-4 py-1 rounded ${j === q.correcta ? "bg-green-100 text-green-700 font-medium" : "text-gray-600"}`}
                      >
                        {cleanOpt}
                        {j === q.correcta && " ✓"}
                      </li>
                    );
                  })}
                </ul>
                {q.feedback && (
                  <p className="text-sm text-gray-500 italic border-t pt-2">
                    💡 {q.feedback}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (tipo === "Infografía") {
    const c = contenido as { titulo?: string; dato_destacado?: string; secciones?: Array<{ icono: string; titulo: string; descripcion: string }> };
    return (
      <div className="space-y-4">
        {c.titulo && (
          <div>
            <label className="text-sm font-medium text-gray-500">Título</label>
            <p className="text-lg font-bold text-gray-900 mt-1">{c.titulo}</p>
          </div>
        )}
        {c.dato_destacado && (
          <div>
            <label className="text-sm font-medium text-gray-500">Dato destacado</label>
            <div className="mt-1 p-3 bg-yellow-50 border-l-4 border-yellow-400 rounded-r-lg">
              💡 {c.dato_destacado}
            </div>
          </div>
        )}
        <div>
          <label className="text-sm font-medium text-gray-500">Secciones</label>
          <div className="mt-2 space-y-3">
            {(c.secciones || []).map((sec, i) => (
              <div key={i} className="p-4 bg-gray-50 rounded-lg flex items-start gap-3">
                <span className="text-2xl">{sec.icono}</span>
                <div>
                  <p className="font-medium text-gray-900">{sec.titulo}</p>
                  <p className="text-gray-600 text-sm">{sec.descripcion}</p>
                </div>
              </div>
            ))}
            {(!c.secciones || c.secciones.length === 0) && <p className="text-gray-500">Sin secciones</p>}
          </div>
        </div>
      </div>
    );
  }

  if (tipo === "Comparador") {
    const c = contenido as { titulo?: string; columnas?: string[]; filas?: Array<{ aspecto: string; valores: string[] }> };
    return (
      <div className="space-y-4">
        {c.titulo && (
          <div>
            <label className="text-sm font-medium text-gray-500">Título</label>
            <p className="text-lg font-bold text-gray-900 mt-1">{c.titulo}</p>
          </div>
        )}
        <div>
          <label className="text-sm font-medium text-gray-500">Tabla comparativa</label>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-red-600 text-white">
                  <th className="p-2 text-left border border-red-700">Aspecto</th>
                  {(c.columnas || []).map((col, i) => (
                    <th key={i} className="p-2 text-left border border-red-700">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(c.filas || []).map((fila, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="p-2 border font-medium">{fila.aspecto}</td>
                    {fila.valores.map((val, j) => (
                      <td key={j} className="p-2 border text-gray-600">{val}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {(!c.filas || c.filas.length === 0) && <p className="text-gray-500 mt-2">Sin datos</p>}
          </div>
        </div>
      </div>
    );
  }

  if (tipo === "Interactivo") {
    const c = contenido as { titulo?: string; instruccion?: string; elementos?: Array<{ etiqueta: string; contenido_oculto: string }> };
    return (
      <div className="space-y-4">
        {c.titulo && (
          <div>
            <label className="text-sm font-medium text-gray-500">Título</label>
            <p className="text-lg font-bold text-gray-900 mt-1">{c.titulo}</p>
          </div>
        )}
        {c.instruccion && (
          <div>
            <label className="text-sm font-medium text-gray-500">Instrucción</label>
            <p className="text-gray-600 mt-1 italic">{c.instruccion}</p>
          </div>
        )}
        <div>
          <label className="text-sm font-medium text-gray-500">Elementos interactivos</label>
          <div className="mt-2 space-y-3">
            {(c.elementos || []).map((elem, i) => (
              <div key={i} className="p-4 bg-gray-50 rounded-lg">
                <p className="font-medium text-gray-900 mb-2">🔘 {elem.etiqueta}</p>
                <p className="text-gray-600 text-sm pl-6">↳ {elem.contenido_oculto}</p>
              </div>
            ))}
            {(!c.elementos || c.elementos.length === 0) && <p className="text-gray-500">Sin elementos</p>}
          </div>
        </div>
      </div>
    );
  }

  // Default: show raw JSON
  return (
    <pre className="p-4 bg-gray-50 rounded-lg overflow-auto text-sm">
      {JSON.stringify(contenido, null, 2)}
    </pre>
  );
}

function SlidePreview({ guion, tipo }: { guion: Guion; tipo: string }) {
  const { contenido } = guion;

  // Simple slide preview mockup
  return (
    <div className="aspect-video bg-gradient-to-br from-gray-900 to-gray-800 rounded-lg p-8 text-white">
      <div className="h-full flex flex-col">
        {/* Header bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-red-600 rounded flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="currentColor">
                <path d="M12 3L4 9v12h16V9l-8-6z" />
              </svg>
            </div>
            <span className="text-sm text-gray-400">E-Learning</span>
          </div>
          <Badge className="bg-red-600">{tipo}</Badge>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col justify-center">
          <h2 className="text-2xl font-bold mb-4">{guion.bloque}</h2>
          {tipo === "Video avatar" && (contenido.voiceover || contenido.texto) && (
            <p className="text-gray-300 line-clamp-4">{(contenido.voiceover ?? contenido.texto ?? "").slice(0, 200)}...</p>
          )}
          {contenido.slides?.[0] && (
            <>
              <p className="text-xl text-gray-200 mb-3">{contenido.slides[0].titulo}</p>
              {(contenido.slides[0].bullets || contenido.slides[0].puntos) && (
                <ul className="space-y-2">
                  {(contenido.slides[0].bullets ?? contenido.slides[0].puntos ?? []).slice(0, 3).map((p: string, i: number) => (
                    <li key={i} className="flex items-center gap-2 text-gray-300">
                      <span className="w-2 h-2 bg-red-500 rounded-full" />
                      {p}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {tipo === "Quiz" && contenido.preguntas?.[0] && (
            <div>
              <p className="text-xl mb-4">{contenido.preguntas[0].pregunta}</p>
              {contenido.preguntas[0].opciones && (
                <div className="grid grid-cols-2 gap-3">
                  {contenido.preguntas[0].opciones.map((opt, i) => (
                    <div key={i} className="bg-white/10 rounded-lg p-3 text-sm">
                      {String.fromCharCode(65 + i)}) {opt}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Preview</span>
          <span>{guion.id} / {tipo}</span>
        </div>
      </div>
    </div>
  );
}
