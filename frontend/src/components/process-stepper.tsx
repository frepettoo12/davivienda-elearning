"use client";

/**
 * Stepper del proceso de diseño de un curso: Solicitud → Perfil → Malla →
 * Diseño → Contenido → SCORM → LMS.
 *
 * Se muestra arriba de cada página del proceso cuando hay un curso en foco.
 * Cada paso marca su estado (hecho ✓ / actual / pendiente) y es clickeable si
 * ya es alcanzable. Resuelve la cadena desde solicitudId o mallaId (las
 * páginas usan uno u otro en la URL).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  obtenerMalla,
  obtenerSolicitud,
  Malla,
  Solicitud,
  STATUS_CONFIG,
  PRIORIDAD_CONFIG,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";

export type ProcesoStep =
  | "solicitud"
  | "perfil"
  | "malla"
  | "diseno"
  | "contenido"
  | "scorm"
  | "lms";

interface Props {
  current: ProcesoStep;
  solicitudId?: string | null;
  mallaId?: string | null;
}

export function ProcessStepper({ current, solicitudId, mallaId }: Props) {
  const router = useRouter();
  const [sol, setSol] = useState<Solicitud | null>(null);
  const [malla, setMalla] = useState<Malla | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let s: Solicitud | null = null;
        let m: Malla | null = null;
        if (solicitudId) {
          s = await obtenerSolicitud(solicitudId);
          if (s.malla_id) m = await obtenerMalla(s.malla_id).catch(() => null);
        } else if (mallaId) {
          m = await obtenerMalla(mallaId).catch(() => null);
          // obtener_malla ya devuelve solicitud_id (relación inversa resuelta en
          // el backend), sin depender del listado paginado.
          if (m?.solicitud_id) s = await obtenerSolicitud(m.solicitud_id).catch(() => null);
        }
        if (!cancelled) {
          setSol(s);
          setMalla(m);
        }
      } catch {
        /* el stepper es informativo: si algo falla, no rompe la página */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [solicitudId, mallaId]);

  const sid = sol?.id || solicitudId || null;
  const mid = malla?.id || sol?.malla_id || mallaId || null;

  const guiones = malla?.guiones || [];
  const hayContenido = guiones.some((g) => {
    const c = (g.contenido || {}) as Record<string, unknown>;
    return Boolean(c.html || c.audio_url || c.video_url || c.composed_url);
  });

  const steps: Array<{
    key: ProcesoStep;
    label: string;
    done: boolean;
    href: string | null;
  }> = [
    {
      key: "solicitud",
      label: "Solicitud",
      done: Boolean(sid),
      href: sid ? `/dashboard/solicitudes/${sid}` : null,
    },
    {
      key: "perfil",
      label: "Perfil de Salida",
      done: sol?.perfil_salida?.status === "aprobado",
      href: sid ? `/dashboard/perfil?solicitud=${sid}` : null,
    },
    {
      key: "malla",
      label: "Malla",
      done: Boolean(mid && (malla?.malla?.length ?? 0) > 0),
      href: sid ? `/dashboard/malla?solicitud=${sid}` : null,
    },
    {
      key: "diseno",
      label: "Diseño",
      done: guiones.length > 0,
      href: mid ? `/dashboard/diseno?malla=${mid}` : null,
    },
    {
      key: "contenido",
      label: "Contenido",
      done: hayContenido,
      href: mid ? `/dashboard/contenido?malla=${mid}` : null,
    },
    {
      key: "scorm",
      label: "SCORM",
      done: Boolean(malla?.scorm_url),
      href: mid ? `/dashboard/scorm?malla=${mid}` : null,
    },
    {
      key: "lms",
      label: "LMS",
      done: Boolean(malla?.lms_publicado) || sol?.status === "completado",
      href: mid ? `/dashboard/lms?malla=${mid}${sid ? `&solicitud=${sid}` : ""}` : null,
    },
  ];

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-l-4 border-l-brand bg-white">
      {/* La solicitud es la madre de todo: siempre visible en qué curso estás */}
      {sol && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-gray-50/60 px-4 py-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Trabajando en
          </span>
          <button
            className="truncate text-sm font-semibold text-gray-900 hover:text-brand hover:underline"
            onClick={() => router.push(`/dashboard/solicitudes/${sol.id}`)}
            title="Ver la solicitud"
          >
            {sol.curso?.nombre}
          </button>
          <span className="text-xs text-gray-500">
            {sol.solicitante?.nombre} · {sol.solicitante?.area}
          </span>
          <span className="ml-auto flex items-center gap-2">
            <Badge className={PRIORIDAD_CONFIG[sol.prioridad]?.color}>
              {PRIORIDAD_CONFIG[sol.prioridad]?.label}
            </Badge>
            <Badge className={STATUS_CONFIG[sol.status]?.color}>
              {STATUS_CONFIG[sol.status]?.emoji} {STATUS_CONFIG[sol.status]?.label}
            </Badge>
          </span>
        </div>
      )}
      <div className="overflow-x-auto">
      <div className="flex min-w-max items-center px-4 py-3">
        {steps.map((step, i) => {
          const isCurrent = step.key === current;
          const clickable = Boolean(step.href) && !isCurrent;
          return (
            <div key={step.key} className="flex items-center">
              {i > 0 && (
                <div
                  className={`mx-2 h-px w-6 ${steps[i - 1].done ? "bg-brand" : "bg-gray-200"}`}
                />
              )}
              <button
                disabled={!clickable}
                onClick={() => step.href && router.push(step.href)}
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  isCurrent
                    ? "bg-brand text-white"
                    : step.done
                    ? "text-brand hover:bg-brand/10"
                    : clickable
                    ? "text-gray-500 hover:bg-gray-100"
                    : "cursor-default text-gray-300"
                }`}
                title={step.done ? "Completado" : isCurrent ? "Paso actual" : ""}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold ${
                    isCurrent
                      ? "border-white/60 bg-white/20 text-white"
                      : step.done
                      ? "border-brand bg-brand text-white"
                      : "border-gray-300 text-gray-400"
                  }`}
                >
                  {step.done && !isCurrent ? "✓" : i + 1}
                </span>
                {step.label}
              </button>
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
