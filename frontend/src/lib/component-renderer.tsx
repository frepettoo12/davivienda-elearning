/**
 * Sistema de Componentes para Recursos E-Learning
 *
 * Cada recurso se compone de un array de componentes.
 * Los templates CSS están controlados por nosotros = diseño consistente.
 */

import React from "react";

// Tipos de componentes disponibles
export type ComponentType =
  | "header"
  | "intro"
  | "cards"
  | "lista"
  | "tabla"
  | "comparador"
  | "acordeon"
  | "cta"
  | "separador"
  | "flashcards"
  | "quiz"
  | "caso"
  | "audio";

// Definición de cada componente
export interface HeaderComponent {
  tipo: "header";
  titulo: string;
  subtitulo?: string;
  icono?: string;
}

export interface IntroComponent {
  tipo: "intro";
  texto: string;
  destacado?: boolean;
}

export interface CardsComponent {
  tipo: "cards";
  columnas?: 2 | 3 | 4;
  items: Array<{
    icono?: string;
    titulo: string;
    descripcion: string;
  }>;
}

export interface ListaComponent {
  tipo: "lista";
  titulo?: string;
  items: string[];
  estilo?: "bullets" | "checks" | "numbers";
}

export interface TablaComponent {
  tipo: "tabla" | "comparador";
  titulo?: string;
  columnas: string[];
  filas: Array<{
    aspecto: string;
    valores: string[];
  }>;
}

export interface AcordeonComponent {
  tipo: "acordeon";
  items: Array<{
    titulo: string;
    contenido: string;
  }>;
}

export interface CtaComponent {
  tipo: "cta";
  texto: string;
  estilo?: "destacado" | "sutil";
}

export interface SeparadorComponent {
  tipo: "separador";
}

export interface FlashcardsComponent {
  tipo: "flashcards";
  items: Array<{
    frente: string;
    reverso: string;
  }>;
}

export interface QuizComponent {
  tipo: "quiz";
  preguntas: Array<{
    pregunta: string;
    opciones: string[];
    correcta: number;
  }>;
}

export interface CasoComponent {
  tipo: "caso";
  escenario: string;
  preguntas: Array<{
    pregunta: string;
    opciones: string[];
    correcta: number;
    feedback?: string;
  }>;
}

// Audio: música de ambiente o narración insertable en cualquier parte del contenido.
// Reemplaza a la música hardcodeada que antes venía baked-in en cada recurso.
export interface AudioComponent {
  tipo: "audio";
  src: string;            // URL del audio (mp3, etc.)
  titulo?: string;        // Etiqueta visible (ej: "Música de ambiente")
  loop?: boolean;         // Repetir en bucle (default false)
  autoplay?: boolean;     // Intentar reproducir solo (los browsers suelen bloquearlo; default false)
}

export type ResourceComponent =
  | HeaderComponent
  | IntroComponent
  | CardsComponent
  | ListaComponent
  | TablaComponent
  | AcordeonComponent
  | CtaComponent
  | SeparadorComponent
  | FlashcardsComponent
  | QuizComponent
  | CasoComponent
  | AudioComponent;

// Config de estilos globales
export interface ComponentConfig {
  fondo_imagen?: string;
  fondo_overlay?: string;
  color_primario?: string;
  color_secundario?: string;
}

// Contenido basado en componentes
export interface ComponentContent {
  config?: ComponentConfig;
  componentes: ResourceComponent[];
}

// ============== RENDER COMPONENTS (React) ==============

export function RenderHeader({ titulo, subtitulo, icono }: HeaderComponent) {
  return (
    <div className="flex items-center gap-3 pb-4 border-b border-gray-200 mb-4">
      {icono && <span className="text-4xl">{icono}</span>}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">{titulo}</h2>
        {subtitulo && <p className="text-gray-500">{subtitulo}</p>}
      </div>
    </div>
  );
}

export function RenderIntro({ texto, destacado }: IntroComponent) {
  if (destacado) {
    return (
      <div className="p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded-r-lg mb-4">
        <p className="text-yellow-800">💡 {texto}</p>
      </div>
    );
  }
  return <p className="text-gray-600 mb-4">{texto}</p>;
}

export function RenderCards({ items, columnas = 2 }: CardsComponent) {
  const gridCols = {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-2 lg:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
  };

  return (
    <div className={`grid gap-4 ${gridCols[columnas]} mb-4`}>
      {items.map((item, i) => (
        <div key={i} className="p-4 bg-gradient-to-br from-red-50 to-orange-50 rounded-lg border border-red-100 hover:shadow-md transition-shadow">
          {item.icono && <span className="text-3xl mb-2 block">{item.icono}</span>}
          <h4 className="font-bold text-gray-900 mb-1">{item.titulo}</h4>
          <p className="text-sm text-gray-600">{item.descripcion}</p>
        </div>
      ))}
    </div>
  );
}

export function RenderLista({ titulo, items, estilo = "bullets" }: ListaComponent) {
  const icons = {
    bullets: "•",
    checks: "✓",
    numbers: null,
  };

  return (
    <div className="mb-4">
      {titulo && <h4 className="font-bold text-gray-900 mb-2">{titulo}</h4>}
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-gray-700">
            <span className="text-red-500 font-bold">
              {estilo === "numbers" ? `${i + 1}.` : icons[estilo]}
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RenderTabla({ titulo, columnas, filas }: TablaComponent) {
  return (
    <div className="mb-4">
      {titulo && <h4 className="font-bold text-gray-900 mb-2">{titulo}</h4>}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-red-600 text-white">
              <th className="p-3 text-left font-semibold">Aspecto</th>
              {columnas.map((col, i) => (
                <th key={i} className="p-3 text-left font-semibold">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((fila, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                <td className="p-3 font-medium text-gray-900">{fila.aspecto}</td>
                {fila.valores.map((val, j) => (
                  <td key={j} className="p-3 text-gray-600">{val}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function RenderAcordeon({ items }: AcordeonComponent) {
  return (
    <div className="space-y-2 mb-4">
      {items.map((item, i) => (
        <details key={i} className="group">
          <summary className="p-4 bg-red-600 text-white rounded-lg cursor-pointer hover:bg-red-700 transition-colors list-none flex items-center justify-between">
            <span className="font-medium">{item.titulo}</span>
            <svg className="h-5 w-5 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <div className="p-4 bg-gray-50 border border-t-0 rounded-b-lg">
            <p className="text-gray-700">{item.contenido}</p>
          </div>
        </details>
      ))}
    </div>
  );
}

export function RenderCta({ texto, estilo = "destacado" }: CtaComponent) {
  if (estilo === "destacado") {
    return (
      <div className="p-6 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg text-center mt-4">
        <p className="text-xl font-bold">{texto}</p>
      </div>
    );
  }
  return (
    <div className="p-4 bg-gray-100 rounded-lg text-center mt-4">
      <p className="text-gray-700 font-medium">{texto}</p>
    </div>
  );
}

export function RenderSeparador() {
  return <hr className="my-6 border-gray-200" />;
}

export function RenderAudio({ src, titulo, loop }: AudioComponent) {
  return (
    <div className="flex items-center gap-3 p-3 bg-gray-100 rounded-lg my-4">
      <span className="text-xl">🎵</span>
      <div className="flex-1">
        {titulo && <p className="text-sm font-medium text-gray-700 mb-1">{titulo}</p>}
        <audio controls loop={loop} src={src} className="w-full">
          Tu navegador no soporta audio.
        </audio>
      </div>
    </div>
  );
}

export function RenderFlashcards({ items }: FlashcardsComponent) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 mb-4">
      {items.map((card, i) => (
        <div key={i} className="group cursor-pointer" style={{ perspective: "1000px" }}>
          <div className="relative h-40">
            <div className="absolute inset-0 p-4 bg-red-600 text-white rounded-lg flex items-center justify-center text-center">
              <p className="font-medium">{card.frente}</p>
            </div>
          </div>
          <p className="text-xs text-center text-gray-400 mt-1">Reverso: {card.reverso}</p>
        </div>
      ))}
    </div>
  );
}

export function RenderQuiz({ preguntas }: QuizComponent) {
  return (
    <div className="space-y-4 mb-4">
      {preguntas.map((q, i) => (
        <div key={i} className="p-4 bg-gray-50 rounded-lg">
          <p className="font-medium mb-3">{i + 1}. {q.pregunta}</p>
          <div className="grid gap-2">
            {q.opciones.map((opt, j) => (
              <div
                key={j}
                className={`p-3 rounded-lg border ${j === q.correcta ? "border-green-500 bg-green-50" : "border-gray-200 bg-white"}`}
              >
                {opt}
                {j === q.correcta && <span className="ml-2 text-green-600">✓</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function RenderCaso({ escenario, preguntas }: CasoComponent) {
  return (
    <div className="mb-4">
      <div className="p-4 bg-blue-50 border-l-4 border-blue-500 rounded-r-lg mb-4">
        <p className="font-medium text-blue-900 mb-1">📋 Escenario</p>
        <p className="text-blue-800">{escenario}</p>
      </div>
      {preguntas.map((q, i) => (
        <div key={i} className="p-4 bg-gray-50 rounded-lg mb-2">
          <p className="font-medium mb-3">{i + 1}. {q.pregunta}</p>
          <div className="space-y-2">
            {q.opciones.map((opt, j) => (
              <div
                key={j}
                className={`p-3 rounded-lg ${j === q.correcta ? "bg-green-100 border border-green-400" : "bg-white border border-gray-200"}`}
              >
                {opt}
              </div>
            ))}
          </div>
          {q.feedback && <p className="mt-3 text-sm text-gray-600 italic">💡 {q.feedback}</p>}
        </div>
      ))}
    </div>
  );
}

// ============== MAIN RENDERER ==============

export function RenderComponent(component: ResourceComponent) {
  // Normalize tipo to lowercase for case-insensitive matching
  const tipo = String(component.tipo).toLowerCase().trim();
  switch (tipo) {
    case "header":
      return <RenderHeader {...(component as HeaderComponent)} />;
    case "intro":
      return <RenderIntro {...(component as IntroComponent)} />;
    case "cards":
      return <RenderCards {...(component as CardsComponent)} />;
    case "lista":
      return <RenderLista {...(component as ListaComponent)} />;
    case "tabla":
    case "comparador":
      return <RenderTabla {...(component as TablaComponent)} />;
    case "acordeon":
      return <RenderAcordeon {...(component as AcordeonComponent)} />;
    case "cta":
      return <RenderCta {...(component as CtaComponent)} />;
    case "separador":
      return <RenderSeparador />;
    case "flashcards":
      return <RenderFlashcards {...(component as FlashcardsComponent)} />;
    case "quiz":
      return <RenderQuiz {...(component as QuizComponent)} />;
    case "caso":
      return <RenderCaso {...(component as CasoComponent)} />;
    case "audio":
      return <RenderAudio {...(component as AudioComponent)} />;
    default:
      console.warn(`Unknown component type: ${component.tipo}`);
      return null;
  }
}

export function RenderComponents({ componentes }: ComponentContent) {
  return (
    <div className="space-y-2">
      {componentes.map((comp, i) => (
        <React.Fragment key={i}>
          {RenderComponent(comp)}
        </React.Fragment>
      ))}
    </div>
  );
}

// ============== CHECK IF CONTENT IS COMPONENT-BASED ==============

export function isComponentContent(contenido: unknown): contenido is ComponentContent {
  return (
    typeof contenido === "object" &&
    contenido !== null &&
    "componentes" in contenido &&
    Array.isArray((contenido as ComponentContent).componentes)
  );
}
