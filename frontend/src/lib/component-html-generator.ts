/**
 * Genera HTML completo para SCORM desde componentes
 * Templates CSS controlados = diseño siempre consistente
 */

import { ResourceComponent, ComponentContent } from "./component-renderer";

// Config de estilos globales
export interface ComponentConfig {
  fondo_imagen?: string;
  fondo_overlay?: string;
  color_primario?: string;
  color_secundario?: string;
}

export interface ComponentContentWithConfig extends ComponentContent {
  config?: ComponentConfig;
}

function getBaseStyles(config?: ComponentConfig): string {
  const fondoImagen = config?.fondo_imagen || '';
  const fondoOverlay = config?.fondo_overlay || 'rgba(0,0,0,0.75)';
  const colorPrimario = config?.color_primario || '#DA291C';
  const colorSecundario = config?.color_secundario || '#FFD700';

  const backgroundStyle = fondoImagen
    ? `background: linear-gradient(${fondoOverlay}, ${fondoOverlay}), url('${fondoImagen}') center/cover fixed;`
    : `background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);`;

  return `
:root {
  --color-primary: ${colorPrimario};
  --color-secondary: ${colorSecundario};
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  ${backgroundStyle}
  min-height: 100vh;
  color: white;
  padding: 40px;
  line-height: 1.6;
}
.container { max-width: 1000px; margin: 0 auto; }
`;
}

const BASE_STYLES = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  min-height: 100vh;
  color: white;
  padding: 40px;
  line-height: 1.6;
}
.container { max-width: 1000px; margin: 0 auto; }

/* Header */
.comp-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-bottom: 20px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  margin-bottom: 24px;
}
.comp-header-icon { font-size: 48px; }
.comp-header-title { font-size: 28px; font-weight: bold; }
.comp-header-subtitle { color: rgba(255,255,255,0.6); margin-top: 4px; }

/* Intro */
.comp-intro { color: rgba(255,255,255,0.8); margin-bottom: 24px; font-size: 18px; }
.comp-intro-destacado {
  background: linear-gradient(90deg, #fbbf24, #f59e0b);
  color: #1a1a2e;
  padding: 16px 24px;
  border-radius: 12px;
  margin-bottom: 24px;
  font-weight: 500;
}

/* Cards */
.comp-cards {
  display: grid;
  gap: 20px;
  margin-bottom: 24px;
}
.comp-cards-2 { grid-template-columns: repeat(2, 1fr); }
.comp-cards-3 { grid-template-columns: repeat(3, 1fr); }
.comp-cards-4 { grid-template-columns: repeat(4, 1fr); }
@media (max-width: 768px) {
  .comp-cards-2, .comp-cards-3, .comp-cards-4 { grid-template-columns: 1fr; }
}
.comp-card {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 16px;
  padding: 24px;
  transition: all 0.3s;
  cursor: pointer;
}
.comp-card:hover {
  transform: translateY(-4px);
  background: rgba(255,255,255,0.1);
  border-color: #DA291C;
}
.comp-card-icon { font-size: 40px; margin-bottom: 12px; }
.comp-card-title { font-size: 18px; font-weight: bold; margin-bottom: 8px; }
.comp-card-desc { color: rgba(255,255,255,0.7); font-size: 14px; }

/* Lista */
.comp-lista { margin-bottom: 24px; }
.comp-lista-title { font-size: 20px; font-weight: bold; margin-bottom: 12px; }
.comp-lista-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 0;
  color: rgba(255,255,255,0.9);
}
.comp-lista-bullet { color: #DA291C; font-weight: bold; }

/* Tabla */
.comp-tabla { margin-bottom: 24px; }
.comp-tabla-title { font-size: 20px; font-weight: bold; margin-bottom: 12px; }
.comp-tabla-container {
  background: rgba(255,255,255,0.05);
  border-radius: 12px;
  overflow: hidden;
}
.comp-tabla table { width: 100%; border-collapse: collapse; }
.comp-tabla th {
  background: #DA291C;
  padding: 16px;
  text-align: left;
  font-weight: 600;
}
.comp-tabla td {
  padding: 16px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}
.comp-tabla tr:last-child td { border-bottom: none; }
.comp-tabla td:first-child { font-weight: 500; color: #fbbf24; }

/* Acordeon */
.comp-acordeon { margin-bottom: 24px; }
.comp-acordeon-item { margin-bottom: 8px; }
.comp-acordeon-header {
  background: linear-gradient(90deg, #DA291C, #b91c1c);
  padding: 16px 20px;
  border-radius: 12px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 500;
  transition: filter 0.2s;
}
.comp-acordeon-header:hover { filter: brightness(1.1); }
.comp-acordeon-arrow { transition: transform 0.3s; }
.comp-acordeon-item.open .comp-acordeon-arrow { transform: rotate(180deg); }
.comp-acordeon-content {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s;
  background: rgba(0,0,0,0.3);
  border-radius: 0 0 12px 12px;
}
.comp-acordeon-item.open .comp-acordeon-content { max-height: 500px; }
.comp-acordeon-content-inner {
  padding: 20px;
  color: rgba(255,255,255,0.9);
}

/* CTA */
.comp-cta {
  padding: 32px;
  border-radius: 16px;
  text-align: center;
  margin-top: 24px;
}
.comp-cta-destacado {
  background: linear-gradient(90deg, #DA291C, #b91c1c);
  font-size: 24px;
  font-weight: bold;
}
.comp-cta-sutil {
  background: rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.9);
  font-size: 18px;
}

/* Separador */
.comp-separador {
  height: 1px;
  background: rgba(255,255,255,0.1);
  margin: 32px 0;
}

/* Flashcards */
.comp-flashcards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
  margin-bottom: 24px;
}
@media (max-width: 768px) {
  .comp-flashcards { grid-template-columns: 1fr; }
}
.comp-flashcard {
  height: 180px;
  perspective: 1000px;
  cursor: pointer;
}
.comp-flashcard-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transition: transform 0.6s;
  transform-style: preserve-3d;
}
.comp-flashcard.flipped .comp-flashcard-inner { transform: rotateY(180deg); }
.comp-flashcard-front, .comp-flashcard-back {
  position: absolute;
  width: 100%;
  height: 100%;
  backface-visibility: hidden;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  text-align: center;
  font-size: 16px;
}
.comp-flashcard-front {
  background: linear-gradient(135deg, #DA291C, #b91c1c);
  font-weight: bold;
}
.comp-flashcard-back {
  background: rgba(255,255,255,0.1);
  border: 2px solid #DA291C;
  transform: rotateY(180deg);
}

/* Quiz */
.comp-quiz { margin-bottom: 24px; }
.comp-quiz-question {
  background: rgba(255,255,255,0.05);
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 16px;
}
.comp-quiz-text { font-size: 18px; font-weight: 500; margin-bottom: 16px; }
.comp-quiz-option {
  padding: 14px 18px;
  background: rgba(255,255,255,0.05);
  border: 2px solid rgba(255,255,255,0.1);
  border-radius: 10px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.comp-quiz-option:hover { border-color: #DA291C; }
.comp-quiz-option.correct { border-color: #22c55e; background: rgba(34,197,94,0.2); }

/* Caso */
.comp-caso-escenario {
  background: linear-gradient(135deg, rgba(59,130,246,0.2), rgba(37,99,235,0.2));
  border-left: 4px solid #3b82f6;
  padding: 24px;
  border-radius: 0 12px 12px 0;
  margin-bottom: 24px;
}
.comp-caso-label { color: #60a5fa; font-weight: bold; margin-bottom: 8px; }
`;

function generateHeaderHTML(comp: { titulo: string; subtitulo?: string; icono?: string }): string {
  return `
    <div class="comp-header">
      ${comp.icono ? `<span class="comp-header-icon">${comp.icono}</span>` : '<span class="comp-header-icon">🏠</span>'}
      <div>
        <div class="comp-header-title">${comp.titulo}</div>
        ${comp.subtitulo ? `<div class="comp-header-subtitle">${comp.subtitulo}</div>` : ''}
      </div>
    </div>`;
}

function generateIntroHTML(comp: { texto: string; destacado?: boolean }): string {
  if (comp.destacado) {
    return `<div class="comp-intro-destacado">💡 ${comp.texto}</div>`;
  }
  return `<p class="comp-intro">${comp.texto}</p>`;
}

function generateCardsHTML(comp: { items: Array<{ icono?: string; titulo: string; descripcion: string }>; columnas?: number }): string {
  const cols = comp.columnas || 2;
  return `
    <div class="comp-cards comp-cards-${cols}">
      ${comp.items.map(item => `
        <div class="comp-card">
          ${item.icono ? `<div class="comp-card-icon">${item.icono}</div>` : ''}
          <div class="comp-card-title">${item.titulo}</div>
          <div class="comp-card-desc">${item.descripcion}</div>
        </div>
      `).join('')}
    </div>`;
}

function generateListaHTML(comp: { titulo?: string; items: string[]; estilo?: string }): string {
  const bullet = comp.estilo === 'checks' ? '✓' : comp.estilo === 'numbers' ? null : '•';
  return `
    <div class="comp-lista">
      ${comp.titulo ? `<div class="comp-lista-title">${comp.titulo}</div>` : ''}
      ${comp.items.map((item, i) => `
        <div class="comp-lista-item">
          <span class="comp-lista-bullet">${bullet !== null ? bullet : (i + 1) + '.'}</span>
          <span>${item}</span>
        </div>
      `).join('')}
    </div>`;
}

function generateTablaHTML(comp: { titulo?: string; columnas: string[]; filas: Array<{ aspecto: string; valores: string[] }> }): string {
  return `
    <div class="comp-tabla">
      ${comp.titulo ? `<div class="comp-tabla-title">${comp.titulo}</div>` : ''}
      <div class="comp-tabla-container">
        <table>
          <thead>
            <tr>
              <th>Aspecto</th>
              ${comp.columnas.map(col => `<th>${col}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${comp.filas.map(fila => `
              <tr>
                <td>${fila.aspecto}</td>
                ${fila.valores.map(val => `<td>${val}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function generateAcordeonHTML(comp: { items: Array<{ titulo: string; contenido: string }> }): string {
  return `
    <div class="comp-acordeon">
      ${comp.items.map((item, i) => `
        <div class="comp-acordeon-item" onclick="this.classList.toggle('open')">
          <div class="comp-acordeon-header">
            <span>${item.titulo}</span>
            <span class="comp-acordeon-arrow">▼</span>
          </div>
          <div class="comp-acordeon-content">
            <div class="comp-acordeon-content-inner">${item.contenido}</div>
          </div>
        </div>
      `).join('')}
    </div>`;
}

function generateCtaHTML(comp: { texto: string; estilo?: string }): string {
  const estilo = comp.estilo || 'destacado';
  return `<div class="comp-cta comp-cta-${estilo}">${comp.texto}</div>`;
}

function generateSeparadorHTML(): string {
  return `<div class="comp-separador"></div>`;
}

function generateFlashcardsHTML(comp: { items: Array<{ frente: string; reverso: string }> }): string {
  return `
    <div class="comp-flashcards">
      ${comp.items.map((card, i) => `
        <div class="comp-flashcard" onclick="this.classList.toggle('flipped')">
          <div class="comp-flashcard-inner">
            <div class="comp-flashcard-front">${card.frente}</div>
            <div class="comp-flashcard-back">${card.reverso}</div>
          </div>
        </div>
      `).join('')}
    </div>`;
}

function generateQuizHTML(comp: { preguntas: Array<{ pregunta: string; opciones: string[]; correcta: number }> }): string {
  return `
    <div class="comp-quiz">
      ${comp.preguntas.map((q, i) => `
        <div class="comp-quiz-question">
          <div class="comp-quiz-text">${i + 1}. ${q.pregunta}</div>
          ${q.opciones.map((opt, j) => `
            <div class="comp-quiz-option ${j === q.correcta ? 'correct' : ''}">${opt}</div>
          `).join('')}
        </div>
      `).join('')}
    </div>`;
}

function generateCasoHTML(comp: { escenario: string; preguntas: Array<{ pregunta: string; opciones: string[]; correcta: number; feedback?: string }> }): string {
  return `
    <div class="comp-caso-escenario">
      <div class="comp-caso-label">📋 Escenario</div>
      <p>${comp.escenario}</p>
    </div>
    ${comp.preguntas.map((q, i) => `
      <div class="comp-quiz-question">
        <div class="comp-quiz-text">${i + 1}. ${q.pregunta}</div>
        ${q.opciones.map((opt, j) => `
          <div class="comp-quiz-option ${j === q.correcta ? 'correct' : ''}">${opt}</div>
        `).join('')}
        ${q.feedback ? `<p style="margin-top:12px;color:rgba(255,255,255,0.7);font-style:italic;">💡 ${q.feedback}</p>` : ''}
      </div>
    `).join('')}`;
}

function generateComponentHTML(component: ResourceComponent): string {
  // Normalize tipo to lowercase for case-insensitive matching
  const tipo = String(component.tipo).toLowerCase().trim();
  switch (tipo) {
    case "header": return generateHeaderHTML(component as any);
    case "intro": return generateIntroHTML(component as any);
    case "cards": return generateCardsHTML(component as any);
    case "lista": return generateListaHTML(component as any);
    case "tabla": return generateTablaHTML(component as any);
    case "comparador": return generateTablaHTML(component as any);
    case "acordeon": return generateAcordeonHTML(component as any);
    case "cta": return generateCtaHTML(component as any);
    case "separador": return generateSeparadorHTML();
    case "flashcards": return generateFlashcardsHTML(component as any);
    case "quiz": return generateQuizHTML(component as any);
    case "caso": return generateCasoHTML(component as any);
    default:
      console.warn(`Unknown component type: ${component.tipo}`);
      return '';
  }
}

export function generateFullHTML(content: ComponentContentWithConfig, title?: string): string {
  const componentsHTML = content.componentes.map(c => generateComponentHTML(c)).join('\n');
  const baseStyles = getBaseStyles(content.config);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title || 'Recurso E-Learning'} - Davivienda</title>
  <style>${baseStyles}${BASE_STYLES}</style>
</head>
<body>
  <div class="container">
    ${componentsHTML}
  </div>
</body>
</html>`;
}

export function openComponentsInNewTab(content: ComponentContentWithConfig, title?: string): void {
  const html = generateFullHTML(content, title);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}
