"use client";

/**
 * Templates de diseño instruccional (multi-tenant).
 *
 * Definen CÓMO se arma la primera malla: enfoque, estructura, mix de recursos
 * y gamificación. Los globales vienen de la plataforma (solo superadmin los
 * edita); cada empresa puede crear los suyos. La IA elige uno según la
 * solicitud (campo "cuándo usarlo") y el humano valida antes de generar.
 */

import { useEffect, useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import {
  guardarTemplate,
  listarTemplates,
  type MallaTemplate,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const inputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none";
const labelCls = "mb-1 block text-sm font-medium text-gray-700";
const hintCls = "mt-1 text-xs text-gray-400";

const EMPTY: Partial<MallaTemplate> = {
  nombre: "",
  descripcion: "",
  focus: "",
  estructura: ["", "", "", ""],
  resource_mix: "",
  gamification: "",
};

export default function TemplatesPage() {
  const { company, miEmpresa } = useCompany();
  const isSuperadmin = Boolean(miEmpresa?.is_superadmin);

  const [templates, setTemplates] = useState<MallaTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<MallaTemplate> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await listarTemplates();
      setTemplates(r.templates);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error cargando templates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const canEdit = (t: MallaTemplate) =>
    t.company_id !== null || isSuperadmin;

  const startDuplicate = (t: MallaTemplate) => {
    setEditing({
      ...EMPTY,
      nombre: `${t.nombre} (${company.nombre})`,
      descripcion: t.descripcion,
      focus: t.focus,
      estructura: [...t.estructura],
      resource_mix: t.resource_mix,
      gamification: t.gamification,
    });
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      await guardarTemplate({
        ...editing,
        estructura: (editing.estructura || []).filter((s) => s.trim()),
      });
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error guardando");
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (t: MallaTemplate) => {
    if (!confirm(`¿Desactivar el template "${t.nombre}"? No aparecerá más como opción.`)) return;
    try {
      await guardarTemplate({ ...t, activo: false });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  };

  const setE = (k: string, v: unknown) =>
    setEditing((e) => ({ ...(e || EMPTY), [k]: v }));

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Templates</h1>
          <p className="text-gray-500">
            Cómo se arma la primera malla de cada curso. La IA sugiere el template
            según la solicitud y vos validás antes de generar.
          </p>
        </div>
        <Button className="bg-brand hover:bg-brand/90" onClick={() => setEditing({ ...EMPTY })}>
          + Nuevo template
        </Button>
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {/* Editor */}
      {editing && (
        <Card className="border-2 border-brand/40">
          <CardHeader>
            <CardTitle>{editing.id ? `Editar: ${editing.nombre}` : "Nuevo template"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={labelCls}>Nombre</label>
              <input className={inputCls} value={editing.nombre || ""} onChange={(e) => setE("nombre", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Cuándo usarlo</label>
              <input className={inputCls} value={editing.descripcion || ""} placeholder="Ej: cursos de normativa donde equivocarse tiene consecuencias…" onChange={(e) => setE("descripcion", e.target.value)} />
              <p className={hintCls}>La IA elige el template leyendo esta descripción — sé específico</p>
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Enfoque didáctico</label>
              <input className={inputCls} value={editing.focus || ""} placeholder="Ej: mitigación de riesgo, cumplimiento y decisiones correctas" onChange={(e) => setE("focus", e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Estructura (etapas del curso, en orden)</label>
              <div className="space-y-2">
                {(editing.estructura || []).map((paso, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-6 text-center text-xs font-bold text-gray-400">{i + 1}</span>
                    <input
                      className={inputCls}
                      value={paso}
                      placeholder={`Etapa ${i + 1}`}
                      onChange={(e) => {
                        const est = [...(editing.estructura || [])];
                        est[i] = e.target.value;
                        setE("estructura", est);
                      }}
                    />
                  </div>
                ))}
              </div>
              {(editing.estructura || []).length < 6 && (
                <button
                  className="mt-2 text-sm text-brand hover:underline"
                  onClick={() => setE("estructura", [...(editing.estructura || []), ""])}
                >
                  + Agregar etapa
                </button>
              )}
            </div>
            <div>
              <label className={labelCls}>Mix de recursos</label>
              <input className={inputCls} value={editing.resource_mix || ""} placeholder="Ej: priorizar Comparador + Caso práctico + Quiz" onChange={(e) => setE("resource_mix", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Gamificación</label>
              <input className={inputCls} value={editing.gamification || ""} placeholder="Ej: baja, centrada en feedback claro" onChange={(e) => setE("gamification", e.target.value)} />
            </div>
            <div className="flex gap-2 md:col-span-2">
              <Button onClick={handleSave} disabled={saving || !editing.nombre?.trim()} className="bg-brand hover:bg-brand/90">
                {saving ? "Guardando…" : "Guardar template"}
              </Button>
              <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista */}
      {loading ? (
        <p className="text-gray-400">Cargando templates…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {templates.map((t) => (
            <Card key={t.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  {t.nombre}
                  {t.company_id === null ? (
                    <Badge variant="outline" className="text-xs">Global</Badge>
                  ) : (
                    <Badge className="bg-brand/10 text-brand text-xs">{company.nombre}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-2 text-sm">
                <p className="text-gray-600">{t.descripcion}</p>
                <ol className="ml-4 list-decimal text-xs text-gray-500">
                  {t.estructura.map((p, i) => <li key={i}>{p}</li>)}
                </ol>
                <p className="text-xs text-gray-400">🎛 {t.resource_mix}</p>
                <div className="mt-auto flex gap-2 pt-2">
                  {canEdit(t) && (
                    <Button size="sm" variant="outline" onClick={() => setEditing({ ...t })}>
                      Editar
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => startDuplicate(t)}>
                    Duplicar para {company.nombre}
                  </Button>
                  {canEdit(t) && t.company_id !== null && (
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleDeactivate(t)}>
                      Desactivar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
