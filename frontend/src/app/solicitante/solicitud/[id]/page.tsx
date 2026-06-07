"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  obtenerSolicitud,
  agregarComentario,
  listarUsuarios,
  Solicitud,
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

  const handleAddComment = async () => {
    if (!solicitud || !comentario.trim()) return;
    setSubmitting(true);
    try {
      const activas = menciones.filter(email => {
        const u = usuarios.find(x => x.email === email);
        return u && comentario.includes(`@${u.nombre}`);
      });
      await agregarComentario(solicitud.id, comentario, {
        email: solicitud.solicitante.email,
        nombre: solicitud.solicitante.nombre,
        rol: "solicitante",
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
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (error || !solicitud) {
    return (
      <div>
        <div className="rounded-lg bg-red-50 p-4 text-red-700">
          {error || "Solicitud no encontrada"}
        </div>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push("/solicitante/mis-solicitudes")}
        >
          Volver a mis solicitudes
        </Button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="ghost"
          className="mb-2 -ml-2"
          onClick={() => router.push("/solicitante/mis-solicitudes")}
        >
          <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Volver a mis solicitudes
        </Button>
        <div className="flex items-start justify-between">
          <h1 className="text-2xl font-bold text-gray-900">{solicitud.curso.nombre}</h1>
          <div className="flex items-center gap-2">
            <Badge className={STATUS_CONFIG[solicitud.status]?.color}>
              {STATUS_CONFIG[solicitud.status]?.emoji} {STATUS_CONFIG[solicitud.status]?.label}
            </Badge>
            <Badge variant="outline" className={PRIORIDAD_CONFIG[solicitud.prioridad]?.color}>
              {PRIORIDAD_CONFIG[solicitud.prioridad]?.label}
            </Badge>
          </div>
        </div>
      </div>

      {/* Devuelto Alert */}
      {solicitud.status === "devuelto" && (
        <div className="mb-6 rounded-lg bg-orange-50 border border-orange-200 p-4">
          <div className="flex items-start gap-3">
            <svg className="h-5 w-5 text-orange-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className="font-medium text-orange-800">Solicitud devuelta</h3>
              <p className="text-sm text-orange-700">
                El equipo Learning necesita más información. Por favor revisa los comentarios y responde.
              </p>
            </div>
          </div>
        </div>
      )}

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
            </CardContent>
          </Card>

          {/* Comments */}
          <Card>
            <CardHeader>
              <CardTitle>Conversación</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {solicitud.comentarios && solicitud.comentarios.length > 0 ? (
                  solicitud.comentarios.map((c) => (
                    <div
                      key={c.id}
                      className={`rounded-lg p-4 ${
                        c.autor.rol === "solicitante"
                          ? "bg-blue-50 ml-8"
                          : "bg-gray-50 mr-8"
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{c.autor.nombre}</span>
                          <Badge variant="outline" className="text-xs">
                            {c.autor.rol === "solicitante" ? "Tú" : "Learning"}
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
                      placeholder="Escribe un mensaje… escribí @ para mencionar a alguien"
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
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-700">
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
                    <p className="text-xs text-gray-500">Notificará a: {menciones.join(", ")}</p>
                  )}
                  <Button
                    onClick={handleAddComment}
                    disabled={!comentario.trim() || submitting}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    {submitting ? "Enviando..." : "Enviar mensaje"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Estado</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center text-2xl ${
                    solicitud.status === "completado" ? "bg-green-100" :
                    solicitud.status === "rechazado" ? "bg-red-100" :
                    solicitud.status === "devuelto" ? "bg-orange-100" :
                    "bg-blue-100"
                  }`}>
                    {STATUS_CONFIG[solicitud.status]?.emoji}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {STATUS_CONFIG[solicitud.status]?.label}
                    </p>
                    <p className="text-sm text-gray-500">Estado actual</p>
                  </div>
                </div>
                {solicitud.status === "en_proceso" && (
                  <p className="text-sm text-indigo-600 bg-indigo-50 p-3 rounded-lg">
                    Tu curso está siendo producido por el equipo Learning.
                  </p>
                )}
                {solicitud.status === "completado" && (
                  <p className="text-sm text-green-600 bg-green-50 p-3 rounded-lg">
                    Tu curso ha sido completado y entregado.
                  </p>
                )}
              </div>
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
        </div>
      </div>
    </div>
  );
}
