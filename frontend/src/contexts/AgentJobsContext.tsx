"use client";

/**
 * Estado global de las corridas del Modo Agente (Editor IA de Contenido).
 *
 * Vive en el layout del dashboard, así sobrevive a cambiar de recurso o de página:
 * la corrida sigue streameando aunque el componente del recurso se desmonte, y al
 * volver se ve el progreso/resultado. Además persiste el BORRADOR de la instrucción
 * por recurso en localStorage (para no perder lo tipeado al navegar/recargar).
 */
import { createContext, useContext, useRef, useState, useCallback, ReactNode } from "react";
import { AGENT_URL, authHeaders } from "@/lib/api";

export type AgentEv = { id: number; cls: string; icon: string; text: string };

export interface AgentJob {
  sessionKey: string;
  running: boolean;
  status: string;
  events: AgentEv[];
  html?: string;        // resultado (HTML editado) cuando termina
  htmlVersion: number;  // se incrementa en cada done para que el consumidor reaccione
  lastCost: number | null;
}

export interface AgentImage { name: string; dataUrl: string }
// Documentos de referencia (PDF/DOCX/TXT/MD) que el agente puede leer con Read.
export interface AgentDoc { name: string; dataUrl: string }

interface StartOpts {
  instruction: string;
  model: string;
  seedHtml: string;
  images?: AgentImage[];
  docs?: AgentDoc[];
  // "lite" = verificación económica (1 render, cap de turnos); "full" = exhaustiva.
  verifyMode?: "lite" | "full";
}

interface Ctx {
  getJob: (key: string) => AgentJob | undefined;
  start: (key: string, opts: StartOpts) => void;
  getDraft: (key: string) => string;
  setDraft: (key: string, text: string) => void;
}

const AgentJobsContext = createContext<Ctx | undefined>(undefined);

const DRAFT_PREFIX = "agentDraft:";

export function AgentJobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Record<string, AgentJob>>({});
  const evId = useRef(0);
  // Borradores: cache en memoria + espejo en localStorage.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const patch = useCallback((key: string, fn: (j: AgentJob) => AgentJob) => {
    setJobs((prev) => {
      const cur = prev[key] || {
        sessionKey: key, running: false, status: "listo", events: [], htmlVersion: 0, lastCost: null,
      };
      return { ...prev, [key]: fn(cur) };
    });
  }, []);

  const addEv = useCallback((key: string, cls: string, icon: string, text: string) => {
    patch(key, (j) => ({ ...j, events: [...j.events, { id: evId.current++, cls, icon, text }].slice(-200) }));
  }, [patch]);

  const getJob = useCallback((key: string) => jobs[key], [jobs]);

  const getDraft = useCallback((key: string) => {
    if (key in drafts) return drafts[key];
    if (typeof window !== "undefined") return localStorage.getItem(DRAFT_PREFIX + key) || "";
    return "";
  }, [drafts]);

  const setDraft = useCallback((key: string, text: string) => {
    setDrafts((prev) => ({ ...prev, [key]: text }));
    try { localStorage.setItem(DRAFT_PREFIX + key, text); } catch { /* ignore */ }
  }, []);

  const start = useCallback((key: string, opts: StartOpts) => {
    const instr = opts.instruction.trim();
    // No arrancar si ya hay una corrida activa para este recurso.
    if (!instr || jobs[key]?.running) return;

    patch(key, (j) => ({ ...j, running: true, status: "trabajando…", events: [] }));
    addEv(key, "text", "▶", `Instrucción: ${instr}`);

    (async () => {
      try {
        const resp = await fetch(`${AGENT_URL}/agent/edit`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({ instruction: instr, model: opts.model, sessionKey: key, seedHtml: opts.seedHtml, images: opts.images || [], docs: opts.docs || [], verifyMode: opts.verifyMode || "full" }),
        });
        if (!resp.body) throw new Error("Sin stream de respuesta");
        const reader = resp.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        let gotDone = false;
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
            let d: Record<string, unknown>;
            try { d = JSON.parse(dataLine); } catch { continue; }
            if (ev === "done") gotDone = true;
            handleEvent(key, ev, d);
          }
        }
        // El stream se cerró sin evento "done" (server caído / red cortada):
        // liberar el lock para que el recurso se pueda reintentar (si no, queda
        // running:true para siempre y start() lo rechaza).
        if (!gotDone) {
          addEv(key, "error", "✗", "La conexión con el agente se interrumpió antes de terminar.");
          patch(key, (j) => ({ ...j, running: false, status: "interrumpido" }));
        }
      } catch (e) {
        addEv(key, "error", "✗", `Error de conexión con el agente (${AGENT_URL}): ${(e as Error).message}`);
        patch(key, (j) => ({ ...j, running: false, status: "error" }));
      }
    })();

    function handleEvent(k: string, ev: string, d: Record<string, unknown>) {
      if (ev === "init") addEv(k, "tool", "•", `sesión ${String(d.sessionId).slice(0, 8)}`);
      else if (ev === "text") addEv(k, "text", "🤖", String(d.text));
      else if (ev === "tool") {
        const name = String(d.name);
        const icon = name === "Bash" ? "⌨" : name === "Read" ? "👁" : /Edit|Write/.test(name) ? "✎" : "⚙";
        const detail = String(d.detail || "").split("/").pop()?.slice(0, 60) || "";
        addEv(k, "tool", icon, `${name} ${detail}`);
        if (name === "Bash" && /screenshot/.test(String(d.detail))) patch(k, (j) => ({ ...j, status: "renderizando…" }));
      } else if (ev === "result") {
        patch(k, (j) => ({ ...j, lastCost: Number(d.costUsd || 0) }));
        addEv(k, "result", "✓", `Listo · ${d.toolCalls} acciones · $${Number(d.costUsd || 0).toFixed(4)}`);
      } else if (ev === "done") {
        patch(k, (j) => ({
          ...j,
          running: false,
          status: "listo",
          html: typeof d.html === "string" && d.html ? d.html : j.html,
          htmlVersion: j.htmlVersion + 1,
        }));
      } else if (ev === "error") addEv(k, "error", "✗", String(d.message));
    }
  }, [jobs, patch, addEv]);

  return (
    <AgentJobsContext.Provider value={{ getJob, start, getDraft, setDraft }}>
      {children}
    </AgentJobsContext.Provider>
  );
}

export function useAgentJobs() {
  const ctx = useContext(AgentJobsContext);
  if (!ctx) throw new Error("useAgentJobs debe usarse dentro de AgentJobsProvider");
  return ctx;
}
