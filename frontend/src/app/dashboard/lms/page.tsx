"use client";

/**
 * Publicación en el LMS del cliente.
 *
 * El paquete SCORM 1.2 es el estándar que TODOS los LMS corporativos importan
 * (Territorium, Moodle, Canvas, Blackboard, SuccessFactors, TalentLMS, …). El
 * flujo: descargar el .zip (o copiar su link) → importarlo en el LMS siguiendo
 * las instrucciones de la plataforma correspondiente → marcar el curso como
 * publicado. No hay push automático: funciona con cualquier LMS sin credenciales.
 */

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  actualizarSolicitud,
  listarSolicitudes,
  obtenerMalla,
  publicarLms,
  LmsPublicarResult,
  Malla,
  SolicitudListItem,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProcessStepper } from "@/components/process-stepper";

// Instrucciones de importación SCORM por LMS. "match" liga el LMS configurado
// por la empresa para mostrarlo primero.
const LMS_GUIDES: Array<{ nombre: string; match?: RegExp; pasos: string[] }> = [
  {
    nombre: "Territorium",
    match: /territorium/i,
    pasos: [
      "Entrá como administrador → Gestión de contenido → Cursos.",
      "Crear curso → Importar contenido → SCORM.",
      "Subí el archivo SCORM.zip descargado.",
      "Asigná el curso a la audiencia (grupos/roles) y publicá.",
      "El progreso y el puntaje de los quizzes se reportan solos (SCORM 1.2).",
    ],
  },
  {
    nombre: "Moodle",
    match: /moodle/i,
    pasos: [
      "En el curso de destino: Activar edición → Añadir actividad o recurso → Paquete SCORM.",
      "Arrastrá el SCORM.zip al campo de archivo.",
      "En Calificación: método 'Calificación más alta' y nota máxima 100.",
      "Guardá y mostrá — Moodle registra intentos, progreso y puntaje.",
    ],
  },
  {
    nombre: "Canvas",
    match: /canvas/i,
    pasos: [
      "Habilitá la integración SCORM (Configuración → Navegación → SCORM).",
      "Menú SCORM → Upload → elegí el SCORM.zip.",
      "Importalo como 'Graded assignment' para que el puntaje llegue al gradebook.",
    ],
  },
  {
    nombre: "Blackboard",
    match: /blackboard/i,
    pasos: [
      "En el curso: Contenido → Build Content → Content Package (SCORM).",
      "Subí el SCORM.zip.",
      "En opciones de calificación activá 'SCORM reporting' con nota sobre 100.",
    ],
  },
  {
    nombre: "SAP SuccessFactors",
    match: /successfactors|sap/i,
    pasos: [
      "Learning Administration → Content → Import Content.",
      "Elegí SCORM 1.2 y subí el zip.",
      "Creá el Item de aprendizaje apuntando al contenido importado y asignalo.",
    ],
  },
  {
    nombre: "TalentLMS / LMS SaaS",
    match: /talent/i,
    pasos: [
      "Agregar curso → Añadir contenido → SCORM | xAPI | cmi5.",
      "Subí el SCORM.zip y guardá.",
    ],
  },
  {
    nombre: "Otro LMS (genérico)",
    pasos: [
      "Todo LMS corporativo tiene una opción 'Importar SCORM' o 'Content package' al crear un curso.",
      "Elegí SCORM 1.2 si pide versión (es la más compatible).",
      "Subí el SCORM.zip tal cual se descarga — no lo descomprimas.",
      "El paquete reporta estado (completado/aprobado) y puntaje automáticamente.",
    ],
  },
];

export default function LmsPage() {
  const { company, miEmpresa } = useCompany();
  const lms = company.lmsNombre || "tu LMS";
  const integracionLista = Boolean(miEmpresa?.lms_integration?.token_configurado);
  const searchParams = useSearchParams();
  const router = useRouter();
  const mallaId = searchParams.get("malla");
  const solicitudId = searchParams.get("solicitud");

  const [loading, setLoading] = useState(true);
  const [enProcesoList, setEnProcesoList] = useState<SolicitudListItem[]>([]);
  const [malla, setMalla] = useState<Malla | null>(null);
  const [copied, setCopied] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [guiaAbierta, setGuiaAbierta] = useState<string | null>(null);
  // Publicación directa (integración LMS configurada en la empresa)
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<LmsPublicarResult | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);

  useEffect(() => {
    if (mallaId) {
      obtenerMalla(mallaId)
        .then(setMalla)
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      loadEnProceso();
    }
  }, [mallaId]);

  // La guía del LMS de la empresa arranca abierta.
  useEffect(() => {
    const propia = LMS_GUIDES.find((g) => g.match?.test(company.lmsNombre || ""));
    setGuiaAbierta(propia?.nombre || "Otro LMS (genérico)");
  }, [company.lmsNombre]);

  const loadEnProceso = async () => {
    setLoading(true);
    try {
      const result = await listarSolicitudes({ status: "en_proceso" });
      setEnProcesoList(result.solicitudes.filter((s) => s.malla_id));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (!malla?.scorm_url) return;
    await navigator.clipboard.writeText(malla.scorm_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePush = async () => {
    if (!mallaId) return;
    setPushing(true);
    setPushError(null);
    try {
      const r = await publicarLms(mallaId);
      setPushResult(r);
    } catch (e) {
      setPushError(e instanceof Error ? e.message : "Error publicando");
    } finally {
      setPushing(false);
    }
  };

  const handlePublished = async () => {
    if (!solicitudId) return;
    setPublishing(true);
    try {
      await actualizarSolicitud(solicitudId, { status: "completado" });
      setPublished(true);
    } catch (err) {
      console.error(err);
    } finally {
      setPublishing(false);
    }
  };

  const cursoNombre = malla?.solicitud?.curso?.nombre || "Curso";
  const scormFecha = malla?.scorm_updated_at
    ? new Date(malla.scorm_updated_at).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" })
    : null;
  const scormMB = malla?.scorm_size ? (malla.scorm_size / 1024 / 1024).toFixed(1) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
      </div>
    );
  }

  // ── Listado de cursos en proceso ──
  if (!mallaId) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">LMS</h1>
          <p className="text-gray-500">Publicá los cursos en {lms}</p>
        </div>

        {enProcesoList.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {enProcesoList.map((sol) => (
              <Card
                key={sol.id}
                className="cursor-pointer transition-shadow hover:shadow-lg"
                onClick={() => router.push(`/dashboard/lms?malla=${sol.malla_id}&solicitud=${sol.id}`)}
              >
                <CardContent className="p-4">
                  <div className="mb-2 flex items-start justify-between">
                    <h3 className="font-semibold text-gray-900">{sol.curso_nombre}</h3>
                    <Badge className="bg-yellow-100 text-yellow-700">Sin publicar</Badge>
                  </div>
                  <p className="mb-3 text-sm text-gray-500">{sol.area}</p>
                  <Button size="sm" className="w-full">Publicar en LMS</Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="mb-4 text-gray-500">No hay cursos en proceso con malla generada</p>
              <Button onClick={() => router.push("/dashboard/scorm")}>Ir a SCORM</Button>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // ── Detalle: descargar paquete + instrucciones + marcar publicado ──
  return (
    <div className="p-6">
      <ProcessStepper current="lms" mallaId={mallaId} solicitudId={solicitudId} />
      <div className="mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/lms")}>
          ‹ Cursos
        </Button>
        <h1 className="mt-2 truncate text-2xl font-bold text-gray-900">{cursoNombre}</h1>
        <p className="text-sm text-gray-500">Publicar en {lms} · {company.nombre}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Paso 1: el paquete */}
        <Card>
          <CardHeader>
            <CardTitle>1 · Descargá el paquete SCORM</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {malla?.scorm_url ? (
              <>
                <div className="rounded-lg bg-gray-50 p-4 text-sm">
                  <p className="font-medium text-gray-900">SCORM.zip {scormMB ? `· ${scormMB} MB` : ""}</p>
                  <p className="text-gray-500">Formato SCORM 1.2 — compatible con cualquier LMS corporativo</p>
                  {scormFecha && <p className="mt-1 text-xs text-gray-400">Generado: {scormFecha}</p>}
                </div>
                <div className="flex gap-2">
                  <a
                    href={malla.scorm_url}
                    download
                    className="inline-flex flex-1 items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90"
                  >
                    ⬇ Descargar SCORM.zip
                  </a>
                  <Button variant="outline" onClick={copyLink}>
                    {copied ? "✓ Copiado" : "Copiar link"}
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-gray-500"
                  onClick={() => router.push(`/dashboard/scorm?malla=${mallaId}`)}
                >
                  ↻ Regenerar el paquete (si cambiaste contenido)
                </Button>

                {/* Publicación directa (si la empresa configuró su LMS) */}
                {integracionLista && !pushResult && (
                  <div className="rounded-lg border-2 border-brand/30 bg-brand/5 p-3">
                    <p className="mb-2 text-sm font-medium text-gray-900">
                      ⚡ Publicación directa en {lms}
                    </p>
                    <Button onClick={handlePush} disabled={pushing} className="w-full bg-brand hover:bg-brand/90">
                      {pushing ? "Publicando (crea el curso y sube el paquete)…" : `Publicar directo en ${lms}`}
                    </Button>
                    {pushError && <p className="mt-2 text-sm text-red-600">{pushError}</p>}
                  </div>
                )}
                {(pushResult || malla?.lms_publicado) && (
                  <div className="space-y-2 rounded-lg bg-green-50 p-4 text-sm text-green-800">
                    <p className="font-medium">
                      ✓ {pushResult?.curso_creado === false ? "Curso actualizado" : "Curso creado"} en {lms}
                      {pushResult?.archivo_subido ? ` · paquete "${pushResult.archivo_subido}" subido` : ""}
                    </p>
                    <a
                      href={pushResult?.curso_url || malla?.lms_publicado?.curso_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block font-medium underline"
                    >
                      Abrir el curso en {lms} ↗
                    </a>
                    {pushResult?.paso_manual && (
                      <p className="text-xs text-green-700">Último paso (1 min): {pushResult.paso_manual}</p>
                    )}
                  </div>
                )}
                {!integracionLista && (
                  <p className="text-xs text-gray-400">
                    💡 Configurá la integración con tu LMS en{" "}
                    <button className="underline" onClick={() => router.push("/dashboard/configuracion")}>
                      Configuración
                    </button>{" "}
                    para publicar con un click.
                  </p>
                )}
              </>
            ) : (
              <div className="space-y-3 rounded-lg bg-yellow-50 p-4 text-sm text-yellow-800">
                <p>Este curso todavía no tiene un paquete SCORM generado.</p>
                <Button onClick={() => router.push(`/dashboard/scorm?malla=${mallaId}`)} className="bg-brand hover:bg-brand/90">
                  Ir a empaquetar en SCORM
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Paso 3: confirmar */}
        <Card>
          <CardHeader>
            <CardTitle>3 · Confirmá la publicación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">
              Cuando el curso ya esté importado y visible en {lms}, marcalo como
              publicado: la solicitud pasa a <b>Completado</b> y se le avisa por
              email al solicitante.
            </p>
            {published ? (
              <div className="rounded-lg bg-green-50 p-4 text-green-700">
                ✓ Curso marcado como publicado
              </div>
            ) : (
              <Button
                onClick={handlePublished}
                disabled={publishing || !solicitudId}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                {publishing ? "Guardando…" : "✓ Ya está publicado en el LMS"}
              </Button>
            )}
            {!solicitudId && !published && (
              <p className="text-xs text-gray-400">
                (Entrá desde la lista de cursos para poder marcarlo)
              </p>
            )}
          </CardContent>
        </Card>

        {/* Paso 2: instrucciones por LMS */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>2 · Importalo en tu LMS</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {LMS_GUIDES.map((g) => {
              const esPropio = g.match?.test(company.lmsNombre || "");
              const abierta = guiaAbierta === g.nombre;
              return (
                <div key={g.nombre} className="rounded-lg border">
                  <button
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium"
                    onClick={() => setGuiaAbierta(abierta ? null : g.nombre)}
                  >
                    <span>
                      {g.nombre}
                      {esPropio && <Badge className="ml-2 bg-brand/10 text-brand text-xs">tu LMS</Badge>}
                    </span>
                    <span className="text-gray-400">{abierta ? "−" : "+"}</span>
                  </button>
                  {abierta && (
                    <ol className="space-y-1 border-t px-6 py-3 text-sm text-gray-600">
                      {g.pasos.map((p, i) => (
                        <li key={i} className="list-decimal">{p}</li>
                      ))}
                    </ol>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
