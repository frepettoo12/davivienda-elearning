/**
 * API Client for Firebase Cloud Functions
 */

import { auth } from "@/lib/firebase";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  "https://us-central1-davivienda-elearning.cloudfunctions.net";

// Las funciones gen-2 exponen además URLs Cloud Run con un sufijo compartido.
const CLOUDRUN_SUFFIX =
  process.env.NEXT_PUBLIC_CLOUDRUN_SUFFIX || "elrtzny3ba-uc.a.run.app";

// API URLs
const API_URLS = {
  // Solicitudes
  crear_solicitud: `${API_BASE}/crear_solicitud`,
  listar_solicitudes: `${API_BASE}/listar_solicitudes`,
  obtener_solicitud: `${API_BASE}/obtener_solicitud`,
  actualizar_solicitud: `${API_BASE}/actualizar_solicitud`,
  agregar_comentario: `${API_BASE}/agregar_comentario`,
  listar_usuarios: `${API_BASE}/listar_usuarios`,
  mis_solicitudes: `${API_BASE}/mis_solicitudes`,
  mi_empresa: `${API_BASE}/mi_empresa`,
  actualizar_empresa: `${API_BASE}/actualizar_empresa`,
  // Mallas
  crear_malla: `https://crear-malla-${CLOUDRUN_SUFFIX}`,
  obtener_malla: `https://obtener-malla-${CLOUDRUN_SUFFIX}`,
  iterar_malla: `https://iterar-malla-endpoint-${CLOUDRUN_SUFFIX}`,
  guardar_malla: `${API_BASE}/guardar_malla`,
  guardar_guion: `${API_BASE}/guardar_guion`,
  generar_guiones: `https://generar-guiones-endpoint-${CLOUDRUN_SUFFIX}`,
  iterar_guion: `${API_BASE}/iterar_guion_endpoint`,
  // Audio/Video
  generar_audio: `https://generar-audio-endpoint-${CLOUDRUN_SUFFIX}`,
  generar_video: `https://generar-video-endpoint-${CLOUDRUN_SUFFIX}`,
  obtener_job: `https://obtener-job-${CLOUDRUN_SUFFIX}`,
  // Health
  health: `https://health-${CLOUDRUN_SUFFIX}`,
  // SCORM. En local apuntar al emulador con NEXT_PUBLIC_FUNCTIONS_EMULATOR
  // (ej: http://127.0.0.1:5001/davivienda-elearning/us-central1)
  empaquetar_scorm: `${process.env.NEXT_PUBLIC_FUNCTIONS_EMULATOR || API_BASE}/empaquetar_scorm_endpoint`,
};

// ── Auth (multi-tenant) ────────────────────────────────────────────────────
// Todas las llamadas mandan el Firebase ID token; el backend deriva la empresa
// del dominio del email. getIdToken() cachea y refresca solo.

// Empresa "activa" elegida por un superadmin en el selector del dashboard.
// El backend solo la respeta si el usuario es superadmin.
export const ACTING_COMPANY_KEY = "actingCompany";

export function actingCompanyId(): string {
  try {
    return localStorage.getItem(ACTING_COMPANY_KEY) || "";
  } catch {
    return "";
  }
}

export async function authHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};
  try {
    const token = await user.getIdToken();
    const acting = actingCompanyId();
    return {
      Authorization: `Bearer ${token}`,
      ...(acting ? { "X-Company-Id": acting } : {}),
    };
  } catch {
    return {};
  }
}

// ID token para URLs que no pueden mandar headers (iframes de preview del
// agent-service: ?auth=). Vacío si no hay usuario.
export async function currentIdToken(): Promise<string> {
  try {
    return (await auth.currentUser?.getIdToken()) || "";
  } catch {
    return "";
  }
}

export async function apiFetch(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(await authHeaders()),
      ...((init.headers as Record<string, string>) || {}),
    },
  });
}

export interface ScormRecurso {
  id: number;
  orden: number;
  titulo: string;
  bloque?: string;
  tipo: string;
  html?: string;
  video_url?: string;
  assets?: string[];
}

export async function obtenerScormShell(): Promise<{ default: string; global: string }> {
  const res = await apiFetch(`${API_BASE}/scorm_shell`);
  if (!res.ok) throw new Error("Error obteniendo shell SCORM");
  return res.json();
}

export async function guardarScormShell(
  scope: "global" | "course",
  shellHtml: string,
  mallaId?: string
): Promise<void> {
  const res = await apiFetch(`${API_BASE}/scorm_shell`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope, shell_html: shellHtml, malla_id: mallaId }),
  });
  if (!res.ok) throw new Error(`Error guardando shell: ${await res.text()}`);
}

export async function empaquetarScorm(payload: {
  malla_id: string;
  curso_nombre: string;
  passing_score?: number;
  recursos: ScormRecurso[];
  shell_html?: string;
}): Promise<{ ok: boolean; download_url: string; size: number; recursos: number }> {
  const res = await apiFetch(API_URLS.empaquetar_scorm, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Error empaquetando SCORM: ${t}`);
  }
  return res.json();
}

// Modo Agente (Claude Agent SDK). Local por defecto; en prod, NEXT_PUBLIC_AGENT_URL
// apunta al servicio Cloud Run.
export const AGENT_URL =
  process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:8090";

// Types
export interface Solicitante {
  email: string;
  nombre: string;
  area: string;
}

export type CourseType =
  | "compliance"
  | "onboarding"
  | "proceso_sistema"
  | "habilidades_blandas"
  | "producto_ventas";

export interface Curso {
  nombre: string;
  course_type?: CourseType;
  audiencia: string;
  nivel: string;
  duracion_min: number;
  objetivo: string;
  temas: string;
  requiere_eval: boolean;
  documentacion?: string;
}

export interface Solicitud {
  id: string;
  solicitante: Solicitante;
  curso: Curso;
  status: SolicitudStatus;
  prioridad: "alta" | "media" | "baja";
  asignado_a?: string;
  malla_id?: string;
  created_at?: string;
  updated_at?: string;
  comentarios?: Comentario[];
}

export interface Comentario {
  id: string;
  autor: {
    email: string;
    nombre: string;
    rol: string;
  };
  texto: string;
  created_at: string;
}

export type SolicitudStatus =
  | "pendiente"
  | "en_revision"
  | "devuelto"
  | "aprobado"
  | "rechazado"
  | "en_proceso"
  | "completado";

// API Functions

export interface SolicitudListItem {
  id: string;
  curso_nombre: string;
  area: string;
  solicitante_nombre?: string;
  solicitante_email?: string;
  status: SolicitudStatus;
  prioridad: "alta" | "media" | "baja";
  asignado_a?: string;
  created_at?: string;
  malla_id?: string;
  ultimo_comentario?: string;
}

export async function listarSolicitudes(params?: {
  status?: string;
  area?: string;
  asignado_a?: string;
  limit?: number;
}): Promise<{ solicitudes: SolicitudListItem[]; total: number }> {
  const queryParams = new URLSearchParams();
  if (params?.status) queryParams.set("status", params.status);
  if (params?.area) queryParams.set("area", params.area);
  if (params?.asignado_a) queryParams.set("asignado_a", params.asignado_a);
  if (params?.limit) queryParams.set("limit", params.limit.toString());

  const url = `${API_URLS.listar_solicitudes}?${queryParams}`;
  const res = await apiFetch(url);
  if (!res.ok) throw new Error("Error fetching solicitudes");
  return res.json();
}

export async function obtenerSolicitud(id: string): Promise<Solicitud> {
  const res = await apiFetch(`${API_URLS.obtener_solicitud}?id=${id}`);
  if (!res.ok) throw new Error("Error fetching solicitud");
  return res.json();
}

export async function crearSolicitud(data: {
  solicitante: Solicitante;
  curso: Curso;
  prioridad?: "alta" | "media" | "baja";
  // Multi-tenant: empresa a la que pertenece la solicitud. Solo se usa para
  // solicitantes externos (gmail) sin empresa asignada; si el dominio del
  // usuario ya mapea a una empresa, el backend la deriva del token.
  company_id?: string;
}): Promise<{ id: string; status: string; message: string }> {
  const res = await apiFetch(API_URLS.crear_solicitud, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Error creating solicitud");
  return res.json();
}

export async function actualizarSolicitud(
  id: string,
  data: {
    status?: SolicitudStatus;
    asignado_a?: string;
    prioridad?: "alta" | "media" | "baja";
    malla_id?: string;
  }
): Promise<{ id: string; updated: string[]; message: string }> {
  const res = await apiFetch(`${API_URLS.actualizar_solicitud}?id=${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Error updating solicitud");
  return res.json();
}

export async function agregarComentario(
  solicitudId: string,
  texto: string,
  autor: { email: string; nombre: string; rol: string },
  menciones?: string[]
): Promise<{ id: string; solicitud_id: string; message: string }> {
  const res = await apiFetch(`${API_URLS.agregar_comentario}?id=${solicitudId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texto, autor, menciones: menciones || [] }),
  });
  if (!res.ok) throw new Error("Error adding comment");
  return res.json();
}

// Composición split (Opción C): avatar HeyGen + HTML branded → MP4 (vía agent-service).
export async function composeSplitVideo(
  avatarUrl: string,
  contentHtml: string,
  id: string
): Promise<{ url: string }> {
  const res = await apiFetch(`${AGENT_URL}/compose/split`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ avatarUrl, contentHtml, id }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Error componiendo video: ${t}`);
  }
  const d = await res.json();
  return { url: String(d.url).startsWith("http") ? d.url : `${AGENT_URL}${d.url}` };
}

// Composición de video de slides (sin avatar): slide HTML + audio → MP4.
export async function composeSlidesVideo(
  audioUrl: string,
  contentHtml: string,
  id: string,
  slideCount: number
): Promise<{ url: string }> {
  const res = await apiFetch(`${AGENT_URL}/compose/slides`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audioUrl, contentHtml, slideCount, id }),
  });
  if (!res.ok) throw new Error(`Error componiendo video: ${await res.text()}`);
  const d = await res.json();
  // Storage devuelve URL absoluta; el fallback local es relativo al agent-service.
  return { url: String(d.url).startsWith("http") ? d.url : `${AGENT_URL}${d.url}` };
}

// Iteración de guión con IA (gpt-4o). Los callers manejan la respuesta según el
// modo (analizar_intencion / iterar), por eso devuelve la Response cruda.
export async function iterarGuionRequest(
  body: Record<string, unknown>
): Promise<Response> {
  return apiFetch(API_URLS.iterar_guion, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Config de la empresa del usuario autenticado (multi-tenant).
export async function obtenerMiEmpresa(): Promise<import("@/lib/brand").MiEmpresa> {
  const res = await apiFetch(API_URLS.mi_empresa);
  if (!res.ok) {
    throw new Error(`Error obteniendo empresa: ${res.status}`);
  }
  return res.json();
}

// Guarda la configuración de la empresa activa (sección Configuración).
export async function actualizarEmpresa(
  data: Record<string, unknown>
): Promise<{ ok: boolean; company_id: string; updated: string[] }> {
  const res = await apiFetch(API_URLS.actualizar_empresa, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(`Error guardando configuración: ${await res.text()}`);
  }
  return res.json();
}

export interface Usuario {
  uid: string;
  email: string;
  nombre: string;
  photo_url?: string;
}

export async function listarUsuarios(): Promise<{ usuarios: Usuario[]; total: number }> {
  const res = await apiFetch(API_URLS.listar_usuarios);
  if (!res.ok) throw new Error("Error listando usuarios");
  return res.json();
}

export async function misSolicitudes(
  email: string
): Promise<{ solicitudes: SolicitudListItem[]; total: number }> {
  const res = await apiFetch(`${API_URLS.mis_solicitudes}?email=${email}`);
  if (!res.ok) throw new Error("Error fetching mis solicitudes");
  return res.json();
}

// Malla types
export interface MallaItem {
  id: number;
  etapa: string;
  bloque: string;
  objetivo: string;
  tipo_recurso: string;
  recurso: string;
  descripcion: string;
  duracion_min: number;
}

export interface Malla {
  id: string;
  version: number;
  malla: MallaItem[];
  duracion_total: number;
  created_at: string;
  updated_at: string;
  guiones?: Guion[];
  solicitud?: { curso?: { nombre?: string }; solicitante?: { nombre?: string; area?: string } };
  scorm_shell_html?: string;
}

// Malla functions
export async function crearMalla(data: {
  solicitud_id: string;
  curso: Curso;
}): Promise<{ id: string; malla: MallaItem[]; duracion_total: number }> {
  // The API expects flat structure, not nested curso
  const payload = {
    nombre: data.curso.nombre,
    course_type: data.curso.course_type || "compliance",
    audiencia: data.curso.audiencia,
    nivel: data.curso.nivel,
    duracion_min: data.curso.duracion_min,
    objetivo: data.curso.objetivo,
    temas: data.curso.temas,
    requiere_eval: data.curso.requiere_eval,
    documentacion: data.curso.documentacion || "",
  };

  const res = await apiFetch(API_URLS.crear_malla, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Error creating malla: ${error}`);
  }
  return res.json();
}

export async function obtenerMalla(mallaId: string): Promise<Malla> {
  const res = await apiFetch(`${API_URLS.obtener_malla}?id=${mallaId}`);
  if (!res.ok) throw new Error("Error fetching malla");
  return res.json();
}

export async function iterarMalla(
  mallaId: string,
  feedback: string
): Promise<{ id: string; version: number; malla: MallaItem[]; duracion_total: number }> {
  const res = await apiFetch(`${API_URLS.iterar_malla}?id=${mallaId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ feedback }),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Error iterating malla: ${error}`);
  }
  return res.json();
}

export async function guardarMalla(
  mallaId: string,
  malla: MallaItem[]
): Promise<{ id: string; malla: MallaItem[]; duracion_total: number; message: string }> {
  const res = await apiFetch(`${API_URLS.guardar_malla}?id=${mallaId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ malla }),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Error guardando malla: ${error}`);
  }
  return res.json();
}

// Persiste el contenido de un guión (HTML del agente, URLs de audio/video) para que
// sobreviva al recargar. Merge en el servidor. Best-effort desde el caller.
export async function guardarGuion(
  mallaId: string,
  guionId: number,
  contenido: Record<string, unknown>
): Promise<void> {
  const res = await apiFetch(API_URLS.guardar_guion, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ malla_id: mallaId, guion_id: guionId, contenido }),
  });
  if (!res.ok) throw new Error(`Error guardando guion: ${await res.text()}`);
}

// Guiones types
export interface Guion {
  id: number;
  tipo: string;
  bloque: string;
  contenido: {
    texto?: string;
    voiceover?: string;
    puntos_clave?: string[];
    slides?: Array<{ titulo: string; puntos?: string[]; bullets?: string[] }>;
    preguntas?: Array<{ pregunta: string; opciones: string[]; correcta: number }>;
    items?: Array<{ frente: string; reverso: string }>;
    duracion_estimada?: number;
    // HTML editado por el Modo Agente. Si está presente, es la fuente de verdad
    // visual del recurso (lo que se previsualiza y empaqueta); el resto del JSON
    // (voiceover, etc.) sigue vivo para la generación de audio/video.
    html?: string;
    [key: string]: unknown;
  };
}

// Guiones functions
export async function generarGuiones(
  mallaId: string
): Promise<{ malla_id: string; guiones: Guion[] }> {
  const res = await apiFetch(`${API_URLS.generar_guiones}?id=${mallaId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Error generating guiones: ${error}`);
  }
  return res.json();
}

// Content generation types
export interface ContentJob {
  job_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  type: "audio" | "video";
  resource_id: number;
  output_url?: string;
  error?: string;
  created_at: string;
  updated_at?: string;
}

// Content generation functions
export async function generarAudio(
  mallaId: string,
  guionId: number,
  texto: string
): Promise<{ job_id: string; status: string }> {
  const res = await apiFetch(`${API_URLS.generar_audio}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ malla_id: mallaId, guion_id: guionId, texto }),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Error generating audio: ${error}`);
  }
  return res.json();
}

export async function generarVideo(
  mallaId: string,
  guionId: number,
  audioUrl: string
): Promise<{ job_id: string; status: string }> {
  const res = await apiFetch(`${API_URLS.generar_video}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ malla_id: mallaId, guion_id: guionId, audio_url: audioUrl }),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Error generating video: ${error}`);
  }
  return res.json();
}

export async function obtenerJob(jobId: string): Promise<ContentJob> {
  // El endpoint espera ?id= (no job_id).
  const res = await apiFetch(`${API_URLS.obtener_job}?id=${jobId}`);
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Error fetching job: ${error}`);
  }
  const data = await res.json();
  // El backend guarda la URL como result_url; el frontend usa output_url.
  return { ...data, output_url: data.output_url ?? data.result_url };
}

// Status helpers
export const STATUS_CONFIG: Record<SolicitudStatus, { label: string; color: string; emoji: string }> = {
  pendiente: { label: "Pendiente", color: "bg-yellow-100 text-yellow-800", emoji: "🟡" },
  en_revision: { label: "En revisión", color: "bg-blue-100 text-blue-800", emoji: "🔵" },
  devuelto: { label: "Devuelto", color: "bg-orange-100 text-orange-800", emoji: "🟠" },
  aprobado: { label: "Aprobado", color: "bg-green-100 text-green-800", emoji: "🟢" },
  rechazado: { label: "Rechazado", color: "bg-red-100 text-red-800", emoji: "🔴" },
  en_proceso: { label: "En proceso", color: "bg-indigo-100 text-indigo-800", emoji: "🔷" },
  completado: { label: "Completado", color: "bg-emerald-100 text-emerald-800", emoji: "✅" },
};

export const PRIORIDAD_CONFIG: Record<string, { label: string; color: string }> = {
  alta: { label: "Alta", color: "bg-red-100 text-red-800" },
  media: { label: "Media", color: "bg-yellow-100 text-yellow-800" },
  baja: { label: "Baja", color: "bg-green-100 text-green-800" },
};

export const COURSE_TYPE_CONFIG: Record<CourseType, { label: string; description: string }> = {
  compliance: {
    label: "Compliance crítico",
    description: "Normativa, riesgo y decisiones correctas",
  },
  onboarding: {
    label: "Onboarding",
    description: "Integración, contexto y primeras tareas",
  },
  proceso_sistema: {
    label: "Proceso / Sistema",
    description: "Paso a paso operativo y reducción de errores",
  },
  habilidades_blandas: {
    label: "Habilidades blandas",
    description: "Conversaciones, criterio y comportamiento",
  },
  producto_ventas: {
    label: "Producto / Ventas",
    description: "Propuesta de valor, objeciones y cierre",
  },
};
