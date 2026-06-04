"use client";

import { useRef, useState } from "react";
import { AGENT_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";

type Ev = { id: number; cls: string; icon: string; text: string };

const MODELS = [
  { value: "claude-haiku-4-5", label: "Haiku 4.5 (económico)" },
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6 (recomendado)" },
  { value: "claude-opus-4-8", label: "Opus 4.8 (máxima calidad)" },
];

export default function EditorPage() {
  const [instruction, setInstruction] = useState(
    "Hacé el header sticky, agregá el meta viewport que falta y arreglá el overflow horizontal en mobile. Mejorá la estética manteniendo la marca Davivienda."
  );
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [events, setEvents] = useState<Ev[]>([]);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("listo");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [previewKey, setPreviewKey] = useState(0);
  const evId = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);

  const previewSrc = `${AGENT_URL}/workspace/index.html?t=${previewKey}`;

  const addEv = (cls: string, icon: string, text: string) => {
    setEvents((prev) => [...prev, { id: evId.current++, cls, icon, text }]);
    requestAnimationFrame(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    });
  };

  const handle = (ev: string, d: Record<string, unknown>) => {
    if (ev === "init") addEv("tool", "•", `sesión ${String(d.sessionId).slice(0, 8)}`);
    else if (ev === "text") addEv("text", "🤖", String(d.text));
    else if (ev === "tool") {
      const name = String(d.name);
      const icon = name === "Bash" ? "⌨" : name === "Read" ? "👁" : /Edit|Write/.test(name) ? "✎" : "⚙";
      const detail = String(d.detail || "").split("/").pop()?.slice(0, 60) || "";
      addEv("tool", icon, `${name} ${detail}`);
      if (name === "Bash" && /screenshot/.test(String(d.detail))) setStatus("renderizando…");
    } else if (ev === "result")
      addEv("result", "✓", `Listo · ${d.toolCalls} acciones · $${Number(d.costUsd || 0).toFixed(4)}`);
    else if (ev === "done") {
      setStatus("listo");
      setPreviewKey((k) => k + 1);
    } else if (ev === "error") addEv("error", "✗", String(d.message));
  };

  const run = async () => {
    if (!instruction.trim() || running) return;
    setRunning(true);
    setStatus("trabajando…");
    setEvents([]);
    addEv("text", "▶", `Instrucción: ${instruction.trim()}`);
    try {
      const resp = await fetch(`${AGENT_URL}/agent/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction, model }),
      });
      if (!resp.body) throw new Error("Sin stream de respuesta");
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const ev = block.match(/^event: (.+)$/m)?.[1];
          const dataLine = block.match(/^data: (.+)$/m)?.[1];
          if (!ev || !dataLine) continue;
          try {
            handle(ev, JSON.parse(dataLine));
          } catch {
            /* bloque incompleto, ignorar */
          }
        }
      }
    } catch (e) {
      addEv("error", "✗", `Error de conexión con el agente (${AGENT_URL}): ${(e as Error).message}`);
      setStatus("error");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b bg-white px-6 py-3">
        <h1 className="text-lg font-semibold text-gray-900">🤖 Editor IA · Modo Agente</h1>
        <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
          Claude Agent SDK
        </span>
        <span className="ml-auto text-xs text-gray-500">Estado: {status}</span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[420px_1fr]">
        {/* Panel izquierdo */}
        <div className="flex min-h-0 flex-col border-r bg-white">
          <div className="border-b p-4">
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Ej: Hacé el header sticky y arreglá el overflow en mobile…"
              className="h-24 w-full resize-y rounded-lg border border-gray-300 p-2.5 text-sm focus:border-red-500 focus:outline-none"
            />
            <div className="mt-2 flex items-center gap-2">
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="rounded-lg border border-gray-300 p-2 text-sm"
              >
                {MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <Button onClick={run} disabled={running} className="ml-auto">
                {running ? "Trabajando…" : "Ejecutar agente"}
              </Button>
            </div>
          </div>

          <div ref={logRef} className="min-h-0 flex-1 overflow-y-auto p-4 text-sm">
            {events.length === 0 ? (
              <p className="text-xs text-gray-400">
                El progreso del agente aparece acá en vivo: lee archivos, edita, renderiza y se autocorrige.
              </p>
            ) : (
              events.map((e) => (
                <div key={e.id} className="flex gap-2 border-b border-gray-100 py-1.5">
                  <span className="w-4 shrink-0 text-center">{e.icon}</span>
                  <span
                    className={
                      e.cls === "tool"
                        ? "font-mono text-xs text-gray-600"
                        : e.cls === "result"
                        ? "font-semibold text-green-700"
                        : e.cls === "error"
                        ? "font-semibold text-red-600"
                        : "text-gray-900"
                    }
                  >
                    {e.text}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Panel derecho: preview */}
        <div className="flex min-h-0 flex-col">
          <div className="flex items-center gap-3 border-b bg-white px-4 py-2 text-sm">
            <span className="text-gray-500">Preview:</span>
            <code className="text-xs text-gray-700">/workspace/index.html</code>
            <div className="ml-auto flex gap-1.5">
              <button
                onClick={() => setDevice("desktop")}
                className={`rounded px-3 py-1 text-xs ${device === "desktop" ? "bg-red-600 text-white" : "bg-gray-100 text-gray-700"}`}
              >
                🖥 Desktop
              </button>
              <button
                onClick={() => setDevice("mobile")}
                className={`rounded px-3 py-1 text-xs ${device === "mobile" ? "bg-red-600 text-white" : "bg-gray-100 text-gray-700"}`}
              >
                📱 Mobile
              </button>
              <button
                onClick={() => setPreviewKey((k) => k + 1)}
                className="rounded bg-gray-100 px-3 py-1 text-xs text-gray-700"
              >
                ↻ Recargar
              </button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-gray-300 p-4">
            <iframe
              key={previewKey}
              src={previewSrc}
              className="h-full bg-white shadow-lg"
              style={{ width: device === "mobile" ? 390 : "100%", transition: "width .2s" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
