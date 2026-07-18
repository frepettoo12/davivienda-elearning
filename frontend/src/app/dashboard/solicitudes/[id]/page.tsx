"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  obtenerSolicitud,
  actualizarSolicitud,
  agregarComentario,
  listarUsuarios,
  Solicitud,
  SolicitudStatus,
  STATUS_CONFIG,
  PRIORIDAD_CONFIG,
  COURSE_TYPE_CONFIG,
  type Usuario,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

export default function SolicitudDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { user } = useAuth();
  const id = params.id as string;

  const [solicitud, setSolicitud] = useState<Solicitud | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comentario, setComentario] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // @menciones
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [menciones, setMenciones] = useState<string[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const mentionStart = useRef(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadSolicitud();
    listarUsuarios().then(r => setUsuarios(r.usuarios)).catch(() => {});
  }, [id]);

  // Detecta si se está escribiendo un @token antes del cursor (sin espacios).
  const onComentarioChange = (value: string, caret: number) => {
    setComentario(value);
    const upto = value.slice(0, caret);
    const at = upto.lastIndexOf("@");
    if (at >= 0 && !/\s/.test(upto.slice(at + 1))) {
      mentionStart.current = at;
      setMentionQuery(upto.slice(at + 1).toLowerCase());
    } else {
      setMentionQuery(null);
    }
  };

  const pickMencion = (u: Usuario) => {
    const ta = textareaRef.current;
    const caret = ta ? ta.selectionStart : comentario.length;
    const before = comentario.slice(0, mentionStart.current);
    const after = comentario.slice(caret);
    const inserted = `@${u.nombre} `;
    setComentario(before + inserted + after);
    setMenciones(prev => prev.includes(u.email) ? prev : [...prev, u.email]);
    setMentionQuery(null);
    // reposicionar foco/caret tras el nombre insertado
    requestAnimationFrame(() => {
      if (ta) {
        const pos = (before + inserted).length;
        ta.focus();
        ta.setSelectionRange(pos, pos);
      }
    });
  };

  const mentionMatches = mentionQuery !== null
    ? usuarios.filter(u =>
        u.nombre.toLowerCase().includes(mentionQuery) ||
        u.email.toLowerCase().includes(mentionQuery)
      ).slice(0, 6)
    : [];

  const loadSolicitud = async () => {
    setLoading(true);
    try {
      const data = await obtenerSolicitud(id);
      setSolicitud(data);
    } catch (err) {
      setError("Error al cargar la solicitud");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: SolicitudStatus) => {
    if (!solicitud) return;
    setSubmitting(true);
    try {
      await actualizarSolicitud(solicitud.id, { status: newStatus });
      setSolicitud({ ...solicitud, status: newStatus });
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddComment = async () => {
    if (!solicitud || !comentario.trim() || !user) return;
    setSubmitting(true);
    try {
      // Solo enviar menciones cuyo nombre sigue presente en el texto.
      const activas = menciones.filter(email => {
        const u = usuarios.find(x => x.email === email);
        return u && comentario.includes(`@${u.nombre}`);
      });
      await agregarComentario(solicitud.id, comentario, {
        email: user.email || "",
        nombre: user.displayName || "Learning",
        rol: "learning",
      }, activas);
      setComentario("");
      setMenciones([]);
      loadSolicitud();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleIniciarProduccion = async () => {
    if (!solicitud) return;
    setSubmitting(true);
    try {
      await actualizarSolicitud(solicitud.id, { status: "en_proceso" });
      // El proceso arranca por el Perfil de Salida (primer paso), no por la Malla.
      router.push(`/dashboard/perfil?solicitud=${solicitud.id}`);
    } catch (err) {
      console.error(err);
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("es-CO", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
      </div>
    );
  }

  if (error || !solicitud) {
    return (
      <div className="p-6">
        <div className="rounded-lg bg-red-50 p-4 text-red-700">
          {error || "Solicitud no encontrada"}
        </div>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/dashboard")}>
          Volver a solicitudes
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <Button
            variant="ghost"
            className="mb-2 -ml-2"
            onClick={() => router.push("/dashboard")}
          >
            <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Volver a solicitudes
          </Button>
          <h1 className="text-2xl font-bold text-gray-900">{solicitud.curso.nombre}</h1>
          <p className="text-gray-500">
            Solicitado por {solicitud.solicitante.nombre} ({solicitud.solicitante.area})
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={STATUS_CONFIG[solicitud.status]?.color}>
            {STATUS_CONFIG[solicitud.status]?.emoji} {STATUS_CONFIG[solicitud.status]?.label}
          </Badge>
          <Badge variant="outline" className={PRIORIDAD_CONFIG[solicitud.prioridad]?.color}>
            {PRIORIDAD_CONFIG[solicitud.prioridad]?.label}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Course details */}
          <Card>
            <CardHeader>
              <CardTitle>Detalles del Curso</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Tipo de curso</label>
                  <p className="text-gray-900">
                    {solicitud.curso.course_type
                      ? COURSE_TYPE_CONFIG[solicitud.curso.course_type]?.label || solicitud.curso.course_type
                      : "Compliance crítico"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Audiencia</label>
                  <p className="text-gray-900">{solicitud.curso.audiencia}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Nivel</label>
                  <p className="text-gray-900">{solicitud.curso.nivel}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Duración</label>
                  <p className="text-gray-900">{solicitud.curso.duracion_min} minutos</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Requiere evaluación</label>
                  <p className="text-gray-900">{solicitud.curso.requiere_eval ? "Sí" : "No"}</p>
                </div>
              </div>
              <Separator />
              <div>
                <label className="text-sm font-medium text-gray-500">Objetivo</label>
                <p className="text-gray-900">{solicitud.curso.objetivo}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Temas</label>
                <p className="whitespace-pre-wrap text-gray-900">{solicitud.curso.temas}</p>
              </div>
              {solicitud.curso.documentacion && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Documentación</label>
                  <p className="whitespace-pre-wrap text-gray-700 text-sm bg-gray-50 p-3 rounded-lg max-h-48 overflow-y-auto">
                    {solicitud.curso.documentacion}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Contexto del solicitante (intake asistido por IA) */}
          {solicitud.intake && (solicitud.intake.clarificaciones?.length > 0 || solicitud.intake.documentos?.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Contexto del solicitante</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5 text-sm">
                {solicitud.intake.clarificaciones?.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Clarificaciones</p>
                    <div className="space-y-3">
                      {solicitud.intake.clarificaciones.map((c, i) => (
                        <div key={i}>
                          <p className="font-medium text-gray-800">{c.pregunta}</p>
                          <p className="text-gray-600">{c.respuesta}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {solicitud.intake.documentos?.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Documentos de referencia</p>
                    <div className="space-y-3">
                      {solicitud.intake.documentos.map((d, i) => (
                        <div key={i} className="rounded-lg border p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium text-gray-900">{d.titulo}</p>
                            {d.adjunto_url && (
                              <a href={d.adjunto_url} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-brand underline">
                                ⬇ {d.adjunto_nombre || "descargar"}
                              </a>
                            )}
                          </div>
                          <p className="text-xs text-gray-400">{d.motivo}</p>
                          {d.contenido && (
                            <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-gray-50 p-2 text-xs text-gray-600">
                              {d.contenido}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Comments */}
          <Card>
            <CardHeader>
              <CardTitle>Comentarios</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {solicitud.comentarios && solicitud.comentarios.length > 0 ? (
                  solicitud.comentarios.map((c) => (
                    <div key={c.id} className="rounded-lg bg-gray-50 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{c.autor.nombre}</span>
                          <Badge variant="outline" className="text-xs">
                            {c.autor.rol}
                          </Badge>
                        </div>
                        <span className="text-xs text-gray-500">{formatDate(c.created_at)}</span>
                      </div>
                      <p className="text-gray-700">{c.texto}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-center py-4">No hay comentarios aún</p>
                )}

                <Separator />

                <div className="space-y-3">
                  <div className="relative">
                    <Textarea
                      ref={textareaRef}
                      placeholder="Escribe un comentario… escribí @ para mencionar a alguien"
                      value={comentario}
                      onChange={(e) => onComentarioChange(e.target.value, e.target.selectionStart)}
                      onKeyDown={(e) => { if (e.key === "Escape") setMentionQuery(null); }}
                      rows={3}
                    />
                    {mentionMatches.length > 0 && (
                      <div className="absolute left-0 right-0 z-10 mt-1 max-h-52 overflow-auto rounded-lg border bg-white shadow-lg">
                        {mentionMatches.map((u) => (
                          <button
                            key={u.uid}
                            type="button"
                            onClick={() => pickMencion(u)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50"
                          >
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-100 text-xs font-medium text-red-700">
                              {u.nombre.charAt(0).toUpperCase()}
                            </span>
                            <span className="leading-tight">
                              <span className="block text-sm text-gray-900">{u.nombre}</span>
                              <span className="block text-xs text-gray-400">{u.email}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {menciones.length > 0 && (
                    <p className="text-xs text-gray-500">
                      Notificará a: {menciones.join(", ")}
                    </p>
                  )}
                  <Button
                    onClick={handleAddComment}
                    disabled={!comentario.trim() || submitting}
                    className="w-full"
                  >
                    {submitting ? "Enviando..." : "Agregar comentario"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Actions */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Acciones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {solicitud.status === "pendiente" && (
                <>
                  <Button
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    onClick={() => handleStatusChange("en_revision")}
                    disabled={submitting}
                  >
                    Tomar solicitud
                  </Button>
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => handleStatusChange("rechazado")}
                    disabled={submitting}
                  >
                    Rechazar
                  </Button>
                </>
              )}

              {solicitud.status === "en_revision" && (
                <>
                  <Button
                    className="w-full bg-green-600 hover:bg-green-700"
                    onClick={() => handleStatusChange("aprobado")}
                    disabled={submitting}
                  >
                    Aprobar
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full border-orange-500 text-orange-600 hover:bg-orange-50"
                    onClick={() => handleStatusChange("devuelto")}
                    disabled={submitting}
                  >
                    Devolver (más info)
                  </Button>
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => handleStatusChange("rechazado")}
                    disabled={submitting}
                  >
                    Rechazar
                  </Button>
                </>
              )}

              {solicitud.status === "aprobado" && (
                <Button
                  className="w-full bg-brand hover:bg-brand/90"
                  onClick={handleIniciarProduccion}
                  disabled={submitting}
                >
                  Iniciar diseño (Perfil de Salida) →
                </Button>
              )}

              {solicitud.status === "en_proceso" && (
                <>
                  <Button
                    className="w-full bg-brand hover:bg-brand/90"
                    onClick={() => router.push(`/dashboard/perfil?solicitud=${solicitud.id}`)}
                  >
                    Ir al proceso →
                  </Button>
                  <Button
                    className="w-full bg-green-600 hover:bg-green-700"
                    onClick={() => handleStatusChange("completado")}
                    disabled={submitting}
                  >
                    Marcar como completado
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Información</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Creado</span>
                <span className="text-gray-900">{formatDate(solicitud.created_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Actualizado</span>
                <span className="text-gray-900">{formatDate(solicitud.updated_at)}</span>
              </div>
              {solicitud.asignado_a && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Asignado a</span>
                  <span className="text-gray-900">{solicitud.asignado_a}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Solicitante</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-medium text-gray-900">{solicitud.solicitante.nombre}</p>
              <p className="text-gray-500">{solicitud.solicitante.email}</p>
              <p className="text-gray-500">{solicitud.solicitante.area}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
