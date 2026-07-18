"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  obtenerSolicitud,
  agregarComentario,
  listarUsuarios,
  validarPerfil,
  Solicitud,
  PerfilSalida,
  STATUS_CONFIG,
  PRIORIDAD_CONFIG,
  COURSE_TYPE_CONFIG,
  PERFIL_STATUS_CONFIG,
  type Usuario,
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

export default function SolicitudDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { user } = useAuth();

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
      // Autor = el usuario logueado (puede no ser el solicitante original);
      // fallback a los datos del solicitante si no hay sesión.
      await agregarComentario(solicitud.id, comentario, {
        email: user?.email || solicitud.solicitante.email,
        nombre: user?.displayName || user?.email || solicitud.solicitante.nombre,
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
          {/* Perfil de salida: el área lo valida acá */}
          {solicitud.perfil_salida?.contenido && solicitud.perfil_salida.status !== "borrador" && (
            <PerfilValidacion
              solicitudId={solicitud.id}
              perfil={solicitud.perfil_salida}
              onValidated={loadSolicitud}
            />
          )}

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

// Validación del Perfil de Salida por el área solicitante: es el "contrato"
// del curso (qué va a aprender la gente + temario). Aprobar habilita el diseño.
function PerfilValidacion({ solicitudId, perfil, onValidated }: {
  solicitudId: string;
  perfil: PerfilSalida;
  onValidated: () => void;
}) {
  const [feedback, setFeedback] = useState("");
  const [pidiendo, setPidiendo] = useState(false);
  const [working, setWorking] = useState<"aprobar" | "cambios" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const c = perfil.contenido;
  const cfg = PERFIL_STATUS_CONFIG[perfil.status];
  const esperaValidacion = perfil.status === "en_validacion";

  const decidir = async (decision: "aprobar" | "cambios") => {
    setWorking(decision);
    setError(null);
    try {
      // Mandamos la versión que estamos viendo: si Learning regeneró en el
      // medio, el backend devuelve 409 y no aprobamos una versión vieja.
      await validarPerfil(
        solicitudId,
        decision,
        decision === "cambios" ? feedback.trim() : undefined,
        perfil.version
      );
      setPidiendo(false);
      setFeedback("");
      onValidated();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      setError(msg);
      // Conflicto de versión (409): recargamos para mostrar el perfil nuevo.
      if (msg.includes("El perfil cambió")) {
        onValidated();
      }
    } finally {
      setWorking(null);
    }
  };

  return (
    <Card className={esperaValidacion ? "border-2 border-blue-300" : ""}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          🎯 Perfil de salida del curso
          <Badge className={cfg.color}>{cfg.label}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Objetivo</p>
          <p className="mt-1 text-gray-800">{c.objetivo_general}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Al terminar, tu gente va a poder…
          </p>
          <ul className="mt-1 space-y-1">
            {c.competencias.map((comp, i) => (
              <li key={i} className="flex gap-2 text-gray-800"><span className="text-green-600">✓</span> {comp}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Temario</p>
          <div className="mt-2 space-y-2">
            {c.temario.map((m, i) => (
              <div key={i} className="rounded-lg border p-3">
                <p className="font-medium text-gray-900">{i + 1}. {m.modulo}</p>
                <ul className="ml-5 mt-1 list-disc text-gray-600">
                  {m.temas.map((t, j) => <li key={j}>{t}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
        {c.fuera_de_alcance && (
          <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
            <b>Queda fuera de este curso:</b> {c.fuera_de_alcance}
          </p>
        )}

        {error && <p className="rounded bg-red-50 p-2 text-red-700">{error}</p>}

        {esperaValidacion && (
          <div className="space-y-3 border-t pt-4">
            <p className="font-medium text-gray-900">
              ¿Este perfil refleja lo que necesitás? Tu validación habilita el diseño del curso.
            </p>
            {pidiendo ? (
              <div className="space-y-2">
                <Textarea
                  placeholder="Contanos qué falta, sobra o cambiarías…"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={3}
                />
                <div className="flex gap-2">
                  <Button
                    onClick={() => decidir("cambios")}
                    disabled={working !== null || !feedback.trim()}
                    className="bg-orange-500 hover:bg-orange-600"
                  >
                    {working === "cambios" ? "Enviando…" : "Enviar pedido de cambios"}
                  </Button>
                  <Button variant="outline" onClick={() => setPidiendo(false)}>Cancelar</Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  onClick={() => decidir("aprobar")}
                  disabled={working !== null}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  {working === "aprobar" ? "Aprobando…" : "✓ Aprobar perfil"}
                </Button>
                <Button variant="outline" onClick={() => setPidiendo(true)} disabled={working !== null}>
                  ✎ Pedir cambios
                </Button>
              </div>
            )}
          </div>
        )}
        {perfil.status === "con_cambios" && (
          <p className="rounded-lg bg-orange-50 p-3 text-orange-700">
            Pediste cambios — el equipo de Learning está ajustando el perfil y te va a llegar de nuevo.
          </p>
        )}
        {perfil.status === "aprobado" && (
          <p className="rounded-lg bg-green-50 p-3 text-green-700">
            ✓ Aprobaste este perfil{perfil.validado_at ? ` el ${new Date(perfil.validado_at).toLocaleDateString("es")}` : ""} — el curso se diseña sobre esta base.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
