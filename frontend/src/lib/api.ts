/**
 * API Client for Firebase Cloud Functions
 */

const API_BASE = "https://us-central1-davivienda-elearning.cloudfunctions.net";

// API URLs
const API_URLS = {
  // Solicitudes
  crear_solicitud: `${API_BASE}/crear_solicitud`,
  listar_solicitudes: `${API_BASE}/listar_solicitudes`,
  obtener_solicitud: `${API_BASE}/obtener_solicitud`,
  actualizar_solicitud: `${API_BASE}/actualizar_solicitud`,
  agregar_comentario: `${API_BASE}/agregar_comentario`,
  mis_solicitudes: `${API_BASE}/mis_solicitudes`,
  // Mallas
  crear_malla: "https://crear-malla-elrtzny3ba-uc.a.run.app",
  obtener_malla: "https://obtener-malla-elrtzny3ba-uc.a.run.app",
  iterar_malla: "https://iterar-malla-endpoint-elrtzny3ba-uc.a.run.app",
  generar_guiones: "https://generar-guiones-endpoint-elrtzny3ba-uc.a.run.app",
  // Audio/Video
  generar_audio: "https://generar-audio-endpoint-elrtzny3ba-uc.a.run.app",
  generar_video: "https://generar-video-endpoint-elrtzny3ba-uc.a.run.app",
  obtener_job: "https://obtener-job-elrtzny3ba-uc.a.run.app",
  // Health
  health: "https://health-elrtzny3ba-uc.a.run.app",
};

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
  const res = await fetch(url);
  if (!res.ok) throw new Error("Error fetching solicitudes");
  return res.json();
}

export async function obtenerSolicitud(id: string): Promise<Solicitud> {
  const res = await fetch(`${API_URLS.obtener_solicitud}?id=${id}`);
  if (!res.ok) throw new Error("Error fetching solicitud");
  return res.json();
}

export async function crearSolicitud(data: {
  solicitante: Solicitante;
  curso: Curso;
  prioridad?: "alta" | "media" | "baja";
}): Promise<{ id: string; status: string; message: string }> {
  const res = await fetch(API_URLS.crear_solicitud, {
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
  const res = await fetch(`${API_URLS.actualizar_solicitud}?id=${id}`, {
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
  autor: { email: string; nombre: string; rol: string }
): Promise<{ id: string; solicitud_id: string; message: string }> {
  const res = await fetch(`${API_URLS.agregar_comentario}?id=${solicitudId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texto, autor }),
  });
  if (!res.ok) throw new Error("Error adding comment");
  return res.json();
}

export async function misSolicitudes(
  email: string
): Promise<{ solicitudes: SolicitudListItem[]; total: number }> {
  const res = await fetch(`${API_URLS.mis_solicitudes}?email=${email}`);
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

  const res = await fetch(API_URLS.crear_malla, {
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
  const res = await fetch(`${API_URLS.obtener_malla}?id=${mallaId}`);
  if (!res.ok) throw new Error("Error fetching malla");
  return res.json();
}

export async function iterarMalla(
  mallaId: string,
  feedback: string
): Promise<{ id: string; version: number; malla: MallaItem[]; duracion_total: number }> {
  const res = await fetch(`${API_URLS.iterar_malla}?id=${mallaId}`, {
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
    [key: string]: unknown;
  };
}

// Guiones functions
export async function generarGuiones(
  mallaId: string
): Promise<{ malla_id: string; guiones: Guion[] }> {
  const res = await fetch(`${API_URLS.generar_guiones}?id=${mallaId}`, {
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
  const res = await fetch(`${API_URLS.generar_audio}`, {
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
  const res = await fetch(`${API_URLS.generar_video}`, {
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
  const res = await fetch(`${API_URLS.obtener_job}?job_id=${jobId}`);
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Error fetching job: ${error}`);
  }
  return res.json();
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
