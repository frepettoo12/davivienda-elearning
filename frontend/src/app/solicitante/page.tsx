"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import {
  crearSolicitud,
  intakePreguntas,
  intakeDocumentos,
  subirDocumento,
  type Curso,
  type IntakePregunta,
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DEFAULT_AREAS = [
  "Banca Personal",
  "Banca Empresarial",
  "Banca Corporativa",
  "Operaciones",
  "Tecnología",
  "Recursos Humanos",
  "Cumplimiento",
  "Riesgos",
  "Legal",
  "Marketing",
  "Otro",
];

const NIVELES = ["Básico", "Intermedio", "Avanzado"];
const COURSE_TYPES = [
  { value: "compliance", label: "Compliance crítico" },
  { value: "onboarding", label: "Onboarding" },
  { value: "proceso_sistema", label: "Proceso / Sistema" },
  { value: "habilidades_blandas", label: "Habilidades blandas" },
  { value: "producto_ventas", label: "Producto / Ventas" },
] as const;

export default function NuevaSolicitudPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { company, miEmpresa } = useCompany();
  // Áreas por empresa (companies.areas) con fallback a la taxonomía legacy.
  const AREAS = company.areas?.length ? company.areas : DEFAULT_AREAS;
  const emailPlaceholder = user?.email || "nombre.apellido@empresa.com";
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [excelMsg, setExcelMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Wizard de intake asistido: 1 datos · 2 clarificación IA · 3 documentos IA.
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [iaWorking, setIaWorking] = useState(false);
  const [iaError, setIaError] = useState<string | null>(null);
  const [preguntas, setPreguntas] = useState<IntakePregunta[]>([]);
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const [docsRecom, setDocsRecom] = useState<Array<{ titulo: string; motivo: string }>>([]);
  // Estado por documento marcado: contenido pegado y/o archivo adjunto.
  const [docsSel, setDocsSel] = useState<Record<string, { contenido: string; adjunto_url?: string; adjunto_nombre?: string; subiendo?: boolean }>>({});
  const docFileRef = useRef<HTMLInputElement>(null);
  const [docSubiendoTitulo, setDocSubiendoTitulo] = useState<string | null>(null);

  const cursoActual = (): Curso => ({
    nombre: formData.cursoNombre,
    course_type: formData.courseType,
    audiencia: formData.audiencia,
    nivel: formData.nivel,
    duracion_min: formData.duracionMin,
    objetivo: formData.objetivo,
    temas: formData.temas,
    requiere_eval: formData.requiereEval,
  });

  // Paso 1 → 2: valida los requeridos y pide las preguntas de clarificación.
  const irAClarificacion = async () => {
    if (!formData.nombre || !formData.email || !formData.area || !formData.cursoNombre ||
        !formData.audiencia || !formData.nivel || !formData.objetivo || !formData.temas) {
      setError("Completá todos los campos obligatorios antes de continuar.");
      return;
    }
    setError(null);
    setIaError(null);
    setIaWorking(true);
    try {
      const r = await intakePreguntas(cursoActual());
      setPreguntas(r.preguntas);
      setPaso(2);
    } catch (e) {
      setIaError(e instanceof Error ? e.message : "Error");
      setPreguntas([]);
      setPaso(2); // permitir avanzar aunque la IA falle (resiliencia)
    } finally {
      setIaWorking(false);
    }
  };

  // Paso 2 → 3: pide los documentos recomendados con las respuestas.
  const irADocumentos = async () => {
    setIaError(null);
    setIaWorking(true);
    const clarificaciones = preguntas
      .map((q) => ({ pregunta: q.pregunta, respuesta: (respuestas[q.id] || "").trim() }))
      .filter((c) => c.respuesta);
    try {
      const r = await intakeDocumentos(cursoActual(), clarificaciones);
      setDocsRecom(r.documentos);
      setPaso(3);
    } catch (e) {
      setIaError(e instanceof Error ? e.message : "Error");
      setDocsRecom([]);
      setPaso(3);
    } finally {
      setIaWorking(false);
    }
  };

  const toggleDoc = (titulo: string) => {
    setDocsSel((prev) => {
      const next = { ...prev };
      if (next[titulo]) delete next[titulo];
      else next[titulo] = { contenido: "" };
      return next;
    });
  };

  const onSubirArchivoDoc = async (titulo: string, file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setIaError("El archivo no puede superar 5 MB"); return; }
    setDocsSel((prev) => ({ ...prev, [titulo]: { ...(prev[titulo] || { contenido: "" }), subiendo: true } }));
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result));
        fr.onerror = () => rej(fr.error);
        fr.readAsDataURL(file);
      });
      const up = await subirDocumento(dataUrl, file.name);
      // TXT: además leer el texto para que alimente a la IA.
      let contenidoTxt = "";
      if (file.type === "text/plain") contenidoTxt = await file.text();
      setDocsSel((prev) => ({
        ...prev,
        [titulo]: {
          contenido: contenidoTxt || prev[titulo]?.contenido || "",
          adjunto_url: up.url,
          adjunto_nombre: up.nombre,
          subiendo: false,
        },
      }));
    } catch (e) {
      setIaError(e instanceof Error ? e.message : "Error subiendo el archivo");
      setDocsSel((prev) => ({ ...prev, [titulo]: { ...(prev[titulo] || { contenido: "" }), subiendo: false } }));
    }
  };

  const [formData, setFormData] = useState({
    // Solicitante
    nombre: "",
    email: "",
    area: "",
    // Curso
    cursoNombre: "",
    courseType: "compliance" as "compliance" | "onboarding" | "proceso_sistema" | "habilidades_blandas" | "producto_ventas",
    audiencia: "",
    nivel: "",
    duracionMin: 15,
    objetivo: "",
    temas: "",
    requiereEval: true,
    documentacion: "",
    // Meta
    prioridad: "media" as "alta" | "media" | "baja",
  });

  // Prefill nombre/email con la cuenta de Google autenticada (si están vacíos).
  useEffect(() => {
    if (!user) return;
    setFormData((prev) => ({
      ...prev,
      nombre: prev.nombre || user.displayName || "",
      email: prev.email || user.email || "",
    }));
  }, [user]);

  // Columnas del template Excel (orden y nombres de cabecera)
  const EXCEL_COLUMNS = [
    "nombre", "email", "area", "nombre_curso", "tipo_curso", "audiencia",
    "nivel", "duracion_min", "requiere_evaluacion", "prioridad", "objetivo",
    "temas", "documentacion",
  ];

  const downloadTemplate = () => {
    const ejemplo = {
      nombre: "Juan Pérez",
      email: "juan.perez@empresa.com",
      area: "Cumplimiento",
      nombre_curso: "FATCA y CRS para Asesores",
      tipo_curso: "compliance",
      audiencia: "Asesores comerciales",
      nivel: "Intermedio",
      duracion_min: 15,
      requiere_evaluacion: "si",
      prioridad: "media",
      objetivo: "Al finalizar, el participante podrá identificar clientes sujetos a FATCA y CRS.",
      temas: "Qué es FATCA; Qué es CRS; Identificación de clientes; Documentación requerida",
      documentacion: "",
    };
    // Hoja de datos + hoja de ayuda con valores válidos
    const ws = XLSX.utils.json_to_sheet([ejemplo], { header: EXCEL_COLUMNS });
    const ayuda = XLSX.utils.aoa_to_sheet([
      ["Campo", "Valores válidos / formato"],
      ["tipo_curso", COURSE_TYPES.map((t) => t.value).join(" | ")],
      ["nivel", NIVELES.join(" | ")],
      ["requiere_evaluacion", "si | no"],
      ["prioridad", "alta | media | baja"],
      ["area", AREAS.join(" | ")],
      ["temas", "Separar cada tema con punto y coma ( ; )"],
      ["duracion_min", "Número de minutos (ej: 15)"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Solicitud");
    XLSX.utils.book_append_sheet(wb, ayuda, "Instrucciones");
    XLSX.writeFile(wb, "template_solicitud_curso.xlsx");
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setExcelMsg(null);
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      if (!rows.length) {
        setError("El Excel no tiene filas de datos.");
        return;
      }
      const r = rows[0];
      const str = (k: string) => String(r[k] ?? "").trim();
      const tipo = str("tipo_curso").toLowerCase();
      const tipoValido = COURSE_TYPES.find((t) => t.value === tipo)?.value || formData.courseType;
      const prio = str("prioridad").toLowerCase();
      const prioValida = (["alta", "media", "baja"].includes(prio) ? prio : "media") as "alta" | "media" | "baja";
      const temasRaw = str("temas");
      const temas = temasRaw.includes(";")
        ? temasRaw.split(";").map((t) => t.trim()).filter(Boolean).join("\n")
        : temasRaw;

      setFormData((prev) => ({
        ...prev,
        nombre: str("nombre") || prev.nombre,
        email: str("email") || prev.email,
        area: str("area") || prev.area,
        cursoNombre: str("nombre_curso") || prev.cursoNombre,
        courseType: tipoValido,
        audiencia: str("audiencia") || prev.audiencia,
        nivel: str("nivel") || prev.nivel,
        duracionMin: parseInt(str("duracion_min")) || prev.duracionMin,
        requiereEval: str("requiere_evaluacion").toLowerCase() !== "no",
        prioridad: prioValida,
        objetivo: str("objetivo") || prev.objetivo,
        temas: temas || prev.temas,
        documentacion: str("documentacion") || prev.documentacion,
      }));
      const extra = rows.length > 1 ? ` (se cargó la 1ª de ${rows.length} filas)` : "";
      setExcelMsg(`✓ Datos cargados desde "${file.name}"${extra}. Revisá y enviá.`);
    } catch (err) {
      setError(`No se pudo leer el Excel: ${err instanceof Error ? err.message : "formato inválido"}`);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      // Empresa del solicitante: la resuelta por el backend, o la de la URL de
      // invitación (?empresa=cliente2) para externos; sin nada, el backend usa
      // el default (davivienda).
      const empresaParam =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("empresa")
          : null;
      const result = await crearSolicitud({
        company_id: miEmpresa?.company_id || empresaParam || undefined,
        solicitante: {
          nombre: formData.nombre,
          email: formData.email,
          area: formData.area,
        },
        curso: {
          nombre: formData.cursoNombre,
          course_type: formData.courseType,
          audiencia: formData.audiencia,
          nivel: formData.nivel,
          duracion_min: formData.duracionMin,
          objetivo: formData.objetivo,
          temas: formData.temas,
          requiere_eval: formData.requiereEval,
          documentacion: formData.documentacion || undefined,
        },
        prioridad: formData.prioridad,
        intake: {
          clarificaciones: preguntas
            .map((q) => ({ pregunta: q.pregunta, respuesta: (respuestas[q.id] || "").trim() }))
            .filter((c) => c.respuesta),
          documentos: docsRecom
            .filter((d) => docsSel[d.titulo])
            .map((d) => ({
              titulo: d.titulo,
              motivo: d.motivo,
              contenido: docsSel[d.titulo].contenido?.trim() || undefined,
              adjunto_url: docsSel[d.titulo].adjunto_url,
              adjunto_nombre: docsSel[d.titulo].adjunto_nombre,
            })),
        },
      });

      setSuccess(true);
      setTimeout(() => {
        router.push("/solicitante/mis-solicitudes");
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear la solicitud");
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="mb-2 text-xl font-semibold text-gray-900">Solicitud enviada</h2>
        <p className="text-gray-500">Redirigiendo a tus solicitudes...</p>
      </div>
    );
  }

  const STEPS = [
    { n: 1, label: "Datos del curso" },
    { n: 2, label: "Clarificación" },
    { n: 3, label: "Documentos" },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Nueva Solicitud de Curso</h1>
        <p className="text-gray-500">La IA te va a ayudar a precisar el pedido antes de enviarlo</p>
      </div>

      {/* Stepper */}
      <div className="mb-6 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.n} className="flex items-center">
            {i > 0 && <div className={`mx-2 h-px w-8 ${paso > s.n - 1 ? "bg-brand" : "bg-gray-200"}`} />}
            <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${
              paso === s.n ? "bg-brand text-white" : paso > s.n ? "text-brand" : "text-gray-400"
            }`}>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold ${
                paso === s.n ? "border-white/60 bg-white/20" : paso > s.n ? "border-brand bg-brand text-white" : "border-gray-300"
              }`}>{paso > s.n ? "✓" : s.n}</span>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {iaError && (
        <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
          ⚠ El asistente de IA no está disponible ({iaError}). Podés continuar sin él.
        </div>
      )}

      {/* Importar desde Excel */}
      {paso === 1 && (
      <Card className="mb-6 border-dashed">
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">📊 Cargar desde Excel</p>
            <p className="text-xs text-gray-500">
              Descargá el template, completalo y subilo para autocompletar el formulario.
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={downloadTemplate}>
              ⬇ Descargar template
            </Button>
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              ⬆ Subir Excel
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleExcelUpload}
            />
          </div>
        </CardContent>
      </Card>
      )}
      {paso === 1 && excelMsg && (
        <div className="mb-6 rounded-lg bg-green-50 p-3 text-sm text-green-700">{excelMsg}</div>
      )}

      <form onSubmit={handleSubmit}>
        {/* ── PASO 1: datos del curso ── */}
        {paso === 1 && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Datos del Solicitante */}
          <Card>
            <CardHeader>
              <CardTitle>Datos del Solicitante</CardTitle>
              <CardDescription>Información de contacto</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Nombre completo *
                </label>
                <Input
                  required
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Juan Pérez"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Email *
                </label>
                <Input
                  required
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder={emailPlaceholder}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Área *
                </label>
                <Select
                  value={formData.area}
                  onValueChange={(value) => setFormData({ ...formData, area: value || "" })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona tu área" />
                  </SelectTrigger>
                  <SelectContent>
                    {AREAS.map((area) => (
                      <SelectItem key={area} value={area}>{area}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Prioridad */}
          <Card>
            <CardHeader>
              <CardTitle>Prioridad</CardTitle>
              <CardDescription>Urgencia de la solicitud</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                {(["baja", "media", "alta"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setFormData({ ...formData, prioridad: p })}
                    className={`rounded-lg border-2 p-4 text-center transition-all ${
                      formData.prioridad === p
                        ? p === "alta"
                          ? "border-red-500 bg-red-50 text-red-700"
                          : p === "media"
                          ? "border-yellow-500 bg-yellow-50 text-yellow-700"
                          : "border-green-500 bg-green-50 text-green-700"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <span className="block text-2xl mb-1">
                      {p === "alta" ? "🔴" : p === "media" ? "🟡" : "🟢"}
                    </span>
                    <span className="text-sm font-medium capitalize">{p}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Datos del Curso */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Datos del Curso</CardTitle>
              <CardDescription>Información sobre el curso solicitado</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Nombre del curso *
                  </label>
                  <Input
                    required
                    value={formData.cursoNombre}
                    onChange={(e) => setFormData({ ...formData, cursoNombre: e.target.value })}
                    placeholder="Ej: FATCA y CRS para Asesores"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Audiencia objetivo *
                  </label>
                  <Input
                    required
                    value={formData.audiencia}
                    onChange={(e) => setFormData({ ...formData, audiencia: e.target.value })}
                    placeholder="Ej: Asesores comerciales"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Tipo de curso *
                  </label>
                  <Select
                    value={formData.courseType}
                    onValueChange={(value) => setFormData({ ...formData, courseType: (value || "compliance") as typeof formData.courseType })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COURSE_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Nivel *
                  </label>
                  <Select
                    value={formData.nivel}
                    onValueChange={(value) => setFormData({ ...formData, nivel: value || "" })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona nivel" />
                    </SelectTrigger>
                    <SelectContent>
                      {NIVELES.map((nivel) => (
                        <SelectItem key={nivel} value={nivel}>{nivel}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Duración (minutos) *
                  </label>
                  <Input
                    required
                    type="number"
                    min={5}
                    max={120}
                    value={formData.duracionMin}
                    onChange={(e) => setFormData({ ...formData, duracionMin: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    ¿Requiere evaluación?
                  </label>
                  <Select
                    value={formData.requiereEval ? "si" : "no"}
                    onValueChange={(value) => setFormData({ ...formData, requiereEval: (value || "si") === "si" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="si">Sí</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Objetivo del curso *
                </label>
                <Textarea
                  required
                  value={formData.objetivo}
                  onChange={(e) => setFormData({ ...formData, objetivo: e.target.value })}
                  placeholder="Al finalizar el curso, el participante será capaz de..."
                  rows={2}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Temas a cubrir *
                </label>
                <Textarea
                  required
                  value={formData.temas}
                  onChange={(e) => setFormData({ ...formData, temas: e.target.value })}
                  placeholder="Lista los temas principales que debe cubrir el curso, uno por línea"
                  rows={4}
                />
              </div>

            </CardContent>
          </Card>
        </div>
        )}

        {/* ── PASO 2: preguntas de clarificación de la IA ── */}
        {paso === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">🤖 Ayudanos a entender mejor el pedido</CardTitle>
              <CardDescription>
                Respondé estas preguntas para que el curso salga preciso. Si no sabés algo, escribí &quot;no sé&quot;.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {preguntas.length === 0 ? (
                <p className="text-sm text-gray-500">
                  La IA no generó preguntas. Podés continuar al paso de documentos.
                </p>
              ) : (
                preguntas.map((q, i) => (
                  <div key={q.id}>
                    <label className="mb-1 block text-sm font-medium text-gray-800">
                      {i + 1}. {q.pregunta}
                    </label>
                    {q.ayuda && <p className="mb-1 text-xs text-gray-400">{q.ayuda}</p>}
                    <Textarea
                      value={respuestas[q.id] || ""}
                      onChange={(e) => setRespuestas((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      rows={2}
                      placeholder="Tu respuesta…"
                    />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}

        {/* ── PASO 3: documentos recomendados ── */}
        {paso === 3 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">📎 Documentos que ayudarían al curso</CardTitle>
              <CardDescription>
                La IA sugiere estos materiales de referencia. Marcá los que tengas y pegá el texto o subí el archivo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {docsRecom.length === 0 ? (
                <p className="text-sm text-gray-500">
                  La IA no sugirió documentos. Podés enviar la solicitud igual.
                </p>
              ) : (
                docsRecom.map((d) => {
                  const sel = docsSel[d.titulo];
                  return (
                    <div key={d.titulo} className={`rounded-lg border p-4 ${sel ? "border-brand/40 bg-brand/5" : ""}`}>
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={Boolean(sel)}
                          onChange={() => toggleDoc(d.titulo)}
                        />
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{d.titulo}</p>
                          <p className="text-sm text-gray-500">{d.motivo}</p>
                        </div>
                      </label>
                      {sel && (
                        <div className="mt-3 space-y-2 pl-7">
                          <Textarea
                            value={sel.contenido}
                            onChange={(e) => setDocsSel((prev) => ({ ...prev, [d.titulo]: { ...prev[d.titulo], contenido: e.target.value } }))}
                            rows={3}
                            placeholder="Pegá el contenido del documento…"
                          />
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={sel.subiendo}
                              onClick={() => { setDocSubiendoTitulo(d.titulo); docFileRef.current?.click(); }}
                            >
                              {sel.subiendo ? "Subiendo…" : "📎 Subir archivo"}
                            </Button>
                            {sel.adjunto_nombre && <span className="text-xs text-green-600">✓ {sel.adjunto_nombre}</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <input
                ref={docFileRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                className="hidden"
                onChange={(e) => { if (docSubiendoTitulo) onSubirArchivoDoc(docSubiendoTitulo, e.target.files?.[0]); if (docFileRef.current) docFileRef.current.value = ""; }}
              />
            </CardContent>
          </Card>
        )}

        {error && (
          <div className="mt-6 rounded-lg bg-red-50 p-4 text-red-700">{error}</div>
        )}

        {/* Botonera del wizard */}
        <div className="mt-6 flex justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => (paso === 1 ? router.push("/solicitante/mis-solicitudes") : setPaso((p) => (p - 1) as 1 | 2 | 3))}
          >
            {paso === 1 ? "Cancelar" : "← Atrás"}
          </Button>
          {paso === 1 && (
            <Button type="button" disabled={iaWorking} onClick={irAClarificacion} className="bg-brand hover:bg-brand/90">
              {iaWorking ? "Analizando…" : "Continuar →"}
            </Button>
          )}
          {paso === 2 && (
            <Button type="button" disabled={iaWorking} onClick={irADocumentos} className="bg-brand hover:bg-brand/90">
              {iaWorking ? "Buscando documentos…" : "Continuar →"}
            </Button>
          )}
          {paso === 3 && (
            <Button type="submit" disabled={submitting} className="bg-brand hover:bg-brand/90">
              {submitting ? (
                <span className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Enviando…
                </span>
              ) : (
                "Enviar Solicitud"
              )}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
