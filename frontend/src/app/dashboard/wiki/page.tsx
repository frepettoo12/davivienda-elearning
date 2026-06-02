"use client";

import { useMemo, useState } from "react";
import {
  INTERACTIVE_SLIDE_OPTIONS,
  INTERACTIVE_SLIDE_WIKI_SOURCES,
} from "@/lib/wiki/interactive-slide-catalog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TOTAL_OPTIONS = INTERACTIVE_SLIDE_OPTIONS.length;

export default function WikiFormatosPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("todas");
  const [complexity, setComplexity] = useState<string>("todas");
  const [mode, setMode] = useState<string>("todos");

  const categories = useMemo(
    () => Array.from(new Set(INTERACTIVE_SLIDE_OPTIONS.map((item) => item.categoria))),
    []
  );
  const complexities = useMemo(
    () => Array.from(new Set(INTERACTIVE_SLIDE_OPTIONS.map((item) => item.complejidad))),
    []
  );
  const modes = useMemo(
    () => Array.from(new Set(INTERACTIVE_SLIDE_OPTIONS.map((item) => item.modo_iteracion))),
    []
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return INTERACTIVE_SLIDE_OPTIONS.filter((item) => {
      if (category !== "todas" && item.categoria !== category) return false;
      if (complexity !== "todas" && item.complejidad !== complexity) return false;
      if (mode !== "todos" && item.modo_iteracion !== mode) return false;
      if (!q) return true;

      const hayMatchEnTexto =
        item.nombre.toLowerCase().includes(q) ||
        item.patron_base.toLowerCase().includes(q) ||
        item.objetivo.toLowerCase().includes(q) ||
        item.cuando_usarlo.toLowerCase().includes(q) ||
        item.tags.some((tag) => tag.toLowerCase().includes(q));

      return hayMatchEnTexto;
    });
  }, [category, complexity, mode, query]);

  const byCategoryCount = useMemo(() => {
    return categories
      .map((cat) => ({
        categoria: cat,
        total: INTERACTIVE_SLIDE_OPTIONS.filter((item) => item.categoria === cat).length,
      }))
      .sort((a, b) => b.total - a.total);
  }, [categories]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Wiki de Formatos Interactivos</h1>
        <p className="text-gray-600 mt-1">
          Catálogo de <span className="font-semibold">{TOTAL_OPTIONS}</span> posibilidades para
          slides interactivas sin video, pensado para iteración IA pseudo determinística.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Total opciones</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-700">{TOTAL_OPTIONS}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Categorías</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-gray-900">{categories.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Modos de iteración</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-gray-900">{modes.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Resultados filtrados</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-700">{filtered.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por formato, objetivo, tag..."
          />

          <Select value={category} onValueChange={(value) => setCategory(value || "todas")}>
            <SelectTrigger>
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las categorías</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={complexity} onValueChange={(value) => setComplexity(value || "todas")}>
            <SelectTrigger>
              <SelectValue placeholder="Complejidad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las complejidades</SelectItem>
              {complexities.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={mode} onValueChange={(value) => setMode(value || "todos")}>
            <SelectTrigger>
              <SelectValue placeholder="Modo de iteración" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los modos</SelectItem>
              {modes.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Distribución por categoría</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {byCategoryCount.map((item) => (
              <div key={item.categoria} className="flex items-center justify-between rounded border bg-white px-3 py-2">
                <span className="text-sm text-gray-700">{item.categoria}</span>
                <Badge variant="secondary" className="bg-gray-100 text-gray-700">
                  {item.total}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Convención de iteración IA</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-700">
            <p>1. Elegir patrón base y modo de iteración.</p>
            <p>2. Mantener esquema JSON mínimo del patrón.</p>
            <p>3. Aplicar únicamente operaciones permitidas.</p>
            <p>4. Si no aplica, responder con no_puede y alternativa válida.</p>
            <p>5. Renderizar según patrón para cambios visuales consistentes.</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Opciones ({filtered.length})</h2>
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">
              No hay resultados con esos filtros.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((item) => (
              <Card key={item.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-red-100 text-red-700">{item.id}</Badge>
                    <Badge variant="secondary">{item.categoria}</Badge>
                    <Badge variant="secondary">{item.complejidad}</Badge>
                    <Badge variant="secondary">{item.modo_iteracion}</Badge>
                    <Badge variant="outline">{item.tiempo_diseno_min} min diseño</Badge>
                  </div>

                  <div>
                    <h3 className="font-semibold text-gray-900">{item.nombre}</h3>
                    <p className="text-sm text-gray-600 mt-1">{item.dinamica}</p>
                  </div>

                  <p className="text-sm text-gray-700">
                    <span className="font-medium">Objetivo:</span> {item.objetivo}
                  </p>
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">Cuándo usarlo:</span> {item.cuando_usarlo}
                  </p>

                  <div className="flex flex-wrap gap-1">
                    {item.tags.map((tag) => (
                      <span
                        key={`${item.id}-${tag}`}
                        className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>

                  <details className="rounded border bg-gray-50 p-3">
                    <summary className="cursor-pointer text-sm font-medium text-gray-700">
                      Ver JSON mínimo y prompt de iteración
                    </summary>
                    <pre className="mt-3 overflow-auto rounded bg-white p-2 text-xs text-gray-700">
{item.json_minimo}
                    </pre>
                    <p className="mt-3 text-xs text-gray-600">
                      <span className="font-medium">Ops permitidas:</span>{" "}
                      {item.ops_permitidas.join(", ")}
                    </p>
                    <p className="mt-2 text-xs text-gray-600">
                      <span className="font-medium">Prompt sugerido:</span>{" "}
                      {item.prompt_ia_recomendado}
                    </p>
                  </details>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fuentes de investigación</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {INTERACTIVE_SLIDE_WIKI_SOURCES.map((source) => (
            <a
              key={source.url}
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="block text-sm text-blue-700 hover:underline"
            >
              {source.label}
            </a>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
