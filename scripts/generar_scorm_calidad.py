#!/usr/bin/env python3
"""
Generador de SCORM de Alta Calidad - Davivienda
Genera contenido visual rico siguiendo la línea gráfica 2026
"""

import os
import shutil
import zipfile
from pathlib import Path

# Configuración
CURSO_NOMBRE = "FATCA & CRS: Cumplimiento Normativo"
OUTPUT_DIR = Path("/Users/federico/Desktop/ia-davivienda/output/scorm_fatca_crs_hq")
SCORM_ZIP = Path("/Users/federico/Desktop/ia-davivienda/output/scorm_fatca_crs_hq.zip")

# Iconos SVG inline
ICONS = {
    "documento": '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20M13,13V18H10V13H7L12,8L17,13H13Z"/></svg>',
    "persona": '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z"/></svg>',
    "mundo": '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.9,17.39C17.64,16.59 16.89,16 16,16H15V13A1,1 0 0,0 14,12H8V10H10A1,1 0 0,0 11,9V7H13A2,2 0 0,0 15,5V4.59C17.93,5.77 20,8.64 20,12C20,14.08 19.2,15.97 17.9,17.39M11,19.93C7.05,19.44 4,16.08 4,12C4,11.38 4.08,10.78 4.21,10.21L9,15V16A2,2 0 0,0 11,18M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z"/></svg>',
    "banco": '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.5,1L2,6V8H21V6M16,10V17H19V10M2,22H21V19H2M10,10V17H13V10M4,10V17H7V10H4Z"/></svg>',
    "check": '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z"/></svg>',
    "alerta": '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13,13H11V7H13M13,17H11V15H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z"/></svg>',
    "dinero": '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5,6H23V18H5V6M14,9A3,3 0 0,1 17,12A3,3 0 0,1 14,15A3,3 0 0,1 11,12A3,3 0 0,1 14,9M9,8A2,2 0 0,1 7,10V14A2,2 0 0,1 9,16H19A2,2 0 0,1 21,14V10A2,2 0 0,1 19,8H9M1,10H3V20H19V22H1V10Z"/></svg>',
}


def generar_interactivo_documentacion():
    """Genera slide interactivo de Documentación Requerida"""

    items = [
        {
            "num": 1, "color": "#DA291C", "titulo": "Formulario W-9",
            "contenido": "Para ciudadanos o residentes estadounidenses. Incluye nombre, dirección, TIN (Tax Identification Number) y certificación de estatus fiscal."
        },
        {
            "num": 2, "color": "#F5A623", "titulo": "Formulario W-8BEN",
            "contenido": "Para personas naturales extranjeras. Certifica que no son US persons y permite aplicar beneficios de tratados fiscales."
        },
        {
            "num": 3, "color": "#4A90D9", "titulo": "Formulario W-8BEN-E",
            "contenido": "Para entidades extranjeras (empresas). Documenta el estatus FATCA de la entidad y sus beneficiarios controlantes."
        },
        {
            "num": 4, "color": "#00B5AD", "titulo": "Autocertificación CRS",
            "contenido": "Declaración de residencia fiscal para efectos del CRS. Incluye países de residencia fiscal y números de identificación tributaria."
        },
    ]

    items_html = ""
    for item in items:
        items_html += f'''
        <div class="slide">
            <div class="interactive-layout">
                <div class="numbers-column">
                    {"".join([f'<div class="num-circle {"active" if i["num"] == item["num"] else ""}" style="--color: {i["color"]}" onclick="showItem({i["num"]})">{i["num"]}</div>' for i in items])}
                </div>
                <div class="content-column">
                    <div class="content-card">
                        <div class="card-header" style="border-left-color: {item["color"]}">
                            <div class="icon-box" style="background: {item["color"]}">
                                {ICONS["documento"]}
                            </div>
                            <h3>{item["titulo"]}</h3>
                        </div>
                        <div class="card-body">
                            <p>{item["contenido"]}</p>
                            <div class="tip-box">
                                <span class="tip-icon">💡</span>
                                <span>Tip: Verifica que todos los campos estén completos antes de enviar al cliente.</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="image-column">
                    <div class="doc-preview">
                        <div class="doc-icon">{ICONS["documento"]}</div>
                        <span>{item["titulo"]}</span>
                    </div>
                </div>
            </div>
        </div>
        '''

    styles = '''
        .interactive-layout {
            display: grid;
            grid-template-columns: 80px 1fr 250px;
            gap: 40px;
            align-items: start;
        }

        .numbers-column {
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        .num-circle {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: var(--color);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Montserrat', sans-serif;
            font-weight: 700;
            font-size: 1.5em;
            cursor: pointer;
            transition: all 0.3s;
            opacity: 0.5;
            transform: scale(0.85);
        }

        .num-circle.active {
            opacity: 1;
            transform: scale(1);
            box-shadow: 0 0 0 4px rgba(218, 41, 28, 0.2);
        }

        .content-card {
            background: white;
            border-radius: 20px;
            overflow: hidden;
            box-shadow: 0 8px 30px rgba(0,0,0,0.1);
        }

        .card-header {
            padding: 25px 30px;
            border-left: 5px solid;
            display: flex;
            align-items: center;
            gap: 20px;
            background: linear-gradient(90deg, #fff9f8 0%, white 100%);
        }

        .icon-box {
            width: 55px;
            height: 55px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
        }

        .icon-box svg {
            width: 30px;
            height: 30px;
        }

        .card-header h3 {
            font-family: 'Montserrat', sans-serif;
            color: var(--davi-red);
            font-size: 1.4em;
        }

        .card-body {
            padding: 25px 30px;
        }

        .card-body p {
            color: var(--text-gray);
            line-height: 1.8;
            font-size: 1.05em;
        }

        .tip-box {
            margin-top: 25px;
            padding: 15px 20px;
            background: #FFF8E6;
            border-radius: 12px;
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 0.95em;
            color: #8B6914;
        }

        .tip-icon {
            font-size: 1.3em;
        }

        .image-column {
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        .doc-preview {
            background: white;
            padding: 30px;
            border-radius: 16px;
            text-align: center;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
            border: 2px dashed #ddd;
        }

        .doc-icon {
            width: 80px;
            height: 80px;
            margin: 0 auto 15px;
            color: var(--davi-red);
        }

        .doc-icon svg {
            width: 100%;
            height: 100%;
        }

        .doc-preview span {
            color: var(--text-gray);
            font-weight: 600;
        }
    '''

    return crear_html("Documentación Requerida",
                      "Conoce los formularios que tus clientes deben completar según su estatus fiscal.",
                      items_html, styles, len(items))


def generar_comparador():
    """Genera comparador FATCA vs CRS"""

    rows = [
        ("Origen", "Estados Unidos (IRS)", "OCDE (136+ países)"),
        ("Objetivo", "Combatir evasión fiscal de US persons", "Intercambio automático de información fiscal global"),
        ("Aplica a", "Ciudadanos y residentes de EE.UU.", "Residentes fiscales de países adheridos"),
        ("Umbral de reporte", "USD $50,000 en cuentas", "Varía por país (algunos sin umbral)"),
        ("Formularios", "W-9, W-8BEN, W-8BEN-E", "Autocertificación CRS"),
        ("Penalidad", "30% retención sobre pagos de fuente US", "Sanciones locales según jurisdicción"),
    ]

    slides_html = ""

    # Slide 1: Tabla comparativa
    rows_html = ""
    for aspecto, fatca, crs in rows:
        rows_html += f'''
        <tr>
            <td class="aspect-cell">{aspecto}</td>
            <td>{fatca}</td>
            <td>{crs}</td>
        </tr>
        '''

    slides_html += f'''
    <div class="slide active">
        <div class="comparison-container">
            <div class="table-wrapper">
                <table class="comparison-table">
                    <thead>
                        <tr>
                            <th class="aspect-header">Aspecto</th>
                            <th><div class="header-badge fatca">{ICONS["banco"]} FATCA</div></th>
                            <th><div class="header-badge crs">{ICONS["mundo"]} CRS</div></th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows_html}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    '''

    # Slide 2: Resumen visual
    slides_html += f'''
    <div class="slide">
        <div class="summary-grid">
            <div class="summary-card fatca">
                <div class="card-icon">{ICONS["banco"]}</div>
                <h3>FATCA</h3>
                <p class="tagline">Foreign Account Tax Compliance Act</p>
                <ul>
                    <li>Ley de EE.UU. desde 2010</li>
                    <li>Enfocada en US persons</li>
                    <li>Retención del 30% como sanción</li>
                    <li>Reporta al IRS</li>
                </ul>
            </div>
            <div class="vs-circle">VS</div>
            <div class="summary-card crs">
                <div class="card-icon">{ICONS["mundo"]}</div>
                <h3>CRS</h3>
                <p class="tagline">Common Reporting Standard</p>
                <ul>
                    <li>Estándar OCDE desde 2014</li>
                    <li>136+ países participantes</li>
                    <li>Intercambio automático</li>
                    <li>Reporta a autoridades locales</li>
                </ul>
            </div>
        </div>
    </div>
    '''

    styles = '''
        .comparison-container {
            max-width: 1000px;
            margin: 0 auto;
        }

        .table-wrapper {
            background: white;
            border-radius: 20px;
            overflow: hidden;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
        }

        .comparison-table {
            width: 100%;
            border-collapse: collapse;
        }

        .comparison-table th {
            background: linear-gradient(135deg, #1a1a2e 0%, #2d2d44 100%);
            color: white;
            padding: 20px 25px;
            text-align: left;
            font-family: 'Montserrat', sans-serif;
        }

        .aspect-header {
            width: 180px;
        }

        .header-badge {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: 600;
            width: fit-content;
        }

        .header-badge svg {
            width: 20px;
            height: 20px;
        }

        .header-badge.fatca {
            background: var(--davi-red);
        }

        .header-badge.crs {
            background: var(--davi-blue);
        }

        .comparison-table td {
            padding: 18px 25px;
            border-bottom: 1px solid #eee;
            color: var(--text-gray);
            line-height: 1.5;
        }

        .comparison-table tr:hover td {
            background: #fafafa;
        }

        .aspect-cell {
            font-weight: 600;
            color: var(--text-dark);
            background: #f8f8f8;
        }

        /* Slide 2 - Summary */
        .summary-grid {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 30px;
        }

        .summary-card {
            background: white;
            padding: 40px;
            border-radius: 20px;
            width: 350px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
            text-align: center;
        }

        .summary-card.fatca {
            border-top: 5px solid var(--davi-red);
        }

        .summary-card.crs {
            border-top: 5px solid var(--davi-blue);
        }

        .card-icon {
            width: 70px;
            height: 70px;
            margin: 0 auto 20px;
            background: var(--bg-light);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .summary-card.fatca .card-icon {
            color: var(--davi-red);
        }

        .summary-card.crs .card-icon {
            color: var(--davi-blue);
        }

        .card-icon svg {
            width: 35px;
            height: 35px;
        }

        .summary-card h3 {
            font-family: 'Montserrat', sans-serif;
            font-size: 1.8em;
            margin-bottom: 5px;
        }

        .summary-card.fatca h3 { color: var(--davi-red); }
        .summary-card.crs h3 { color: var(--davi-blue); }

        .tagline {
            color: var(--text-light);
            font-size: 0.9em;
            margin-bottom: 25px;
        }

        .summary-card ul {
            text-align: left;
            list-style: none;
        }

        .summary-card li {
            padding: 10px 0;
            border-bottom: 1px solid #eee;
            color: var(--text-gray);
        }

        .summary-card li:last-child {
            border-bottom: none;
        }

        .vs-circle {
            width: 60px;
            height: 60px;
            background: var(--davi-orange);
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Montserrat', sans-serif;
            font-weight: 700;
            font-size: 1.2em;
        }
    '''

    return crear_html("Comparador: FATCA vs CRS",
                      "Entiende las diferencias clave entre ambas regulaciones.",
                      slides_html, styles, 2)


def generar_quiz():
    """Genera quiz interactivo"""

    preguntas = [
        {
            "pregunta": "¿Qué formulario debe completar un ciudadano estadounidense?",
            "opciones": ["W-8BEN", "W-9", "Autocertificación CRS", "W-8BEN-E"],
            "correcta": 1,
            "feedback": "Correcto. El W-9 es para ciudadanos y residentes de EE.UU."
        },
        {
            "pregunta": "¿Cuál es el umbral mínimo de reporte para FATCA?",
            "opciones": ["USD $10,000", "USD $25,000", "USD $50,000", "No hay umbral"],
            "correcta": 2,
            "feedback": "Correcto. FATCA requiere reportar cuentas con más de USD $50,000."
        },
        {
            "pregunta": "¿Cuántos países participan aproximadamente en el CRS?",
            "opciones": ["50 países", "100 países", "136+ países", "200+ países"],
            "correcta": 2,
            "feedback": "Correcto. Más de 136 jurisdicciones se han comprometido con el CRS."
        },
    ]

    slides_html = ""
    for i, q in enumerate(preguntas):
        opciones_html = ""
        for j, op in enumerate(q["opciones"]):
            opciones_html += f'''
            <div class="quiz-option" data-correct="{1 if j == q['correcta'] else 0}" onclick="selectOption(this, {i})">
                <span class="option-letter">{chr(65+j)}</span>
                <span class="option-text">{op}</span>
                <span class="option-icon"></span>
            </div>
            '''

        slides_html += f'''
        <div class="slide {"active" if i == 0 else ""}">
            <div class="quiz-container">
                <div class="question-header">
                    <span class="question-num">Pregunta {i+1} de {len(preguntas)}</span>
                    <div class="progress-dots">
                        {"".join([f'<span class="dot {"active" if j <= i else ""}"></span>' for j in range(len(preguntas))])}
                    </div>
                </div>
                <div class="question-card">
                    <h2>{q["pregunta"]}</h2>
                    <div class="options-grid">
                        {opciones_html}
                    </div>
                    <div class="feedback-box" id="feedback-{i}">
                        <span class="feedback-icon">✓</span>
                        <span class="feedback-text">{q["feedback"]}</span>
                    </div>
                </div>
            </div>
        </div>
        '''

    # Slide de resultados
    slides_html += '''
    <div class="slide">
        <div class="results-container">
            <div class="results-card">
                <div class="results-icon">🎉</div>
                <h2>¡Evaluación Completada!</h2>
                <div class="score-circle">
                    <span id="final-score">0</span>%
                </div>
                <p class="results-text">Has demostrado conocimiento sobre FATCA y CRS.</p>
                <button class="restart-btn" onclick="restartQuiz()">Reintentar</button>
            </div>
        </div>
    </div>
    '''

    styles = '''
        .quiz-container {
            max-width: 750px;
            margin: 0 auto;
        }

        .question-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 25px;
        }

        .question-num {
            color: var(--davi-red);
            font-weight: 600;
            font-family: 'Montserrat', sans-serif;
        }

        .progress-dots {
            display: flex;
            gap: 8px;
        }

        .dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #ddd;
        }

        .dot.active {
            background: var(--davi-orange);
        }

        .question-card {
            background: white;
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
        }

        .question-card h2 {
            font-family: 'Montserrat', sans-serif;
            color: var(--text-dark);
            font-size: 1.4em;
            margin-bottom: 30px;
            line-height: 1.4;
        }

        .options-grid {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .quiz-option {
            display: flex;
            align-items: center;
            gap: 15px;
            padding: 18px 22px;
            background: var(--bg-light);
            border: 2px solid transparent;
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .quiz-option:hover {
            border-color: var(--davi-red);
            background: #fff5f5;
        }

        .option-letter {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            border: 2px solid var(--text-light);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 600;
            color: var(--text-gray);
            flex-shrink: 0;
        }

        .quiz-option.correct {
            border-color: var(--davi-cyan);
            background: #e6fff9;
        }

        .quiz-option.correct .option-letter {
            border-color: var(--davi-cyan);
            background: var(--davi-cyan);
            color: white;
        }

        .quiz-option.incorrect {
            border-color: #ff6b6b;
            background: #ffe6e6;
        }

        .quiz-option.incorrect .option-letter {
            border-color: #ff6b6b;
            background: #ff6b6b;
            color: white;
        }

        .option-icon {
            margin-left: auto;
            font-size: 1.2em;
        }

        .quiz-option.correct .option-icon::after { content: "✓"; color: var(--davi-cyan); }
        .quiz-option.incorrect .option-icon::after { content: "✗"; color: #ff6b6b; }

        .feedback-box {
            display: none;
            margin-top: 25px;
            padding: 18px 22px;
            background: #e6fff9;
            border-radius: 12px;
            align-items: center;
            gap: 12px;
        }

        .feedback-box.visible {
            display: flex;
        }

        .feedback-icon {
            width: 30px;
            height: 30px;
            background: var(--davi-cyan);
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .feedback-text {
            color: #0d7d6c;
        }

        /* Results */
        .results-container {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 400px;
        }

        .results-card {
            background: white;
            padding: 50px 70px;
            border-radius: 20px;
            text-align: center;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
        }

        .results-icon {
            font-size: 4em;
            margin-bottom: 15px;
        }

        .results-card h2 {
            font-family: 'Montserrat', sans-serif;
            color: var(--text-dark);
            margin-bottom: 25px;
        }

        .score-circle {
            width: 120px;
            height: 120px;
            border-radius: 50%;
            background: linear-gradient(135deg, var(--davi-red) 0%, var(--davi-red-dark) 100%);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 2em;
            font-weight: 700;
            margin: 0 auto 25px;
            font-family: 'Montserrat', sans-serif;
        }

        .results-text {
            color: var(--text-gray);
            margin-bottom: 25px;
        }

        .restart-btn {
            background: var(--davi-red);
            color: white;
            border: none;
            padding: 14px 40px;
            border-radius: 8px;
            font-size: 1em;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s;
        }

        .restart-btn:hover {
            background: var(--davi-red-dark);
        }
    '''

    scripts = '''
        let score = 0;
        const totalQuestions = 3;

        function selectOption(element, questionNum) {
            const options = element.parentElement.querySelectorAll('.quiz-option');
            if (Array.from(options).some(o => o.classList.contains('correct') || o.classList.contains('incorrect'))) {
                return; // Already answered
            }

            const isCorrect = element.dataset.correct === "1";

            options.forEach(opt => {
                if (opt.dataset.correct === "1") {
                    opt.classList.add('correct');
                } else if (opt === element) {
                    opt.classList.add('incorrect');
                }
            });

            if (isCorrect) {
                score++;
            }

            document.getElementById('feedback-' + questionNum).classList.add('visible');

            // Auto advance after 2 seconds
            setTimeout(() => {
                if (currentSlide < totalSlides - 1) {
                    nextSlide();
                }
                updateScore();
            }, 2000);
        }

        function updateScore() {
            document.getElementById('final-score').textContent = Math.round((score / totalQuestions) * 100);
        }

        function restartQuiz() {
            score = 0;
            document.querySelectorAll('.quiz-option').forEach(opt => {
                opt.classList.remove('correct', 'incorrect');
            });
            document.querySelectorAll('.feedback-box').forEach(fb => {
                fb.classList.remove('visible');
            });
            showSlide(0);
        }
    '''

    return crear_html("Evaluación Final",
                      "Demuestra tu conocimiento sobre FATCA y CRS.",
                      slides_html, styles, len(preguntas) + 1, scripts)


def crear_html(titulo, subtitulo, contenido, styles, total_slides, scripts=""):
    """Crea HTML completo basado en el template"""

    template = '''<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>''' + titulo + ''' - ''' + CURSO_NOMBRE + '''</title>
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,400;0,600;0,700;1,600;1,700&family=Open+Sans:wght@400;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --davi-red: #DA291C;
            --davi-red-dark: #B8231A;
            --davi-orange: #F5A623;
            --davi-yellow: #FFD100;
            --davi-blue: #4A90D9;
            --davi-cyan: #00B5AD;
            --bg-light: #F5F3F0;
            --bg-card: #FFFFFF;
            --text-dark: #333333;
            --text-gray: #666666;
            --text-light: #999999;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: 'Open Sans', sans-serif;
            background: var(--bg-light);
            min-height: 100vh;
            position: relative;
        }

        body::before {
            content: '';
            position: fixed;
            top: 0; right: 0;
            width: 60%; height: 100%;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 600'%3E%3Cpath d='M600,0 Q700,100 800,50' fill='none' stroke='rgba(218,41,28,0.06)' stroke-width='2'/%3E%3Cpath d='M500,50 Q650,150 800,100' fill='none' stroke='rgba(218,41,28,0.05)' stroke-width='2'/%3E%3Cpath d='M400,100 Q600,200 800,150' fill='none' stroke='rgba(218,41,28,0.04)' stroke-width='2'/%3E%3C/svg%3E");
            background-size: cover;
            pointer-events: none;
            z-index: 0;
        }

        .container {
            position: relative;
            z-index: 1;
            max-width: 1200px;
            margin: 0 auto;
            padding: 30px 50px 100px;
        }

        .header {
            display: flex;
            align-items: center;
            gap: 20px;
            margin-bottom: 40px;
        }

        .back-btn {
            width: 50px;
            height: 50px;
            border: 2px solid var(--text-dark);
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: white;
            cursor: pointer;
            font-size: 24px;
        }

        .course-box {
            padding: 12px 24px;
            border: 2px solid var(--text-dark);
            border-radius: 8px;
            background: white;
            font-weight: 600;
            font-size: 0.9em;
        }

        .main-title {
            font-family: 'Montserrat', sans-serif;
            font-weight: 700;
            font-style: italic;
            color: var(--davi-red);
            font-size: 2.5em;
            text-align: center;
            margin-bottom: 15px;
        }

        .subtitle {
            text-align: center;
            color: var(--text-gray);
            font-size: 1.1em;
            max-width: 700px;
            margin: 0 auto 40px;
            line-height: 1.6;
        }

        .bottom-nav {
            position: fixed;
            bottom: 25px;
            right: 40px;
            display: flex;
            gap: 15px;
            z-index: 100;
        }

        .nav-controls {
            display: flex;
            align-items: center;
            gap: 10px;
            background: var(--text-dark);
            padding: 12px 18px;
            border-radius: 10px;
        }

        .nav-controls button {
            background: none;
            border: none;
            color: white;
            cursor: pointer;
            padding: 5px;
            font-size: 18px;
        }

        .page-nav {
            display: flex;
            align-items: center;
            gap: 12px;
            background: white;
            padding: 12px 20px;
            border-radius: 10px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            font-weight: 600;
        }

        .page-nav .arrow {
            color: var(--davi-red);
            font-size: 1.3em;
            cursor: pointer;
        }

        .slide {
            display: none;
            animation: fadeIn 0.4s ease;
        }

        .slide.active {
            display: block;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(15px); }
            to { opacity: 1; transform: translateY(0); }
        }

        ''' + styles + '''
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="back-btn" onclick="history.back()">‹</div>
            <div class="course-box">''' + CURSO_NOMBRE + '''</div>
        </div>

        <h1 class="main-title">''' + titulo + '''</h1>
        <p class="subtitle">''' + subtitulo + '''</p>

        <div class="slides-container">
            ''' + contenido + '''
        </div>
    </div>

    <div class="bottom-nav">
        <div class="nav-controls">
            <button>🔊</button>
            <button onclick="toggleFullscreen()">⛶</button>
        </div>
        <div class="page-nav">
            <span class="arrow" onclick="prevSlide()">‹</span>
            <span id="page-indicator">1 / ''' + str(total_slides) + '''</span>
            <span class="arrow" onclick="nextSlide()">›</span>
        </div>
    </div>

    <script>
        let currentSlide = 0;
        const slides = document.querySelectorAll('.slide');
        const totalSlides = slides.length;

        function showSlide(n) {
            slides.forEach(s => s.classList.remove('active'));
            currentSlide = (n + totalSlides) % totalSlides;
            slides[currentSlide].classList.add('active');
            document.getElementById('page-indicator').textContent = (currentSlide + 1) + ' / ' + totalSlides;
        }

        function nextSlide() { showSlide(currentSlide + 1); }
        function prevSlide() { showSlide(currentSlide - 1); }

        function toggleFullscreen() {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen();
            } else {
                document.exitFullscreen();
            }
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight') nextSlide();
            if (e.key === 'ArrowLeft') prevSlide();
        });

        showSlide(0);

        ''' + scripts + '''
    </script>
</body>
</html>'''

    return template


def main():
    """Genera el SCORM completo"""

    # Crear directorio
    if OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)
    OUTPUT_DIR.mkdir(parents=True)

    print("🎨 Generando contenido de alta calidad...")

    # Generar recursos
    recursos = [
        ("01_documentacion", "Documentación Requerida", generar_interactivo_documentacion()),
        ("02_comparador", "Comparador FATCA vs CRS", generar_comparador()),
        ("03_quiz", "Evaluación Final", generar_quiz()),
    ]

    for folder, titulo, html in recursos:
        path = OUTPUT_DIR / folder
        path.mkdir()
        with open(path / "index.html", 'w', encoding='utf-8') as f:
            f.write(html)
        print(f"  ✓ {titulo}")

    # Copiar videos existentes si hay
    videos_dir = Path("/Users/federico/Desktop/ia-davivienda/output/fatca_&_crs:_cumplimiento_normativo")
    for video_folder in ["01_video", "02_video"]:
        src = videos_dir / video_folder
        if src.exists() and (src / "video.mp4").exists():
            dst = OUTPUT_DIR / video_folder
            shutil.copytree(src, dst)
            print(f"  ✓ Video: {video_folder}")

    # Generar index principal
    index_html = generar_index_principal()
    with open(OUTPUT_DIR / "index.html", 'w', encoding='utf-8') as f:
        f.write(index_html)
    print("  ✓ Index principal")

    # Generar manifest SCORM
    manifest = generar_manifest()
    with open(OUTPUT_DIR / "imsmanifest.xml", 'w', encoding='utf-8') as f:
        f.write(manifest)
    print("  ✓ imsmanifest.xml")

    # Crear ZIP
    print("\n📦 Creando SCORM...")
    with zipfile.ZipFile(SCORM_ZIP, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(OUTPUT_DIR):
            for file in files:
                file_path = Path(root) / file
                arcname = file_path.relative_to(OUTPUT_DIR)
                zipf.write(file_path, arcname)

    size = SCORM_ZIP.stat().st_size / 1024 / 1024
    print(f"\n✅ SCORM generado: {SCORM_ZIP}")
    print(f"📊 Tamaño: {size:.2f} MB")


def generar_index_principal():
    """Genera el index.html principal del SCORM"""

    return f'''<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{CURSO_NOMBRE}</title>
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&family=Open+Sans:wght@400;600&display=swap" rel="stylesheet">
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: 'Open Sans', sans-serif; display: flex; height: 100vh; background: #1a1a2e; }}

        .sidebar {{
            width: 320px;
            background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
            color: white;
            padding: 30px 25px;
            overflow-y: auto;
            flex-shrink: 0;
        }}

        .logo {{
            font-size: 2.5em;
            text-align: center;
            margin-bottom: 10px;
        }}

        .sidebar h2 {{
            color: #DA291C;
            font-family: 'Montserrat', sans-serif;
            font-size: 1.1em;
            text-align: center;
            margin-bottom: 5px;
        }}

        .sidebar p {{
            color: #888;
            font-size: 0.85em;
            text-align: center;
            margin-bottom: 30px;
        }}

        .nav-item {{
            display: flex;
            align-items: center;
            gap: 15px;
            padding: 16px 20px;
            margin: 8px 0;
            background: rgba(255,255,255,0.05);
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.3s;
            border-left: 3px solid transparent;
        }}

        .nav-item:hover {{
            background: rgba(218, 41, 28, 0.2);
            border-left-color: #DA291C;
        }}

        .nav-item.active {{
            background: #DA291C;
            border-left-color: white;
        }}

        .nav-item.completed {{
            opacity: 0.7;
        }}

        .nav-icon {{
            font-size: 1.3em;
        }}

        .nav-title {{
            flex: 1;
            font-weight: 500;
        }}

        .nav-check {{
            color: #4CAF50;
            font-size: 1.2em;
            display: none;
        }}

        .nav-item.completed .nav-check {{
            display: block;
        }}

        .content {{
            flex: 1;
            display: flex;
            flex-direction: column;
            background: #f5f3f0;
        }}

        .header {{
            background: white;
            padding: 18px 30px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-shadow: 0 2px 10px rgba(0,0,0,0.05);
        }}

        .header h1 {{
            font-family: 'Montserrat', sans-serif;
            font-size: 1.2em;
            color: #333;
        }}

        .progress-container {{
            display: flex;
            align-items: center;
            gap: 15px;
        }}

        .progress-text {{
            font-weight: 600;
            color: #666;
        }}

        .progress-bar {{
            width: 200px;
            height: 10px;
            background: #e0e0e0;
            border-radius: 5px;
            overflow: hidden;
        }}

        .progress-fill {{
            height: 100%;
            background: linear-gradient(90deg, #DA291C, #F5A623);
            width: 0%;
            transition: width 0.5s ease;
        }}

        .main {{
            flex: 1;
            position: relative;
        }}

        iframe {{
            width: 100%;
            height: 100%;
            border: none;
        }}

        .welcome {{
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            text-align: center;
            padding: 50px;
        }}

        .welcome-content h2 {{
            font-family: 'Montserrat', sans-serif;
            color: #DA291C;
            font-size: 2em;
            margin-bottom: 15px;
        }}

        .welcome-content p {{
            color: #666;
            font-size: 1.1em;
            max-width: 500px;
            line-height: 1.6;
        }}
    </style>
</head>
<body>
    <div class="sidebar">
        <div class="logo">🎓</div>
        <h2>{CURSO_NOMBRE}</h2>
        <p>Davivienda - Facultad Digital</p>

        <div class="nav-item" data-src="01_video/video.mp4" data-type="video" onclick="loadContent(this)">
            <span class="nav-icon">🎬</span>
            <span class="nav-title">Introducción</span>
            <span class="nav-check">✓</span>
        </div>

        <div class="nav-item" data-src="02_video/video.mp4" data-type="video" onclick="loadContent(this)">
            <span class="nav-icon">🎬</span>
            <span class="nav-title">Clientes Regulados</span>
            <span class="nav-check">✓</span>
        </div>

        <div class="nav-item" data-src="01_documentacion/index.html" data-type="html" onclick="loadContent(this)">
            <span class="nav-icon">📄</span>
            <span class="nav-title">Documentación</span>
            <span class="nav-check">✓</span>
        </div>

        <div class="nav-item" data-src="02_comparador/index.html" data-type="html" onclick="loadContent(this)">
            <span class="nav-icon">⚖️</span>
            <span class="nav-title">Comparador</span>
            <span class="nav-check">✓</span>
        </div>

        <div class="nav-item" data-src="03_quiz/index.html" data-type="html" onclick="loadContent(this)">
            <span class="nav-icon">📝</span>
            <span class="nav-title">Evaluación</span>
            <span class="nav-check">✓</span>
        </div>
    </div>

    <div class="content">
        <div class="header">
            <h1 id="current-title">Bienvenido al curso</h1>
            <div class="progress-container">
                <span class="progress-text" id="progress-text">0/5 completados</span>
                <div class="progress-bar">
                    <div class="progress-fill" id="progress-fill"></div>
                </div>
            </div>
        </div>

        <div class="main" id="main-content">
            <div class="welcome">
                <div class="welcome-content">
                    <h2>¡Bienvenido!</h2>
                    <p>Selecciona un módulo del menú lateral para comenzar tu aprendizaje sobre FATCA y CRS.</p>
                </div>
            </div>
        </div>
    </div>

    <script>
        const total = 5;
        let completed = new Set();

        function loadContent(element) {{
            const src = element.dataset.src;
            const type = element.dataset.type;
            const title = element.querySelector('.nav-title').textContent;

            // Update active state
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            element.classList.add('active');

            // Update header
            document.getElementById('current-title').textContent = title;

            // Load content
            const main = document.getElementById('main-content');
            if (type === 'video') {{
                main.innerHTML = '<video controls autoplay style="width:100%;height:100%;background:#000"><source src="' + src + '" type="video/mp4"></video>';
                main.querySelector('video').onended = () => markComplete(element);
            }} else {{
                main.innerHTML = '<iframe src="' + src + '"></iframe>';
                setTimeout(() => markComplete(element), 5000);
            }}

            // SCORM
            if (typeof API !== 'undefined') {{
                API.LMSSetValue('cmi.core.lesson_location', src);
                API.LMSCommit('');
            }}
        }}

        function markComplete(element) {{
            const src = element.dataset.src;
            if (!completed.has(src)) {{
                completed.add(src);
                element.classList.add('completed');
                updateProgress();
            }}
        }}

        function updateProgress() {{
            const pct = (completed.size / total) * 100;
            document.getElementById('progress-fill').style.width = pct + '%';
            document.getElementById('progress-text').textContent = completed.size + '/' + total + ' completados';

            if (typeof API !== 'undefined') {{
                API.LMSSetValue('cmi.core.score.raw', Math.round(pct));
                if (completed.size >= total) {{
                    API.LMSSetValue('cmi.core.lesson_status', 'completed');
                }}
                API.LMSCommit('');
            }}
        }}

        // Initialize SCORM
        if (typeof API !== 'undefined') {{
            API.LMSInitialize('');
            API.LMSSetValue('cmi.core.lesson_status', 'incomplete');
        }}

        window.onunload = function() {{
            if (typeof API !== 'undefined') {{
                API.LMSFinish('');
            }}
        }};
    </script>
</body>
</html>'''


def generar_manifest():
    """Genera imsmanifest.xml"""
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="fatca_crs_hq" version="1.0"
    xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
    xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <metadata>
        <schema>ADL SCORM</schema>
        <schemaversion>1.2</schemaversion>
    </metadata>
    <organizations default="org1">
        <organization identifier="org1">
            <title>{CURSO_NOMBRE}</title>
            <item identifier="item1" identifierref="resource1">
                <title>{CURSO_NOMBRE}</title>
            </item>
        </organization>
    </organizations>
    <resources>
        <resource identifier="resource1" type="webcontent" adlcp:scormtype="sco" href="index.html">
            <file href="index.html"/>
        </resource>
    </resources>
</manifest>'''


if __name__ == "__main__":
    main()
