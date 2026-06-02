"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  obtenerSolicitud,
  actualizarSolicitud,
  agregarComentario,
  Solicitud,
  SolicitudStatus,
  STATUS_CONFIG,
  PRIORIDAD_CONFIG,
  COURSE_TYPE_CONFIG,
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

  useEffect(() => {
    loadSolicitud();
  }, [id]);

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
      await agregarComentario(solicitud.id, comentario, {
        email: user.email || "",
        nombre: user.displayName || "Learning",
        rol: "learning",
      });
      setComentario("");
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
      router.push(`/dashboard/malla?solicitud=${solicitud.id}`);
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
                  <Textarea
                    placeholder="Escribe un comentario..."
                    value={comentario}
                    onChange={(e) => setComentario(e.target.value)}
                    rows={3}
                  />
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
                  className="w-full bg-indigo-600 hover:bg-indigo-700"
                  onClick={handleIniciarProduccion}
                  disabled={submitting}
                >
                  Iniciar Producción
                </Button>
              )}

              {solicitud.status === "en_proceso" && (
                <>
                  <Button
                    className="w-full"
                    onClick={() => router.push(`/dashboard/malla?solicitud=${solicitud.id}`)}
                  >
                    Ir a Malla
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
                <span className="text-gray-500">ID</span>
                <span className="font-mono text-gray-900">{solicitud.id.slice(0, 8)}...</span>
              </div>
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
