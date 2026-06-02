export type SlideComplexity = "Baja" | "Media" | "Alta";

export type SlideCategory =
  | "Chunking y exploración"
  | "Secuencia y proceso"
  | "Análisis y decisión"
  | "Simulación contextual"
  | "Práctica manipulativa"
  | "Evaluación formativa"
  | "Refuerzo y memoria"
  | "Gamificación ligera";

export type IterationMode =
  | "Fundamentos"
  | "Diagnóstico inicial"
  | "Práctica guiada"
  | "Detección de errores"
  | "Transferencia al puesto";

export interface InteractiveSlideOption {
  id: string;
  nombre: string;
  categoria: SlideCategory;
  patron_base: string;
  modo_iteracion: IterationMode;
  dinamica: string;
  objetivo: string;
  cuando_usarlo: string;
  complejidad: SlideComplexity;
  tiempo_diseno_min: number;
  json_minimo: string;
  ops_permitidas: string[];
  prompt_ia_recomendado: string;
  tags: string[];
}

interface BasePattern {
  nombre: string;
  categoria: SlideCategory;
  dinamica: string;
  objetivo_base: string;
  cuando_base: string;
  complejidad: SlideComplexity;
  tiempo_diseno_min: number;
  json_minimo: string;
  ops_permitidas: string[];
  tags: string[];
}

interface ModeVariant {
  nombre: IterationMode;
  objetivo_prefix: string;
  dinamica_suffix: string;
  cuando_suffix: string;
  tiempo_extra_min: number;
  complejidad_delta: -1 | 0 | 1;
  tags: string[];
}

const COMPLEXITY_ORDER: SlideComplexity[] = ["Baja", "Media", "Alta"];

function adjustComplexity(base: SlideComplexity, delta: -1 | 0 | 1): SlideComplexity {
  const idx = COMPLEXITY_ORDER.indexOf(base);
  const next = Math.min(Math.max(idx + delta, 0), COMPLEXITY_ORDER.length - 1);
  return COMPLEXITY_ORDER[next];
}

const MODE_VARIANTS: ModeVariant[] = [
  {
    nombre: "Fundamentos",
    objetivo_prefix: "Comprender el marco general",
    dinamica_suffix: "Prioriza claridad conceptual y navegación simple.",
    cuando_suffix: "Ideal en apertura de bloque o cuando el tema es nuevo.",
    tiempo_extra_min: 0,
    complejidad_delta: 0,
    tags: ["intro", "base", "onboarding-contenido"],
  },
  {
    nombre: "Diagnóstico inicial",
    objetivo_prefix: "Detectar nivel de entrada",
    dinamica_suffix: "Incorpora chequeos rápidos para identificar brechas.",
    cuando_suffix: "Úsalo antes de profundizar para personalizar el recorrido.",
    tiempo_extra_min: 5,
    complejidad_delta: 0,
    tags: ["diagnostico", "pretest", "baseline"],
  },
  {
    nombre: "Práctica guiada",
    objetivo_prefix: "Aplicar el concepto con soporte",
    dinamica_suffix: "Incluye pistas, ejemplo resuelto y retroalimentación inmediata.",
    cuando_suffix: "Funciona cuando ya hubo explicación y toca ejercitar.",
    tiempo_extra_min: 8,
    complejidad_delta: 1,
    tags: ["practica", "feedback", "aplicacion"],
  },
  {
    nombre: "Detección de errores",
    objetivo_prefix: "Prevenir fallas frecuentes",
    dinamica_suffix: "Presenta errores típicos y obliga a corregirlos.",
    cuando_suffix: "Muy útil en compliance y procesos críticos con riesgo operativo.",
    tiempo_extra_min: 10,
    complejidad_delta: 1,
    tags: ["errores", "riesgo", "control-calidad"],
  },
  {
    nombre: "Transferencia al puesto",
    objetivo_prefix: "Llevar la teoría a decisiones reales",
    dinamica_suffix: "Conecta la interacción con situaciones del trabajo diario.",
    cuando_suffix: "Úsalo en cierre para asegurar transferencia y adopción.",
    tiempo_extra_min: 12,
    complejidad_delta: 1,
    tags: ["transferencia", "casos", "desempeno"],
  },
];

const BASE_PATTERNS: BasePattern[] = [
  {
    nombre: "Acordeón esencial",
    categoria: "Chunking y exploración",
    dinamica: "Paneles expandibles por tema.",
    objetivo_base: "fragmentar información extensa sin saturar la pantalla",
    cuando_base: "Cuando hay normativa, políticas o definiciones largas.",
    complejidad: "Baja",
    tiempo_diseno_min: 25,
    json_minimo: `{"titulo":"...","elementos":[{"etiqueta":"...","contenido_oculto":"..."}]}`,
    ops_permitidas: ["rewrite_text", "add_items", "remove_items", "reorder_items"],
    tags: ["accordion", "click-to-reveal", "microcontenido"],
  },
  {
    nombre: "Tabs comparativos",
    categoria: "Chunking y exploración",
    dinamica: "Pestañas para alternar vistas.",
    objetivo_base: "comparar bloques equivalentes sin perder foco",
    cuando_base: "Cuando debes contrastar opciones, roles o versiones.",
    complejidad: "Baja",
    tiempo_diseno_min: 30,
    json_minimo: `{"titulo":"...","pestanas":[{"nombre":"...","contenido":"..."}]}`,
    ops_permitidas: ["rewrite_text", "rename_tabs", "add_tabs", "reorder_tabs"],
    tags: ["tabs", "comparacion", "chunking"],
  },
  {
    nombre: "Tarjetas click-to-reveal",
    categoria: "Chunking y exploración",
    dinamica: "Cards que muestran detalle al clic.",
    objetivo_base: "promover descubrimiento activo y dosificar detalle",
    cuando_base: "Cuando quieres pasar de bullets pasivos a exploración.",
    complejidad: "Baja",
    tiempo_diseno_min: 30,
    json_minimo: `{"titulo":"...","items":[{"frente":"...","reverso":"..."}]}`,
    ops_permitidas: ["rewrite_text", "add_cards", "remove_cards", "retitle_cards"],
    tags: ["cards", "reveal", "descubrimiento"],
  },
  {
    nombre: "Hotspots sobre imagen",
    categoria: "Chunking y exploración",
    dinamica: "Puntos interactivos en imagen, diagrama o interfaz.",
    objetivo_base: "anclar conceptos a referentes visuales reales",
    cuando_base: "Cuando explicas pantallas, mapas, procesos o anatomía de producto.",
    complejidad: "Media",
    tiempo_diseno_min: 40,
    json_minimo: `{"titulo":"...","imagen":"...","hotspots":[{"etiqueta":"...","detalle":"...","x":0.5,"y":0.5}]}`,
    ops_permitidas: ["rewrite_text", "add_hotspots", "move_hotspots", "remove_hotspots"],
    tags: ["hotspots", "labeled-graphic", "imagen-interactiva"],
  },
  {
    nombre: "Tooltips invisibles",
    categoria: "Chunking y exploración",
    dinamica: "Áreas invisibles con texto contextual al hover/click.",
    objetivo_base: "mantener interfaz limpia mostrando ayuda bajo demanda",
    cuando_base: "Cuando necesitas apoyo contextual sin ruido visual.",
    complejidad: "Media",
    tiempo_diseno_min: 35,
    json_minimo: `{"titulo":"...","fondo":"...","zonas":[{"nombre":"...","tooltip":"...","x":0.5,"y":0.5,"w":0.2,"h":0.1}]}`,
    ops_permitidas: ["rewrite_text", "add_zones", "resize_zones", "delete_zones"],
    tags: ["tooltips", "invisible-area", "microayuda"],
  },
  {
    nombre: "Pop-up modal contextual",
    categoria: "Chunking y exploración",
    dinamica: "Botones que abren overlays con contenido ampliado.",
    objetivo_base: "profundizar sin abandonar la narrativa principal",
    cuando_base: "Cuando necesitas capas de detalle opcional.",
    complejidad: "Media",
    tiempo_diseno_min: 35,
    json_minimo: `{"titulo":"...","triggers":[{"label":"...","modal":{"titulo":"...","contenido":"..."}}]}`,
    ops_permitidas: ["rewrite_text", "add_modals", "retitle_modals", "reorder_triggers"],
    tags: ["modal", "overlay", "capas"],
  },
  {
    nombre: "Timeline cronológica",
    categoria: "Secuencia y proceso",
    dinamica: "Hitos ordenados con contexto y evidencia.",
    objetivo_base: "entender evolución temporal y causalidad",
    cuando_base: "Cuando explicas historia, incidentes o roadmap temporal.",
    complejidad: "Baja",
    tiempo_diseno_min: 30,
    json_minimo: `{"titulo":"...","hitos":[{"fecha":"...","titulo":"...","detalle":"..."}]}`,
    ops_permitidas: ["rewrite_text", "add_milestones", "reorder_milestones", "remove_milestones"],
    tags: ["timeline", "hitos", "secuencia"],
  },
  {
    nombre: "Roadmap operativo",
    categoria: "Secuencia y proceso",
    dinamica: "Fases con entregables y criterios de salida.",
    objetivo_base: "visualizar ruta de ejecución de punta a punta",
    cuando_base: "Cuando se debe ejecutar un proceso en etapas.",
    complejidad: "Media",
    tiempo_diseno_min: 40,
    json_minimo: `{"titulo":"...","fases":[{"nombre":"...","objetivo":"...","criterio_salida":"..."}]}`,
    ops_permitidas: ["rewrite_text", "add_phases", "rename_phases", "reorder_phases"],
    tags: ["roadmap", "fases", "implementacion"],
  },
  {
    nombre: "Stepper procedimental",
    categoria: "Secuencia y proceso",
    dinamica: "Paso a paso con validación por etapa.",
    objetivo_base: "reducir errores de ejecución en tareas críticas",
    cuando_base: "Cuando hay secuencias obligatorias o checklists operativos.",
    complejidad: "Media",
    tiempo_diseno_min: 40,
    json_minimo: `{"titulo":"...","pasos":[{"paso":1,"accion":"...","validacion":"..."}]}`,
    ops_permitidas: ["rewrite_text", "add_steps", "reorder_steps", "add_validations"],
    tags: ["stepper", "procedimiento", "checklist"],
  },
  {
    nombre: "Mapa interactivo por zonas",
    categoria: "Análisis y decisión",
    dinamica: "Regiones clicables con información contextual.",
    objetivo_base: "entender variaciones por geografía, canal o segmento",
    cuando_base: "Cuando el contenido depende de zona, región o punto de contacto.",
    complejidad: "Media",
    tiempo_diseno_min: 45,
    json_minimo: `{"titulo":"...","mapa":"...","zonas":[{"nombre":"...","insight":"..."}]}`,
    ops_permitidas: ["rewrite_text", "add_regions", "merge_regions", "delete_regions"],
    tags: ["mapa", "zonas", "segmentacion"],
  },
  {
    nombre: "Matriz 2x2 interactiva",
    categoria: "Análisis y decisión",
    dinamica: "Cuadrantes con casos, riesgos y acciones.",
    objetivo_base: "facilitar priorización por impacto y esfuerzo",
    cuando_base: "Cuando se necesita decidir entre alternativas.",
    complejidad: "Media",
    tiempo_diseno_min: 35,
    json_minimo: `{"titulo":"...","ejes":{"x":"...","y":"..."},"cuadrantes":[{"nombre":"...","items":["..."]}]}`,
    ops_permitidas: ["rewrite_text", "retitle_axes", "move_items", "add_items"],
    tags: ["matriz", "priorizacion", "decision"],
  },
  {
    nombre: "Comparador multicriterio",
    categoria: "Análisis y decisión",
    dinamica: "Tabla comparativa con criterios ponderados.",
    objetivo_base: "analizar diferencias y trade-offs",
    cuando_base: "Cuando hay productos, políticas o caminos alternativos.",
    complejidad: "Media",
    tiempo_diseno_min: 40,
    json_minimo: `{"titulo":"...","criterios":["..."],"opciones":[{"nombre":"...","valores":["..."]}]}`,
    ops_permitidas: ["rewrite_text", "add_criteria", "add_options", "reorder_rows"],
    tags: ["comparador", "tradeoff", "analisis"],
  },
  {
    nombre: "Árbol de decisión",
    categoria: "Análisis y decisión",
    dinamica: "Nodos condicionales con rutas y resultado.",
    objetivo_base: "entrenar decisiones bajo condiciones concretas",
    cuando_base: "Cuando el flujo depende de reglas o señales del contexto.",
    complejidad: "Alta",
    tiempo_diseno_min: 55,
    json_minimo: `{"titulo":"...","nodos":[{"id":"n1","pregunta":"...","si":"n2","no":"n3"}]}`,
    ops_permitidas: ["rewrite_text", "add_nodes", "change_branches", "prune_branches"],
    tags: ["decision-tree", "if-then", "ramificacion"],
  },
  {
    nombre: "Escenario branching",
    categoria: "Simulación contextual",
    dinamica: "Historia con elecciones y consecuencias.",
    objetivo_base: "practicar criterio en contexto sin riesgo real",
    cuando_base: "Cuando necesitas entrenar juicio y toma de decisiones.",
    complejidad: "Alta",
    tiempo_diseno_min: 65,
    json_minimo: `{"titulo":"...","escenas":[{"id":"s1","contexto":"...","opciones":[{"texto":"...","destino":"s2"}]}]}`,
    ops_permitidas: ["rewrite_text", "add_scenes", "edit_outcomes", "reconnect_paths"],
    tags: ["branching", "escenario", "consecuencias"],
  },
  {
    nombre: "Simulador de chat con cliente",
    categoria: "Simulación contextual",
    dinamica: "Diálogo secuencial con respuestas del aprendiz.",
    objetivo_base: "entrenar comunicación y manejo de objeciones",
    cuando_base: "Cuando hay interacción conversacional con usuarios.",
    complejidad: "Alta",
    tiempo_diseno_min: 60,
    json_minimo: `{"titulo":"...","turnos":[{"actor":"cliente","mensaje":"..."},{"actor":"asesor","opciones":["..."]}]}`,
    ops_permitidas: ["rewrite_text", "add_turns", "change_tone", "add_feedback_per_option"],
    tags: ["chat-sim", "soft-skills", "conversacion"],
  },
  {
    nombre: "Drag & drop de clasificación",
    categoria: "Práctica manipulativa",
    dinamica: "Arrastrar elementos a categorías correctas.",
    objetivo_base: "consolidar reglas de clasificación",
    cuando_base: "Cuando hay tipologías, etiquetas o segmentaciones.",
    complejidad: "Media",
    tiempo_diseno_min: 45,
    json_minimo: `{"titulo":"...","categorias":["..."],"items":[{"texto":"...","categoria_correcta":"..."}]}`,
    ops_permitidas: ["rewrite_text", "add_items", "add_categories", "rebalance_distribution"],
    tags: ["drag-drop", "clasificacion", "practice"],
  },
  {
    nombre: "Drag & drop de secuenciación",
    categoria: "Práctica manipulativa",
    dinamica: "Ordenar pasos en la secuencia correcta.",
    objetivo_base: "internalizar el orden operativo de una tarea",
    cuando_base: "Cuando el orden de acciones determina el resultado.",
    complejidad: "Media",
    tiempo_diseno_min: 45,
    json_minimo: `{"titulo":"...","pasos_desordenados":[{"texto":"...","orden_correcto":1}]}`,
    ops_permitidas: ["rewrite_text", "add_steps", "shuffle_steps", "add_hints"],
    tags: ["drag-drop", "ordering", "proceso"],
  },
  {
    nombre: "Matching de pares",
    categoria: "Práctica manipulativa",
    dinamica: "Relacionar concepto con definición o evidencia.",
    objetivo_base: "fortalecer asociaciones clave",
    cuando_base: "Cuando hay pares fijos: término-definición, causa-efecto.",
    complejidad: "Baja",
    tiempo_diseno_min: 35,
    json_minimo: `{"titulo":"...","pares":[{"izquierda":"...","derecha":"..."}]}`,
    ops_permitidas: ["rewrite_text", "add_pairs", "replace_pairs", "reorder_pairs"],
    tags: ["matching", "asociacion", "recall"],
  },
  {
    nombre: "Cloze contextual (rellenar espacios)",
    categoria: "Evaluación formativa",
    dinamica: "Completar texto con términos correctos.",
    objetivo_base: "verificar comprensión fina del lenguaje del dominio",
    cuando_base: "Cuando importa precisión de vocabulario, normas o pasos.",
    complejidad: "Media",
    tiempo_diseno_min: 40,
    json_minimo: `{"titulo":"...","texto":"...","blancos":[{"placeholder":"...","respuesta":"..."}]}`,
    ops_permitidas: ["rewrite_text", "add_blanks", "change_answers", "add_feedback"],
    tags: ["cloze", "fill-in", "precision"],
  },
  {
    nombre: "Quiz de confianza y criterio",
    categoria: "Evaluación formativa",
    dinamica: "Respuesta + nivel de confianza + feedback.",
    objetivo_base: "detectar falsas certezas y calibrar criterio",
    cuando_base: "Cuando quieres evaluar no solo acierto sino seguridad percibida.",
    complejidad: "Alta",
    tiempo_diseno_min: 55,
    json_minimo: `{"titulo":"...","preguntas":[{"pregunta":"...","opciones":["..."],"correcta":0,"confianza":["baja","media","alta"]}]}`,
    ops_permitidas: ["rewrite_text", "add_questions", "edit_feedback", "adjust_difficulty"],
    tags: ["quiz", "confidence", "metacognicion"],
  },
];

export const INTERACTIVE_SLIDE_OPTIONS: InteractiveSlideOption[] = BASE_PATTERNS.flatMap((base, baseIndex) =>
  MODE_VARIANTS.map((mode, modeIndex) => {
    const idNum = baseIndex * MODE_VARIANTS.length + modeIndex + 1;
    const id = `IS-${String(idNum).padStart(3, "0")}`;
    const complejidad = adjustComplexity(base.complejidad, mode.complejidad_delta);
    const tiempo_diseno_min = base.tiempo_diseno_min + mode.tiempo_extra_min;
    const prompt = [
      `Convierte el recurso al patrón "${base.nombre}" en modo "${mode.nombre}".`,
      `Mantén SOLO estructura JSON válida según: ${base.json_minimo}`,
      `Permite únicamente estas operaciones: ${base.ops_permitidas.join(", ")}.`,
      "No cambies colores ni estilos globales. No agregues campos fuera del esquema.",
      "Si el pedido no aplica al patrón, responde con no_puede=true y una alternativa válida.",
    ].join(" ");

    return {
      id,
      nombre: `${base.nombre} · ${mode.nombre}`,
      categoria: base.categoria,
      patron_base: base.nombre,
      modo_iteracion: mode.nombre,
      dinamica: `${base.dinamica} ${mode.dinamica_suffix}`,
      objetivo: `${mode.objetivo_prefix}: ${base.objetivo_base}.`,
      cuando_usarlo: `${base.cuando_base} ${mode.cuando_suffix}`,
      complejidad,
      tiempo_diseno_min,
      json_minimo: base.json_minimo,
      ops_permitidas: Array.from(new Set([...base.ops_permitidas])),
      prompt_ia_recomendado: prompt,
      tags: Array.from(new Set([...base.tags, ...mode.tags])),
    };
  })
);

export const INTERACTIVE_SLIDE_WIKI_SOURCES = [
  {
    label: "H5P - Content Types and Applications",
    url: "https://h5p.org/content-types-and-applications",
  },
  {
    label: "H5P - Branching Scenario",
    url: "https://h5p.org/branching-scenario",
  },
  {
    label: "H5P - Accordion Tutorial",
    url: "https://h5p.org/tutorial-accordion",
  },
  {
    label: "Genially - Interactions and animations",
    url: "https://genially.com/features/interactive-content/",
  },
  {
    label: "Genially Help - Interactive elements",
    url: "https://help.genially.com/en_us/interactive-elements-in-genially-HJLKqDBnj",
  },
  {
    label: "Rise 360 - Choose Lesson and Block Types",
    url: "https://community.articulate.com/series/rise-360/articles/rise-360-choose-lesson-and-block-types",
  },
  {
    label: "Rise 360 - Blocks instead of bullet points",
    url: "https://community.articulate.com/series/allison-s-articles/articles/6-rise-360-blocks-to-use-instead-of-bullet-points",
  },
  {
    label: "MoodleDocs - Question types",
    url: "https://docs.moodle.org/en/Question_types",
  },
  {
    label: "Adobe Captivate - Multiple choice question slide",
    url: "https://helpx.adobe.com/captivate/help/create-multiple-choice-question-slide.html",
  },
  {
    label: "Adobe Captivate Classic - Insert question slides",
    url: "https://helpx.adobe.com/uk/captivate/classic/insert-question-slides.html",
  },
  {
    label: "SCORM reference poster - interaction types",
    url: "https://scorm.com/wp-content/assets/scorm_ref_poster/RusticiSCORMPoster-large.pdf",
  },
];
