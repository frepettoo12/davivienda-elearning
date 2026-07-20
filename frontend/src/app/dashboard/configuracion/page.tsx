"use client";

/**
 * Configuración de la empresa activa (multi-tenant): branding / look & feel,
 * identidad para la IA, organización, generación de contenido y acceso.
 *
 * El equipo Learning edita todo menos los dominios de acceso (solo superadmin).
 * Al guardar se recarga la página para que el theming nuevo aplique en todo.
 */

import { useEffect, useRef, useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { actualizarEmpresa, probarLms, subirLogo } from "@/lib/api";
import { ALLOWED_FONTS } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const VOICES = [
  { id: "JddqVF50ZSIR7SRbJE6u", label: "Valeria — casual, conversacional" },
  { id: "SplyIQAjgy4DKGAnOrHi", label: "Clau — profesional, neutral" },
  { id: "a0MaQpDjx7p7bZmqzFp1", label: "Gaby — joven, energética" },
];

const AVATARS = [
  { id: "Hada_LivelyGestures_Front_public", label: "Hada — gestos animados" },
  { id: "Annie_Business_Casual_Standing_Front_public", label: "Annie — business casual" },
  { id: "Caroline_Office_Standing_Front_public", label: "Caroline — corporativo" },
];

const inputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none";
const labelCls = "mb-1 block text-sm font-medium text-gray-700";
const hintCls = "mt-1 text-xs text-gray-400";

export default function ConfiguracionPage() {
  const { miEmpresa, loading } = useCompany();
  const isSuperadmin = Boolean(miEmpresa?.is_superadmin);

  const [form, setForm] = useState({
    nombre: "",
    nombre_display: "",
    color_primario: "#DA291C",
    color_acento: "#FFD700",
    logo_url: "",
    fuente_titulos: "Montserrat",
    fuente_texto: "Open Sans",
    industria: "",
    descripcion_prompt: "",
    areas: "",
    lms_nombre: "",
    voice_id: VOICES[0].id,
    avatar_id: AVATARS[0].id,
    passing_score: 70,
    email_from_name: "",
    app_url: "",
    dominios: "",
    learning_domains: "",
    lms_base_url: "",
    lms_token: "",
    lms_categoria: "",
    ai_mode: "max_local",
    ai_api_key: "",
    ai_budget: "",
  });
  const [aiKeyGuardada, setAiKeyGuardada] = useState(false);
  const [aiSpent, setAiSpent] = useState(0);
  const [lmsTokenGuardado, setLmsTokenGuardado] = useState(false);
  const [probandoLms, setProbandoLms] = useState(false);
  const [lmsResultado, setLmsResultado] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError("El logo no puede superar 2 MB");
      return;
    }
    setUploadingLogo(true);
    setError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      // Sube a Storage y persiste branding.logo_url en el backend.
      const url = await subirLogo(dataUrl);
      set("logo_url", url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error subiendo el logo");
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Cargar el formulario desde la config actual de la empresa activa.
  useEffect(() => {
    if (!miEmpresa?.company_id) return;
    const b = miEmpresa.branding || {};
    setForm({
      nombre: miEmpresa.nombre || "",
      nombre_display: b.nombre_display || "",
      color_primario: b.color_primario || "#DA291C",
      color_acento: b.color_acento || "#FFD700",
      logo_url: b.logo_url || "",
      fuente_titulos: b.fuente_titulos || "Montserrat",
      fuente_texto: b.fuente_texto || "Open Sans",
      industria: miEmpresa.industria || "",
      descripcion_prompt: miEmpresa.descripcion_prompt || "",
      areas: (miEmpresa.areas || []).join(", "),
      lms_nombre: miEmpresa.lms_nombre || "",
      voice_id: miEmpresa.defaults?.voice_id || VOICES[0].id,
      avatar_id: miEmpresa.defaults?.avatar_id || AVATARS[0].id,
      passing_score: miEmpresa.defaults?.passing_score ?? 70,
      email_from_name: miEmpresa.email?.from_name || "",
      app_url: miEmpresa.app_url || "",
      dominios: (miEmpresa.dominios || []).join(", "),
      learning_domains: (miEmpresa.learning_domains || []).join(", "),
      lms_base_url: miEmpresa.lms_integration?.base_url || "",
      lms_token: "",
      lms_categoria: miEmpresa.lms_integration?.categoria_id?.toString() || "",
      ai_mode: miEmpresa.ai_billing?.mode || "max_local",
      ai_api_key: "",
      ai_budget: miEmpresa.ai_billing?.budget_usd != null ? String(miEmpresa.ai_billing.budget_usd) : "",
    });
    setLmsTokenGuardado(Boolean(miEmpresa.lms_integration?.token_configurado));
    setAiKeyGuardada(Boolean(miEmpresa.ai_billing?.api_key_configurada));
    setAiSpent(miEmpresa.ai_billing?.spent_usd || 0);
  }, [miEmpresa]);

  const handleProbarLms = async () => {
    setProbandoLms(true);
    setLmsResultado(null);
    try {
      // Con token nuevo tipeado se prueba ese; si no, el guardado en el backend.
      const r = await probarLms(
        form.lms_token
          ? { base_url: form.lms_base_url, token: form.lms_token }
          : undefined
      );
      setLmsResultado(
        `✓ Conectado a "${r.sitio}" (${r.version}) como ${r.usuario}. ` +
        (r.puede_crear_cursos ? "El token puede crear cursos." : "⚠ El token NO puede crear cursos — revisá sus permisos.")
      );
    } catch (e) {
      setLmsResultado(`✗ ${e instanceof Error ? e.message : "Error de conexión"}`);
    } finally {
      setProbandoLms(false);
    }
  };

  const set = (k: string, v: string | number) => {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  };

  const splitList = (s: string) =>
    s.split(",").map((x) => x.trim()).filter(Boolean);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        nombre: form.nombre,
        branding: {
          nombre_display: form.nombre_display,
          color_primario: form.color_primario,
          color_acento: form.color_acento,
          logo_url: form.logo_url,
          fuente_titulos: form.fuente_titulos,
          fuente_texto: form.fuente_texto,
        },
        industria: form.industria,
        descripcion_prompt: form.descripcion_prompt,
        areas: splitList(form.areas),
        lms_nombre: form.lms_nombre,
        defaults: {
          voice_id: form.voice_id,
          avatar_id: form.avatar_id,
          passing_score: form.passing_score,
        },
        email: { from_name: form.email_from_name },
        app_url: form.app_url,
      };
      // Integración LMS: solo se manda si hay URL; el token viaja solo si se
      // tipeó uno nuevo (vacío = conservar el guardado).
      if (form.lms_base_url.trim()) {
        payload.lms_integration = {
          tipo: "moodle",
          base_url: form.lms_base_url.trim(),
          ...(form.lms_token ? { token: form.lms_token } : {}),
          ...(form.lms_categoria ? { categoria_id: parseInt(form.lms_categoria) } : {}),
        };
      }
      // Facturación de IA: mode + key (si se tipeó una nueva); budget solo superadmin.
      const ai: Record<string, unknown> = { mode: form.ai_mode };
      if (form.ai_api_key.trim()) ai.anthropic_api_key = form.ai_api_key.trim();
      if (isSuperadmin && form.ai_budget.trim()) ai.budget_usd = parseFloat(form.ai_budget);
      payload.ai_billing = ai;

      if (isSuperadmin) {
        payload.dominios = splitList(form.dominios);
        payload.learning_domains = splitList(form.learning_domains);
      }
      await actualizarEmpresa(payload);
      setSaved(true);
      // Recargar para que el branding nuevo aplique en toda la app.
      try {
        localStorage.removeItem("companyBrand");
      } catch {}
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !miEmpresa) {
    return <div className="p-8 text-gray-500">Cargando configuración…</div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Configuración</h1>
        <p className="text-gray-500">
          Branding, look &amp; feel y parámetros de {miEmpresa.nombre}
        </p>
      </div>

      {/* Marca / look & feel */}
      <Card>
        <CardHeader>
          <CardTitle>🎨 Marca y look &amp; feel</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={labelCls}>Nombre de la empresa</label>
            <input className={inputCls} value={form.nombre} onChange={(e) => set("nombre", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Nombre para mostrar</label>
            <input className={inputCls} value={form.nombre_display} placeholder={`${form.nombre} E-Learning`} onChange={(e) => set("nombre_display", e.target.value)} />
            <p className={hintCls}>Encabezados, títulos de recursos y emails</p>
          </div>
          <div>
            <label className={labelCls}>Color primario</label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.color_primario} onChange={(e) => set("color_primario", e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-gray-300" />
              <input className={inputCls} value={form.color_primario} onChange={(e) => set("color_primario", e.target.value)} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Color de acento</label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.color_acento} onChange={(e) => set("color_acento", e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-gray-300" />
              <input className={inputCls} value={form.color_acento} onChange={(e) => set("color_acento", e.target.value)} />
            </div>
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Logo</label>
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => handleLogoFile(e.target.files?.[0])}
              />
              <Button
                type="button"
                variant="outline"
                disabled={uploadingLogo}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadingLogo ? "Subiendo…" : "📁 Subir logo"}
              </Button>
              <input className={inputCls} value={form.logo_url} placeholder="o pegá una URL https://…/logo.png" onChange={(e) => set("logo_url", e.target.value)} />
              {form.logo_url && /^(https?:|data:)/.test(form.logo_url) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.logo_url} alt="logo" className="h-10 w-16 rounded border object-contain" />
              )}
            </div>
            <p className={hintCls}>PNG/JPG/WEBP/SVG hasta 2 MB. Se usa arriba a la izquierda del dashboard y en el contenido generado (recursos, videos, SCORM)</p>
          </div>
          <div>
            <label className={labelCls}>Fuente de títulos</label>
            <select className={inputCls} value={form.fuente_titulos} onChange={(e) => set("fuente_titulos", e.target.value)}>
              {ALLOWED_FONTS.map((f) => <option key={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Fuente de texto</label>
            <select className={inputCls} value={form.fuente_texto} onChange={(e) => set("fuente_texto", e.target.value)}>
              {ALLOWED_FONTS.map((f) => <option key={f}>{f}</option>)}
            </select>
          </div>
          {/* Preview en vivo del look */}
          <div className="md:col-span-2 rounded-lg border p-4" style={{ background: "linear-gradient(135deg,#1a1a2e,#16213e)" }}>
            <div className="mb-2 h-2 w-16 rounded" style={{ background: form.color_primario }} />
            <p className="text-lg font-bold text-white" style={{ fontFamily: form.fuente_titulos }}>
              Así se ve un título en el contenido
            </p>
            <p className="text-sm text-gray-300" style={{ fontFamily: form.fuente_texto }}>
              Y así el texto, con acentos en <span style={{ color: form.color_acento }}>este color</span>.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Identidad para la IA */}
      <Card>
        <CardHeader>
          <CardTitle>🤖 Identidad para la IA</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={labelCls}>Industria</label>
            <input className={inputCls} value={form.industria} placeholder="banca colombiana" onChange={(e) => set("industria", e.target.value)} />
            <p className={hintCls}>Los guiones usan ejemplos relevantes para esta industria</p>
          </div>
          <div>
            <label className={labelCls}>Descripción de la empresa</label>
            <input className={inputCls} value={form.descripcion_prompt} placeholder="banco colombiano líder en…" onChange={(e) => set("descripcion_prompt", e.target.value)} />
            <p className={hintCls}>Contexto que recibe la IA al generar mallas y guiones</p>
          </div>
        </CardContent>
      </Card>

      {/* Organización */}
      <Card>
        <CardHeader>
          <CardTitle>🏢 Organización</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className={labelCls}>Áreas (separadas por coma)</label>
            <input className={inputCls} value={form.areas} placeholder="Operaciones, Tecnología, …" onChange={(e) => set("areas", e.target.value)} />
            <p className={hintCls}>Opciones del formulario de solicitud de cursos</p>
          </div>
          <div>
            <label className={labelCls}>LMS destino</label>
            <input className={inputCls} value={form.lms_nombre} placeholder="Territorium, Moodle, …" onChange={(e) => set("lms_nombre", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>URL del frontend (links en emails)</label>
            <input className={inputCls} value={form.app_url} placeholder="https://ai-learning-studio.web.app" onChange={(e) => set("app_url", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Generación de contenido */}
      <Card>
        <CardHeader>
          <CardTitle>🎬 Generación de contenido</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <label className={labelCls}>Voz (ElevenLabs)</label>
            <select className={inputCls} value={form.voice_id} onChange={(e) => set("voice_id", e.target.value)}>
              {VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Avatar (HeyGen)</label>
            <select className={inputCls} value={form.avatar_id} onChange={(e) => set("avatar_id", e.target.value)}>
              {AVATARS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Puntaje de aprobación (%)</label>
            <input type="number" min={0} max={100} className={inputCls} value={form.passing_score} onChange={(e) => set("passing_score", parseInt(e.target.value) || 0)} />
            <p className={hintCls}>Mínimo para aprobar los quizzes del SCORM</p>
          </div>
        </CardContent>
      </Card>

      {/* Emails */}
      <Card>
        <CardHeader>
          <CardTitle>✉️ Notificaciones</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={labelCls}>Nombre del remitente</label>
            <input className={inputCls} value={form.email_from_name} placeholder={`${form.nombre} E-Learning`} onChange={(e) => set("email_from_name", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Integración LMS (push directo) */}
      <Card>
        <CardHeader>
          <CardTitle>🔗 Integración LMS — publicación directa</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <label className={labelCls}>Tipo</label>
            <select className={inputCls} value="moodle" disabled>
              <option value="moodle">Moodle (web services)</option>
            </select>
            <p className={hintCls}>Otros LMS: próximamente</p>
          </div>
          <div>
            <label className={labelCls}>URL de tu Moodle</label>
            <input className={inputCls} value={form.lms_base_url} placeholder="https://moodle.tuempresa.com" onChange={(e) => set("lms_base_url", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Token de web services</label>
            <input
              type="password"
              className={inputCls}
              value={form.lms_token}
              placeholder={lmsTokenGuardado ? "•••••• (guardado — tipeá para reemplazar)" : "token del servicio REST"}
              onChange={(e) => set("lms_token", e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Categoría de cursos (ID)</label>
            <input className={inputCls} value={form.lms_categoria} placeholder="1 (Miscellaneous)" onChange={(e) => set("lms_categoria", e.target.value)} />
            <p className={hintCls}>En qué categoría de Moodle se crean los cursos</p>
          </div>
          <div className="flex items-end gap-2 md:col-span-2">
            <Button variant="outline" onClick={handleProbarLms} disabled={probandoLms || (!form.lms_base_url.trim())}>
              {probandoLms ? "Probando…" : "⚡ Probar conexión"}
            </Button>
            {lmsResultado && (
              <p className={`text-sm ${lmsResultado.startsWith("✓") ? "text-green-600" : "text-red-600"}`}>{lmsResultado}</p>
            )}
          </div>
          <div className="md:col-span-3 rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
            Requisitos en tu Moodle (una vez, como admin): habilitar <b>servicios web</b> y el
            protocolo <b>REST</b> (Administración del sitio → Funciones avanzadas / Plugins →
            Servicios web), y crear un <b>token</b> para un usuario con permiso de crear cursos.
            El token se guarda en el backend y nunca vuelve al navegador.
          </div>
        </CardContent>
      </Card>

      {/* IA del agente — facturación */}
      <Card>
        <CardHeader>
          <CardTitle>🧠 IA del agente — facturación</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className={labelCls}>Cómo se paga la generación con IA</label>
            <select className={inputCls} value={form.ai_mode} onChange={(e) => set("ai_mode", e.target.value)}>
              <option value="max_local">Local (suscripción del CLI) — solo desarrollo local</option>
              <option value="byok">API key propia (BYOK) — la empresa paga sus tokens</option>
              <option value="platform">Plataforma — usamos nuestra key + budget</option>
            </select>
            <p className={hintCls}>
              &quot;Local&quot; solo anda corriendo el agent-service en tu máquina. Para producción: BYOK o Plataforma.
            </p>
          </div>

          {form.ai_mode === "byok" && (
            <div className="md:col-span-2">
              <label className={labelCls}>API key de Anthropic</label>
              <input
                type="password"
                className={inputCls}
                value={form.ai_api_key}
                placeholder={aiKeyGuardada ? "•••••• (guardada — tipeá para reemplazar)" : "sk-ant-..."}
                onChange={(e) => set("ai_api_key", e.target.value)}
              />
              <p className={hintCls}>Se guarda en el backend y nunca vuelve al navegador. La empresa paga su consumo directo a Anthropic.</p>
            </div>
          )}

          {form.ai_mode === "platform" && (
            <>
              <div>
                <label className={labelCls}>
                  Budget mensual (US$) {!isSuperadmin && <span className="font-normal text-gray-400">(solo superadmin)</span>}
                </label>
                <input
                  className={inputCls}
                  value={form.ai_budget}
                  disabled={!isSuperadmin}
                  placeholder="ej. 50"
                  onChange={(e) => set("ai_budget", e.target.value)}
                />
                <p className={hintCls}>Al alcanzarlo se bloquean nuevas generaciones hasta el próximo mes.</p>
              </div>
              <div>
                <label className={labelCls}>Gasto este mes</label>
                <div className="rounded-lg border border-gray-200 p-2.5">
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold">US${aiSpent.toFixed(2)}</span>
                    <span className="text-gray-400">{form.ai_budget ? `de US$${form.ai_budget}` : "sin límite"}</span>
                  </div>
                  {form.ai_budget && (
                    <div className="mt-1 h-2 w-full rounded-full bg-gray-100">
                      <div
                        className="h-2 rounded-full bg-brand"
                        style={{ width: `${Math.min(100, (aiSpent / (parseFloat(form.ai_budget) || 1)) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500 md:col-span-2">
            Generar un recurso con el agente cuesta ~US$0.70 (Sonnet, modo optimizado). En modo
            <b> Plataforma</b> el gasto se acumula por empresa y se corta al llegar al budget.
          </div>
        </CardContent>
      </Card>

      {/* Acceso — solo superadmin */}
      <Card className={isSuperadmin ? "" : "opacity-60"}>
        <CardHeader>
          <CardTitle>🔐 Acceso {!isSuperadmin && <span className="text-sm font-normal text-gray-400">(solo superadmin)</span>}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={labelCls}>Dominios de email (separados por coma)</label>
            <input className={inputCls} value={form.dominios} disabled={!isSuperadmin} onChange={(e) => set("dominios", e.target.value)} />
            <p className={hintCls}>Quién puede entrar y cae en esta empresa al loguearse</p>
          </div>
          <div>
            <label className={labelCls}>Dominios del equipo Learning</label>
            <input className={inputCls} value={form.learning_domains} disabled={!isSuperadmin} onChange={(e) => set("learning_domains", e.target.value)} />
            <p className={hintCls}>Subset con acceso al dashboard (el resto son solicitantes)</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 pb-8">
        <Button onClick={handleSave} disabled={saving} className="bg-brand hover:bg-brand/90">
          {saving ? "Guardando…" : "Guardar configuración"}
        </Button>
        {saved && <span className="text-sm font-medium text-green-600">✓ Guardado — recargando…</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
