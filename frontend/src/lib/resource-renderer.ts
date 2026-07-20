/**
 * Genera HTML completo para cada tipo de recurso
 * Este HTML es el mismo que irá al SCORM
 */

import { Guion } from "./api";
import { Brand, DEFAULT_BRAND, safeFont } from "./brand";

// Escapa texto proveniente del guión/contenido (GPT o ediciones de usuario)
// para prevenir XSS almacenado en el HTML generado.
function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Los colores de marca entran como CSS vars (--brand-primary/--brand-secondary):
// un solo punto define los valores y el resto de los estilos los referencia.
const baseStyles = (b: Brand) => {
  const fuenteTexto = safeFont(b.fuenteTexto, "Open Sans");
  const fuenteTitulos = safeFont(b.fuenteTitulos, "Montserrat");
  const fam = (f: string) => encodeURIComponent(f).replace(/%20/g, "+");
  return `
  @import url('https://fonts.googleapis.com/css2?family=${fam(fuenteTitulos)}:wght@600;700;800&family=${fam(fuenteTexto)}:wght@400;600&display=swap');
  :root {
    --brand-primary: ${b.colorPrimario};
    --brand-secondary: ${b.colorSecundario};
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: '${fuenteTexto}', 'Segoe UI', system-ui, sans-serif;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
    min-height: 100vh;
    color: white;
    padding: 40px;
  }
  h1, h2, h3, .title { font-family: '${fuenteTitulos}', 'Segoe UI', sans-serif; }
  .container { max-width: 1200px; margin: 0 auto; }
  .header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 32px;
    padding-bottom: 24px;
    border-bottom: 1px solid rgba(255,255,255,0.1);
  }
  .logo {
    width: 50px;
    height: 50px;
    background: var(--brand-primary);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
  }
  .logo-img {
    height: 50px;
    max-width: 160px;
    object-fit: contain;
    border-radius: 8px;
  }
  .title { font-size: 28px; font-weight: bold; }
  .subtitle { color: rgba(255,255,255,0.6); font-size: 14px; }
  .highlight-box {
    background: linear-gradient(90deg, var(--brand-secondary) 0%, color-mix(in srgb, var(--brand-secondary) 80%, black) 100%);
    color: #1a1a2e;
    padding: 16px 24px;
    border-radius: 12px;
    margin-bottom: 32px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 12px;
  }
`;
};

// El logo por URL solo sirve en HTML standalone si es absoluta (http/data:);
// una ruta relativa del frontend no resuelve en blob/workspace/SCORM.
const logoHtml = (b: Brand) =>
  b.logoUrl && /^(https?:|data:)/.test(b.logoUrl)
    ? `<img class="logo-img" src="${b.logoUrl}" alt="${b.nombre}">`
    : '<div class="logo">🏠</div>';

export function generateInfografiaHTML(guion: Guion, brand: Brand = DEFAULT_BRAND): string {
  const c = guion.contenido as {
    titulo?: string;
    dato_destacado?: string;
    secciones?: Array<{ icono: string; titulo: string; descripcion: string }>;
  };

  const secciones = c.secciones || [];

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(c.titulo || guion.bloque)} - ${esc(brand.nombreDisplay)}</title>
  <style>
    ${baseStyles(brand)}
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 24px;
    }
    .card {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px;
      padding: 24px;
      transition: all 0.3s ease;
      cursor: pointer;
    }
    .card:hover {
      transform: translateY(-4px);
      background: rgba(255,255,255,0.1);
      border-color: var(--brand-primary);
    }
    .card-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }
    .card-title {
      font-size: 20px;
      font-weight: bold;
      margin-bottom: 12px;
      color: #fff;
    }
    .card-desc {
      color: rgba(255,255,255,0.7);
      line-height: 1.6;
    }
    .card.expanded .card-desc {
      color: #fff;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      ${logoHtml(brand)}
      <div>
        <div class="title">${esc(c.titulo || guion.bloque)}</div>
        <div class="subtitle">Infografía Interactiva</div>
      </div>
    </div>

    ${c.dato_destacado ? `
    <div class="highlight-box">
      <span style="font-size: 24px;">💡</span>
      <span>${esc(c.dato_destacado)}</span>
    </div>
    ` : ''}

    <div class="grid">
      ${secciones.map((sec, i) => `
        <div class="card" onclick="this.classList.toggle('expanded')">
          <div class="card-icon">${esc(sec.icono)}</div>
          <div class="card-title">${esc(sec.titulo)}</div>
          <div class="card-desc">${esc(sec.descripcion)}</div>
        </div>
      `).join('')}
    </div>
  </div>

</body>
</html>`;
}

export function generateComparadorHTML(guion: Guion, brand: Brand = DEFAULT_BRAND): string {
  const c = guion.contenido as {
    titulo?: string;
    columnas?: string[];
    filas?: Array<{ aspecto: string; valores: string[] }>;
  };

  const columnas = c.columnas || [];
  const filas = c.filas || [];

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(c.titulo || guion.bloque)} - ${esc(brand.nombreDisplay)}</title>
  <style>
    ${baseStyles(brand)}
    .table-container {
      background: rgba(255,255,255,0.05);
      border-radius: 16px;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.1);
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th {
      background: var(--brand-primary);
      padding: 20px;
      text-align: left;
      font-weight: bold;
      font-size: 16px;
    }
    th:first-child { border-radius: 0; }
    td {
      padding: 20px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      transition: background 0.2s;
    }
    tr:hover td {
      background: rgba(255,255,255,0.05);
    }
    tr:last-child td { border-bottom: none; }
    td:first-child {
      font-weight: 600;
      color: var(--brand-secondary);
    }
    .col-highlight {
      background: color-mix(in srgb, var(--brand-primary) 10%, transparent);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      ${logoHtml(brand)}
      <div>
        <div class="title">${esc(c.titulo || guion.bloque)}</div>
        <div class="subtitle">Tabla Comparativa</div>
      </div>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Aspecto</th>
            ${columnas.map(col => `<th>${esc(col)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${filas.map(fila => `
            <tr>
              <td>${esc(fila.aspecto)}</td>
              ${fila.valores.map(val => `<td>${esc(val)}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <script>
  </script>
</body>
</html>`;
}

export function generateInteractivoHTML(guion: Guion, brand: Brand = DEFAULT_BRAND): string {
  const c = guion.contenido as {
    titulo?: string;
    instruccion?: string;
    elementos?: Array<{ etiqueta: string; contenido_oculto: string }>;
  };

  const elementos = c.elementos || [];

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(c.titulo || guion.bloque)} - ${esc(brand.nombreDisplay)}</title>
  <style>
    ${baseStyles(brand)}
    .instruction {
      color: rgba(255,255,255,0.7);
      font-style: italic;
      margin-bottom: 32px;
      font-size: 18px;
    }
    .accordion {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .accordion-item {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      overflow: hidden;
    }
    .accordion-header {
      padding: 24px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-weight: 600;
      font-size: 18px;
      transition: all 0.3s;
      background: linear-gradient(90deg, var(--brand-primary) 0%, color-mix(in srgb, var(--brand-primary) 80%, black) 100%);
    }
    .accordion-header:hover {
      filter: brightness(1.1);
    }
    .accordion-arrow {
      transition: transform 0.3s;
      font-size: 24px;
    }
    .accordion-item.open .accordion-arrow {
      transform: rotate(180deg);
    }
    .accordion-content {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.3s ease;
      background: rgba(0,0,0,0.2);
    }
    .accordion-item.open .accordion-content {
      max-height: 500px;
    }
    .accordion-content-inner {
      padding: 24px;
      line-height: 1.8;
      color: rgba(255,255,255,0.9);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      ${logoHtml(brand)}
      <div>
        <div class="title">${esc(c.titulo || guion.bloque)}</div>
        <div class="subtitle">Contenido Interactivo</div>
      </div>
    </div>

    ${c.instruccion ? `<p class="instruction">👆 ${esc(c.instruccion)}</p>` : '<p class="instruction">👆 Haz clic en cada sección para explorar</p>'}

    <div class="accordion">
      ${elementos.map((elem, i) => `
        <div class="accordion-item" onclick="toggleAccordion(this)">
          <div class="accordion-header">
            <span>${esc(elem.etiqueta)}</span>
            <span class="accordion-arrow">▼</span>
          </div>
          <div class="accordion-content">
            <div class="accordion-content-inner">${esc(elem.contenido_oculto)}</div>
          </div>
        </div>
      `).join('')}
    </div>
  </div>

  <script>
    function toggleAccordion(el) {
      el.classList.toggle('open');
    }
  </script>
</body>
</html>`;
}

export function generateFlashcardsHTML(guion: Guion, brand: Brand = DEFAULT_BRAND): string {
  // Las tarjetas pueden venir como `tarjetas`, `items` o `flashcards`,
  // y cada tarjeta como frente/reverso o pregunta/respuesta.
  const c = guion.contenido as {
    items?: Array<Record<string, string>>;
    tarjetas?: Array<Record<string, string>>;
    flashcards?: Array<Record<string, string>>;
  };

  const raw = c.tarjetas || c.items || c.flashcards || [];
  const items = raw.map((t) => ({
    frente: t.frente || t.pregunta || t.front || "",
    reverso: t.reverso || t.respuesta || t.back || "",
  }));

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(guion.bloque)} - ${esc(brand.nombreDisplay)}</title>
  <style>
    ${baseStyles(brand)}
    .instruction {
      color: rgba(255,255,255,0.7);
      margin-bottom: 32px;
      font-size: 18px;
      text-align: center;
    }
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 24px;
    }
    .flashcard {
      height: 220px;
      perspective: 1000px;
      cursor: pointer;
    }
    .flashcard-inner {
      position: relative;
      width: 100%;
      height: 100%;
      transition: transform 0.6s;
      transform-style: preserve-3d;
    }
    .flashcard.flipped .flashcard-inner {
      transform: rotateY(180deg);
    }
    .flashcard-front, .flashcard-back {
      position: absolute;
      width: 100%;
      height: 100%;
      backface-visibility: hidden;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      text-align: center;
      font-size: 18px;
      line-height: 1.5;
    }
    .flashcard-front {
      background: linear-gradient(135deg, var(--brand-primary) 0%, color-mix(in srgb, var(--brand-primary) 80%, black) 100%);
      font-weight: bold;
    }
    .flashcard-back {
      background: linear-gradient(135deg, #16213e 0%, #0f3460 100%);
      border: 2px solid var(--brand-primary);
      transform: rotateY(180deg);
    }
    .card-number {
      position: absolute;
      top: 12px;
      left: 12px;
      background: rgba(0,0,0,0.3);
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      ${logoHtml(brand)}
      <div>
        <div class="title">${esc(guion.bloque)}</div>
        <div class="subtitle">Flashcards</div>
      </div>
    </div>

    <p class="instruction">🔄 Haz clic en cada tarjeta para ver la respuesta</p>

    <div class="cards-grid">
      ${items.map((item, i) => `
        <div class="flashcard" onclick="this.classList.toggle('flipped')">
          <div class="flashcard-inner">
            <div class="flashcard-front">
              <span class="card-number">${i + 1}/${items.length}</span>
              ${esc(item.frente)}
            </div>
            <div class="flashcard-back">
              <span class="card-number">${i + 1}/${items.length}</span>
              ${esc(item.reverso)}
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  </div>

  <script>
  </script>
</body>
</html>`;
}

export function generateQuizHTML(guion: Guion, brand: Brand = DEFAULT_BRAND): string {
  const c = guion.contenido as {
    preguntas?: Array<{ pregunta: string; opciones: string[]; correcta: number }>;
  };

  const preguntas = c.preguntas || [];

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(guion.bloque)} - ${esc(brand.nombreDisplay)}</title>
  <style>
    ${baseStyles(brand)}
    .quiz-container { max-width: 800px; margin: 0 auto; }
    .question {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px;
      padding: 32px;
      margin-bottom: 24px;
    }
    .question-number {
      color: var(--brand-primary);
      font-weight: bold;
      margin-bottom: 8px;
    }
    .question-text {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 24px;
    }
    .options { display: flex; flex-direction: column; gap: 12px; }
    .option {
      padding: 16px 20px;
      background: rgba(255,255,255,0.05);
      border: 2px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .option:hover { border-color: var(--brand-primary); background: color-mix(in srgb, var(--brand-primary) 10%, transparent); }
    .option.selected { border-color: #3b82f6; background: rgba(59,130,246,0.2); }
    .option.correct { border-color: #22c55e; background: rgba(34,197,94,0.2); }
    .option.incorrect { border-color: #ef4444; background: rgba(239,68,68,0.2); }
    .option-letter {
      width: 32px;
      height: 32px;
      background: rgba(255,255,255,0.1);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
    }
    .check-btn {
      background: var(--brand-primary);
      color: white;
      border: none;
      padding: 16px 32px;
      border-radius: 12px;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
      margin-top: 16px;
    }
    .check-btn:hover { filter: brightness(1.1); }
    .check-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .result {
      margin-top: 16px;
      padding: 16px;
      border-radius: 12px;
      font-weight: 600;
      display: none;
    }
    .result.show { display: block; }
    .result.correct { background: rgba(34,197,94,0.2); color: #22c55e; }
    .result.incorrect { background: rgba(239,68,68,0.2); color: #ef4444; }
    .progress-bar {
      background: rgba(255,255,255,0.1);
      height: 8px;
      border-radius: 4px;
      margin-bottom: 32px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      background: var(--brand-primary);
      transition: width 0.3s;
    }
  </style>
</head>
<body>
  <div class="container quiz-container">
    <div class="header">
      ${logoHtml(brand)}
      <div>
        <div class="title">${esc(guion.bloque)}</div>
        <div class="subtitle">Evaluación - ${preguntas.length} preguntas</div>
      </div>
    </div>

    <div class="progress-bar">
      <div class="progress-fill" id="progress" style="width: 0%"></div>
    </div>

    ${preguntas.map((q, i) => `
      <div class="question" id="q${i}" ${i > 0 ? 'style="display:none"' : ''}>
        <div class="question-number">Pregunta ${i + 1} de ${preguntas.length}</div>
        <div class="question-text">${esc(q.pregunta)}</div>
        <div class="options">
          ${q.opciones.map((opt, j) => `
            <div class="option" data-q="${i}" data-opt="${j}" data-correct="${Number(q.correcta)}" onclick="selectOption(this)">
              <span class="option-letter">${String.fromCharCode(65 + j)}</span>
              <span>${esc(opt)}</span>
            </div>
          `).join('')}
        </div>
        <button class="check-btn" id="btn${i}" onclick="checkAnswer(${i}, ${Number(q.correcta)})" disabled>Verificar</button>
        <div class="result" id="result${i}"></div>
      </div>
    `).join('')}

    <div id="finalResult" style="display:none; text-align:center; padding: 48px;">
      <div style="font-size: 64px; margin-bottom: 24px;">🎉</div>
      <div style="font-size: 32px; font-weight: bold; margin-bottom: 16px;">¡Quiz completado!</div>
      <div style="font-size: 24px;" id="scoreText"></div>
    </div>
  </div>

  <script>
    let currentQ = 0;
    let score = 0;
    const total = ${preguntas.length};

    function selectOption(el) {
      const q = el.dataset.q;
      document.querySelectorAll(\`.option[data-q="\${q}"]\`).forEach(o => o.classList.remove('selected'));
      el.classList.add('selected');
      document.getElementById('btn' + q).disabled = false;
    }

    function checkAnswer(q, correct) {
      const selected = document.querySelector(\`.option[data-q="\${q}"].selected\`);
      const result = document.getElementById('result' + q);
      const isCorrect = parseInt(selected.dataset.opt) === correct;

      document.querySelectorAll(\`.option[data-q="\${q}"]\`).forEach(o => {
        if (parseInt(o.dataset.opt) === correct) o.classList.add('correct');
        else if (o.classList.contains('selected')) o.classList.add('incorrect');
        o.style.pointerEvents = 'none';
      });

      if (isCorrect) {
        score++;
        result.textContent = '✓ ¡Correcto!';
        result.className = 'result show correct';
      } else {
        result.textContent = '✗ Incorrecto. La respuesta correcta era ' + String.fromCharCode(65 + correct);
        result.className = 'result show incorrect';
      }

      document.getElementById('btn' + q).style.display = 'none';
      document.getElementById('progress').style.width = ((q + 1) / total * 100) + '%';

      setTimeout(() => {
        if (q < total - 1) {
          document.getElementById('q' + q).style.display = 'none';
          document.getElementById('q' + (q + 1)).style.display = 'block';
        } else {
          document.querySelectorAll('.question').forEach(el => el.style.display = 'none');
          document.getElementById('finalResult').style.display = 'block';
          document.getElementById('scoreText').textContent = 'Obtuviste ' + score + '/' + total + ' (' + Math.round(score/total*100) + '%)';
          // Reportar score al player SCORM (si está embebido en un iframe)
          try { window.parent.postMessage({ type: 'scorm-quiz-score', score: score, total: total }, '*'); } catch (e) {}
        }
      }, 1500);
    }

  </script>
</body>
</html>`;
}

export function generateCasoPracticoHTML(guion: Guion, brand: Brand = DEFAULT_BRAND): string {
  const c = guion.contenido as {
    escenario?: string;
    preguntas?: Array<{ pregunta: string; opciones: string[]; correcta: number; feedback?: string }>;
  };

  const preguntas = c.preguntas || [];

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(guion.bloque)} - ${esc(brand.nombreDisplay)}</title>
  <style>
    ${baseStyles(brand)}
    .case-container { max-width: 900px; margin: 0 auto; }
    .scenario {
      background: linear-gradient(135deg, rgba(59,130,246,0.2) 0%, rgba(37,99,235,0.2) 100%);
      border-left: 4px solid #3b82f6;
      padding: 24px;
      border-radius: 0 16px 16px 0;
      margin-bottom: 32px;
      line-height: 1.8;
    }
    .scenario-label {
      color: #60a5fa;
      font-weight: bold;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .question {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px;
      padding: 32px;
      margin-bottom: 24px;
      opacity: 0.5;
      pointer-events: none;
      transition: all 0.3s;
    }
    .question.active {
      opacity: 1;
      pointer-events: auto;
      border-color: var(--brand-primary);
    }
    .question.completed {
      opacity: 0.7;
      pointer-events: none;
    }
    .question-text {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 20px;
    }
    .options { display: flex; flex-direction: column; gap: 12px; }
    .option {
      padding: 16px 20px;
      background: rgba(255,255,255,0.05);
      border: 2px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .option:hover { border-color: var(--brand-primary); }
    .option.correct { border-color: #22c55e; background: rgba(34,197,94,0.2); }
    .option.incorrect { border-color: #ef4444; background: rgba(239,68,68,0.2); }
    .feedback {
      margin-top: 16px;
      padding: 16px;
      background: rgba(251,191,36,0.1);
      border-radius: 12px;
      display: none;
    }
    .feedback.show { display: block; }
  </style>
</head>
<body>
  <div class="container case-container">
    <div class="header">
      ${logoHtml(brand)}
      <div>
        <div class="title">${esc(guion.bloque)}</div>
        <div class="subtitle">Caso Práctico</div>
      </div>
    </div>

    ${c.escenario ? `
    <div class="scenario">
      <div class="scenario-label">📋 Escenario</div>
      <p>${esc(c.escenario)}</p>
    </div>
    ` : ''}

    ${preguntas.map((q, i) => `
      <div class="question ${i === 0 ? 'active' : ''}" id="q${i}">
        <div class="question-text">${i + 1}. ${esc(q.pregunta)}</div>
        <div class="options">
          ${q.opciones.map((opt, j) => `
            <div class="option" onclick="answer(${i}, ${j}, ${Number(q.correcta)})">${esc(opt)}</div>
          `).join('')}
        </div>
        <div class="feedback" id="feedback${i}">💡 ${esc(q.feedback || 'Continúa al siguiente paso.')}</div>
      </div>
    `).join('')}

    <div id="complete" style="display:none; text-align:center; padding: 48px;">
      <div style="font-size: 64px; margin-bottom: 24px;">✅</div>
      <div style="font-size: 24px; font-weight: bold;">¡Caso completado!</div>
    </div>
  </div>

  <script>
    function answer(q, selected, correct) {
      const options = document.querySelectorAll('#q' + q + ' .option');
      options.forEach((o, i) => {
        if (i === correct) o.classList.add('correct');
        else if (i === selected && i !== correct) o.classList.add('incorrect');
        o.style.pointerEvents = 'none';
      });

      document.getElementById('feedback' + q).classList.add('show');
      document.getElementById('q' + q).classList.remove('active');
      document.getElementById('q' + q).classList.add('completed');

      setTimeout(() => {
        const next = document.getElementById('q' + (q + 1));
        if (next) {
          next.classList.add('active');
          next.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          document.getElementById('complete').style.display = 'block';
        }
      }, 2000);
    }
  </script>
</body>
</html>`;
}

// Manual: documento explicativo detallado con secciones. Lo usan mucho las
// áreas de Learning para explicar temas a fondo y dejarlos para consulta.
export function generateManualHTML(guion: Guion, brand: Brand = DEFAULT_BRAND): string {
  const c = guion.contenido as {
    titulo?: string;
    introduccion?: string;
    secciones?: Array<{ titulo: string; contenido: string }>;
  };
  const secciones = c.secciones || [];
  // Convierte párrafos y viñetas simples ("- ") del contenido a HTML seguro.
  const cuerpo = (txt: string) =>
    String(txt || "").split(/\n\n+/).map((bloque) => {
      const lineas = bloque.split("\n");
      if (lineas.every((l) => /^\s*[-•]\s+/.test(l))) {
        return `<ul>${lineas.map((l) => `<li>${esc(l.replace(/^\s*[-•]\s+/, ""))}</li>`).join("")}</ul>`;
      }
      return `<p>${esc(bloque)}</p>`;
    }).join("");

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(c.titulo || guion.bloque)} - ${esc(brand.nombreDisplay)}</title>
<style>
  ${baseStyles(brand)}
  body { background: #f7f8fb; color: #1a1a2e; }
  .doc { max-width: 860px; margin: 0 auto; background: #fff; border-radius: 16px; padding: 48px; box-shadow: 0 2px 24px rgba(0,0,0,.06); }
  .doc h1 { color: #1a1a2e; font-size: 30px; margin-bottom: 8px; }
  .intro { color: #555; font-size: 17px; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 2px solid var(--brand-primary); }
  .sec { margin-bottom: 28px; }
  .sec h2 { font-size: 20px; color: var(--brand-primary); margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
  .sec .num { display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:50%; background: var(--brand-primary); color:#fff; font-size:13px; }
  .sec p { color: #333; line-height: 1.75; margin-bottom: 12px; }
  .sec ul { margin: 8px 0 12px 22px; color: #333; line-height: 1.7; }
  .toc { background:#f0f2f7; border-radius:12px; padding:16px 20px; margin-bottom:28px; }
  .toc p { font-weight:600; margin-bottom:6px; font-size:13px; text-transform:uppercase; letter-spacing:.04em; color:#888; }
  .toc a { color: var(--brand-primary); text-decoration:none; display:block; padding:3px 0; }
</style></head>
<body>
  <div class="doc">
    <div class="header" style="border:0;padding:0;margin-bottom:16px">${logoHtml(brand)}</div>
    <h1>${esc(c.titulo || guion.bloque)}</h1>
    ${c.introduccion ? `<p class="intro">${esc(c.introduccion)}</p>` : ""}
    ${secciones.length > 1 ? `<div class="toc"><p>Contenido</p>${secciones.map((s, i) => `<a href="#s${i}">${i + 1}. ${esc(s.titulo)}</a>`).join("")}</div>` : ""}
    ${secciones.map((s, i) => `
      <div class="sec" id="s${i}">
        <h2><span class="num">${i + 1}</span> ${esc(s.titulo)}</h2>
        ${cuerpo(s.contenido)}
      </div>`).join("")}
  </div>
</body></html>`;
}

// Video externo: referencia a un curso/video de terceros (YouTube u oficial).
export function generateVideoExternoHTML(guion: Guion, brand: Brand = DEFAULT_BRAND): string {
  const c = guion.contenido as { titulo?: string; url?: string; descripcion?: string };
  const url = String(c.url || "").trim();
  const safe = /^https?:\/\//i.test(url) ? url : "";
  // Embed de YouTube si es un link de YouTube; si no, tarjeta con enlace.
  const ytId = safe.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/)?.[1];
  const embed = ytId
    ? `<div class="frame"><iframe src="https://www.youtube.com/embed/${ytId}" allowfullscreen title="video"></iframe></div>`
    : safe
    ? `<a class="cta" href="${safe}" target="_blank" rel="noreferrer">▶ Abrir el curso externo</a>`
    : `<p class="pendiente">⚠ El equipo de Learning debe completar el enlace de este recurso.</p>`;
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(c.titulo || guion.bloque)} - ${esc(brand.nombreDisplay)}</title>
<style>
  ${baseStyles(brand)}
  .frame { position: relative; padding-bottom: 56.25%; height: 0; border-radius: 16px; overflow: hidden; margin-top: 24px; }
  .frame iframe { position: absolute; top:0; left:0; width:100%; height:100%; border:0; }
  .desc { color: rgba(255,255,255,.8); margin-top: 20px; line-height: 1.6; font-size: 17px; }
  .cta { display:inline-block; margin-top:24px; background: var(--brand-primary); color:#fff; padding:14px 28px; border-radius:12px; text-decoration:none; font-weight:600; }
  .pendiente { margin-top:24px; color:#ffd; background: rgba(255,255,255,.08); padding:16px; border-radius:12px; }
</style></head>
<body>
  <div class="container">
    <div class="header">${logoHtml(brand)}<div><div class="title">${esc(c.titulo || guion.bloque)}</div><div class="subtitle">Curso externo</div></div></div>
    ${c.descripcion ? `<p class="desc">${esc(c.descripcion)}</p>` : ""}
    ${embed}
  </div>
</body></html>`;
}

// Genera el HTML standalone de un recurso a partir de su guión JSON.
// Es la "semilla" que edita el Modo Agente en la fase de Contenido.
export function generateResourceHTML(guion: Guion, tipo: string, brand: Brand = DEFAULT_BRAND): string {
  switch (tipo) {
    case 'Infografía':
      return generateInfografiaHTML(guion, brand);
    case 'Comparador':
      return generateComparadorHTML(guion, brand);
    case 'Interactivo':
      return generateInteractivoHTML(guion, brand);
    case 'Flashcards':
      return generateFlashcardsHTML(guion, brand);
    case 'Quiz':
      return generateQuizHTML(guion, brand);
    case 'Caso práctico':
      return generateCasoPracticoHTML(guion, brand);
    case 'Manual':
      return generateManualHTML(guion, brand);
    case 'Video externo':
      return generateVideoExternoHTML(guion, brand);
    default:
      return `<html><body><h1>Tipo no soportado: ${esc(tipo)}</h1><pre>${esc(JSON.stringify(guion.contenido, null, 2))}</pre></body></html>`;
  }
}

export function openResourceInNewTab(guion: Guion, tipo: string, brand: Brand = DEFAULT_BRAND): void {
  const html = generateResourceHTML(guion, tipo, brand);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}
