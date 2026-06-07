/**
 * Genera HTML completo para cada tipo de recurso
 * Este HTML es el mismo que irá al SCORM
 */

import { Guion } from "./api";

const BASE_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', system-ui, sans-serif;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
    min-height: 100vh;
    color: white;
    padding: 40px;
  }
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
    background: #DA291C;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
  }
  .title { font-size: 28px; font-weight: bold; }
  .subtitle { color: rgba(255,255,255,0.6); font-size: 14px; }
  .highlight-box {
    background: linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%);
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

export function generateInfografiaHTML(guion: Guion): string {
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
  <title>${c.titulo || guion.bloque} - Davivienda E-Learning</title>
  <style>
    ${BASE_STYLES}
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
      border-color: #DA291C;
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
      <div class="logo">🏠</div>
      <div>
        <div class="title">${c.titulo || guion.bloque}</div>
        <div class="subtitle">Infografía Interactiva</div>
      </div>
    </div>

    ${c.dato_destacado ? `
    <div class="highlight-box">
      <span style="font-size: 24px;">💡</span>
      <span>${c.dato_destacado}</span>
    </div>
    ` : ''}

    <div class="grid">
      ${secciones.map((sec, i) => `
        <div class="card" onclick="this.classList.toggle('expanded')">
          <div class="card-icon">${sec.icono}</div>
          <div class="card-title">${sec.titulo}</div>
          <div class="card-desc">${sec.descripcion}</div>
        </div>
      `).join('')}
    </div>
  </div>

</body>
</html>`;
}

export function generateComparadorHTML(guion: Guion): string {
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
  <title>${c.titulo || guion.bloque} - Davivienda E-Learning</title>
  <style>
    ${BASE_STYLES}
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
      background: #DA291C;
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
      color: #fbbf24;
    }
    .col-highlight {
      background: rgba(218, 41, 28, 0.1);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">🏠</div>
      <div>
        <div class="title">${c.titulo || guion.bloque}</div>
        <div class="subtitle">Tabla Comparativa</div>
      </div>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Aspecto</th>
            ${columnas.map(col => `<th>${col}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${filas.map(fila => `
            <tr>
              <td>${fila.aspecto}</td>
              ${fila.valores.map(val => `<td>${val}</td>`).join('')}
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

export function generateInteractivoHTML(guion: Guion): string {
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
  <title>${c.titulo || guion.bloque} - Davivienda E-Learning</title>
  <style>
    ${BASE_STYLES}
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
      background: linear-gradient(90deg, #DA291C 0%, #b91c1c 100%);
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
      <div class="logo">🏠</div>
      <div>
        <div class="title">${c.titulo || guion.bloque}</div>
        <div class="subtitle">Contenido Interactivo</div>
      </div>
    </div>

    ${c.instruccion ? `<p class="instruction">👆 ${c.instruccion}</p>` : '<p class="instruction">👆 Haz clic en cada sección para explorar</p>'}

    <div class="accordion">
      ${elementos.map((elem, i) => `
        <div class="accordion-item" onclick="toggleAccordion(this)">
          <div class="accordion-header">
            <span>${elem.etiqueta}</span>
            <span class="accordion-arrow">▼</span>
          </div>
          <div class="accordion-content">
            <div class="accordion-content-inner">${elem.contenido_oculto}</div>
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

export function generateFlashcardsHTML(guion: Guion): string {
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
  <title>${guion.bloque} - Davivienda E-Learning</title>
  <style>
    ${BASE_STYLES}
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
      background: linear-gradient(135deg, #DA291C 0%, #b91c1c 100%);
      font-weight: bold;
    }
    .flashcard-back {
      background: linear-gradient(135deg, #16213e 0%, #0f3460 100%);
      border: 2px solid #DA291C;
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
      <div class="logo">🏠</div>
      <div>
        <div class="title">${guion.bloque}</div>
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
              ${item.frente}
            </div>
            <div class="flashcard-back">
              <span class="card-number">${i + 1}/${items.length}</span>
              ${item.reverso}
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

export function generateQuizHTML(guion: Guion): string {
  const c = guion.contenido as {
    preguntas?: Array<{ pregunta: string; opciones: string[]; correcta: number }>;
  };

  const preguntas = c.preguntas || [];

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${guion.bloque} - Davivienda E-Learning</title>
  <style>
    ${BASE_STYLES}
    .quiz-container { max-width: 800px; margin: 0 auto; }
    .question {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px;
      padding: 32px;
      margin-bottom: 24px;
    }
    .question-number {
      color: #DA291C;
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
    .option:hover { border-color: #DA291C; background: rgba(218,41,28,0.1); }
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
      background: #DA291C;
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
      background: #DA291C;
      transition: width 0.3s;
    }
  </style>
</head>
<body>
  <div class="container quiz-container">
    <div class="header">
      <div class="logo">🏠</div>
      <div>
        <div class="title">${guion.bloque}</div>
        <div class="subtitle">Evaluación - ${preguntas.length} preguntas</div>
      </div>
    </div>

    <div class="progress-bar">
      <div class="progress-fill" id="progress" style="width: 0%"></div>
    </div>

    ${preguntas.map((q, i) => `
      <div class="question" id="q${i}" ${i > 0 ? 'style="display:none"' : ''}>
        <div class="question-number">Pregunta ${i + 1} de ${preguntas.length}</div>
        <div class="question-text">${q.pregunta}</div>
        <div class="options">
          ${q.opciones.map((opt, j) => `
            <div class="option" data-q="${i}" data-opt="${j}" data-correct="${q.correcta}" onclick="selectOption(this)">
              <span class="option-letter">${String.fromCharCode(65 + j)}</span>
              <span>${opt}</span>
            </div>
          `).join('')}
        </div>
        <button class="check-btn" id="btn${i}" onclick="checkAnswer(${i}, ${q.correcta})" disabled>Verificar</button>
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

export function generateCasoPracticoHTML(guion: Guion): string {
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
  <title>${guion.bloque} - Davivienda E-Learning</title>
  <style>
    ${BASE_STYLES}
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
      border-color: #DA291C;
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
    .option:hover { border-color: #DA291C; }
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
      <div class="logo">🏠</div>
      <div>
        <div class="title">${guion.bloque}</div>
        <div class="subtitle">Caso Práctico</div>
      </div>
    </div>

    ${c.escenario ? `
    <div class="scenario">
      <div class="scenario-label">📋 Escenario</div>
      <p>${c.escenario}</p>
    </div>
    ` : ''}

    ${preguntas.map((q, i) => `
      <div class="question ${i === 0 ? 'active' : ''}" id="q${i}">
        <div class="question-text">${i + 1}. ${q.pregunta}</div>
        <div class="options">
          ${q.opciones.map((opt, j) => `
            <div class="option" onclick="answer(${i}, ${j}, ${q.correcta})">${opt}</div>
          `).join('')}
        </div>
        <div class="feedback" id="feedback${i}">💡 ${q.feedback || 'Continúa al siguiente paso.'}</div>
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

// Genera el HTML standalone de un recurso a partir de su guión JSON.
// Es la "semilla" que edita el Modo Agente en la fase de Contenido.
export function generateResourceHTML(guion: Guion, tipo: string): string {
  switch (tipo) {
    case 'Infografía':
      return generateInfografiaHTML(guion);
    case 'Comparador':
      return generateComparadorHTML(guion);
    case 'Interactivo':
      return generateInteractivoHTML(guion);
    case 'Flashcards':
      return generateFlashcardsHTML(guion);
    case 'Quiz':
      return generateQuizHTML(guion);
    case 'Caso práctico':
      return generateCasoPracticoHTML(guion);
    default:
      return `<html><body><h1>Tipo no soportado: ${tipo}</h1><pre>${JSON.stringify(guion.contenido, null, 2)}</pre></body></html>`;
  }
}

export function openResourceInNewTab(guion: Guion, tipo: string): void {
  const html = generateResourceHTML(guion, tipo);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}
