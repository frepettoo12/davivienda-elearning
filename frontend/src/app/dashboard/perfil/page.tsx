"use client";

/**
 * Perfil de Salida (temario) — primer paso del proceso de diseño.
 *
 * Desde la solicitud, la IA propone el "contrato" del curso: objetivo general,
 * competencias (qué va a poder hacer el participante) y temario. Learning lo
 * edita/itera y lo envía a validación del área solicitante. Recién con el
 * perfil aprobado se diseña la malla.
 */

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  generarPerfil,
  guardarPerfil,
  listarSolicitudes,
  obtenerSolicitud,
  PerfilContenido,
  PerfilSalida,
  PERFIL_STATUS_CONFIG,
  Solicitud,
  SolicitudListItem,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

export default function PerfilPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const solicitudId = searchParams.get("solicitud");

  const [solicitud, setSolicitud] = useState<Solicitud | null>(null);
  const [pendientes, setPendientes] = useState<SolicitudListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null); // "generar"|"guardar"|"enviar"|"iterar"
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [editando, setEditando] = useState(false);
  const [draft, setDraft] = useState<PerfilContenido | null>(null);

  const perfil: PerfilSalida | undefined = solicitud?.perfil_salida;

  useEffect(() => {
    if (solicitudId) {
      setLoading(true);
      obtenerSolicitud(solicitudId)
        .then(setSolicitud)
        .catch(() => setError("Error cargando la solicitud"))
        .finally(() => setLoading(false));
    } else {
      setLoading(true);
      listarSolicitudes({})
        .then((r) => setPendientes(r.solicitudes.filter((s) => !s.malla_id)))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [solicitudId]);

  const applyPerfil = (p: PerfilSalida) =>
    setSolicitud((s) => (s ? { ...s, perfil_salida: p } : s));

  const run = async (accion: string, fn: () => Promise<void>) => {
    setWorking(accion);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setWorking(null);
    }
  };

  const handleGenerar = () =>
    run("generar", async () => {
      const r = await generarPerfil(solicitudId!);
      applyPerfil(r.perfil_salida);
    });

  const handleIterar = () =>
    run("iterar", async () => {
      const r = await generarPerfil(solicitudId!, feedback.trim());
      applyPerfil(r.perfil_salida);
      setFeedback("");
    });

  const handleGuardarEdicion = () =>
    run("guardar", async () => {
      if (!draft) return;
      const r = await guardarPerfil(solicitudId!, { contenido: draft });
      applyPerfil(r.perfil_salida);
      setEditando(false);
    });

  const handleEnviar = () =>
    run("enviar", async () => {
      const r = await guardarPerfil(solicitudId!, { accion: "enviar_validacion" });
      applyPerfil(r.perfil_salida);
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
      </div>
    );
  }

  // ── Listado: solicitudes sin malla (candidatas a definir perfil) ──
  if (!solicitudId) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Perfil de Salida</h1>
          <p className="text-gray-500">
            El contrato del curso (competencias + temario) que valida el área antes de diseñar
          </p>
        </div>
        {pendientes.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pendientes.map((sol) => (
              <Card
                key={sol.id}
                className="cursor-pointer transition-shadow hover:shadow-lg"
                onClick={() => router.push(`/dashboard/perfil?solicitud=${sol.id}`)}
              >
                <CardContent className="p-4">
                  <h3 className="mb-1 font-semibold text-gray-900">{sol.curso_nombre}</h3>
                  <p className="mb-3 text-sm text-gray-500">{sol.area} · {sol.solicitante_nombre}</p>
                  <Button size="sm" className="w-full">Definir perfil de salida</Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-gray-500">
              No hay solicitudes pendientes de perfil
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  const c = perfil?.contenido;
  const statusCfg = perfil ? PERFIL_STATUS_CONFIG[perfil.status] : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/perfil")}>
          ‹ Solicitudes
        </Button>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="truncate text-2xl font-bold text-gray-900">
            {solicitud?.curso?.nombre}
          </h1>
          {statusCfg && <Badge className={statusCfg.color}>{statusCfg.label}</Badge>}
          {perfil && <span className="text-xs text-gray-400">v{perfil.version}</span>}
        </div>
        <p className="text-sm text-gray-500">
          Solicitado por {solicitud?.solicitante?.nombre} ({solicitud?.solicitante?.area})
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {/* Feedback del área cuando pidió cambios */}
      {perfil?.status === "con_cambios" && perfil.validacion_feedback && (
        <div className="rounded-lg border-l-4 border-orange-400 bg-orange-50 p-4 text-sm">
          <p className="font-medium text-orange-800">El área pidió estos cambios:</p>
          <p className="mt-1 text-orange-700">{perfil.validacion_feedback}</p>
        </div>
      )}

      {!c ? (
        <Card>
          <CardHeader>
            <CardTitle>Generar el perfil de salida</CardTitle>
            <CardDescription>
              La IA propone objetivo, competencias y temario a partir de la solicitud;
              después lo ajustás y lo mandás a validar al área.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="rounded-lg bg-gray-50 p-4">
              <p><span className="text-gray-500">Objetivo:</span> {solicitud?.curso?.objetivo}</p>
              <p className="mt-1"><span className="text-gray-500">Temas pedidos:</span> {solicitud?.curso?.temas}</p>
              <p className="mt-1"><span className="text-gray-500">Duración:</span> {solicitud?.curso?.duracion_min} min</p>
            </div>
            <Button onClick={handleGenerar} disabled={working !== null} className="w-full bg-brand hover:bg-brand/90">
              {working === "generar" ? "Generando…" : "⚡ Generar perfil con IA"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Contenido del perfil */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Perfil de salida</CardTitle>
              {!editando && perfil?.status !== "aprobado" && (
                <Button variant="outline" size="sm" onClick={() => { setDraft(JSON.parse(JSON.stringify(c))); setEditando(true); }}>
                  ✎ Editar a mano
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-5">
              {editando && draft ? (
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium">Objetivo general</label>
                    <Textarea value={draft.objetivo_general} onChange={(e) => setDraft({ ...draft, objetivo_general: e.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Competencias (una por línea)</label>
                    <Textarea
                      rows={5}
                      value={draft.competencias.join("\n")}
                      onChange={(e) => setDraft({ ...draft, competencias: e.target.value.split("\n").filter((s) => s.trim()) })}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      Temario (módulo seguido de sus temas con &quot;- &quot;)
                    </label>
                    <Textarea
                      rows={10}
                      value={draft.temario.map((m) => `${m.modulo}\n${m.temas.map((t) => `- ${t}`).join("\n")}`).join("\n\n")}
                      onChange={(e) => {
                        const bloques = e.target.value.split(/\n\s*\n/);
                        const temario = bloques
                          .map((b) => {
                            const lineas = b.split("\n").filter((l) => l.trim());
                            if (!lineas.length) return null;
                            return {
                              modulo: lineas[0].trim(),
                              temas: lineas.slice(1).map((l) => l.replace(/^[-•]\s*/, "").trim()).filter(Boolean),
                            };
                          })
                          .filter(Boolean) as PerfilContenido["temario"];
                        setDraft({ ...draft, temario });
                      }}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleGuardarEdicion} disabled={working !== null} className="bg-brand hover:bg-brand/90">
                      {working === "guardar" ? "Guardando…" : "Guardar cambios"}
                    </Button>
                    <Button variant="outline" onClick={() => setEditando(false)}>Cancelar</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Objetivo general</p>
                    <p className="mt-1 text-gray-800">{c.objetivo_general}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Al terminar, el participante va a poder…
                    </p>
                    <ul className="mt-1 space-y-1">
                      {c.competencias.map((comp, i) => (
                        <li key={i} className="flex gap-2 text-gray-800">
                          <span className="text-brand">✓</span> {comp}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Temario</p>
                    <div className="mt-2 space-y-3">
                      {c.temario.map((m, i) => (
                        <div key={i} className="rounded-lg border p-3">
                          <p className="font-medium text-gray-900">{i + 1}. {m.modulo}</p>
                          <ul className="mt-1 ml-5 list-disc text-sm text-gray-600">
                            {m.temas.map((t, j) => <li key={j}>{t}</li>)}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                  {c.fuera_de_alcance && (
                    <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
                      <b>Fuera de alcance:</b> {c.fuera_de_alcance}
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Acciones según estado */}
          {perfil?.status === "aprobado" ? (
            <div className="flex items-center justify-between rounded-lg bg-green-50 p-4">
              <p className="text-sm text-green-800">
                ✓ Perfil aprobado{perfil.validado_por ? ` por ${perfil.validado_por}` : ""} — ya se puede diseñar la malla
              </p>
              <Button onClick={() => router.push(`/dashboard/malla?solicitud=${solicitudId}`)} className="bg-brand hover:bg-brand/90">
                Ir a la Malla →
              </Button>
            </div>
          ) : (
            <>
              {!editando && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Iterar con IA</CardTitle>
                  </CardHeader>
                  <CardContent className="flex gap-2">
                    <Textarea
                      placeholder='Ej: "agregá un módulo de primeros auxilios y sacá el de normativa internacional"'
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      rows={2}
                    />
                    <Button onClick={handleIterar} disabled={working !== null || !feedback.trim()} variant="outline">
                      {working === "iterar" ? "…" : "Regenerar"}
                    </Button>
                  </CardContent>
                </Card>
              )}
              {!editando && (
                <Button
                  onClick={handleEnviar}
                  disabled={working !== null || perfil?.status === "en_validacion"}
                  className="w-full bg-brand hover:bg-brand/90"
                >
                  {perfil?.status === "en_validacion"
                    ? "⏳ Enviado — esperando validación del área"
                    : working === "enviar"
                    ? "Enviando…"
                    : `📤 Enviar a validación de ${solicitud?.solicitante?.nombre || "el área"}`}
                </Button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
