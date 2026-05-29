#!/usr/bin/env python3
"""
Generador de SCORM v2 - Alta Calidad
Con logo Davivienda, botones funcionales, y mejor UX
"""

import os
import shutil
import zipfile
from pathlib import Path

CURSO_NOMBRE = "FATCA & CRS: Cumplimiento Normativo"
OUTPUT_DIR = Path("/Users/federico/Desktop/ia-davivienda/output/scorm_fatca_v2")
SCORM_ZIP = Path("/Users/federico/Desktop/ia-davivienda/output/scorm_fatca_v2.zip")

# Logo Davivienda - PNG embebido en base64 (logo oficial con casita)
LOGO_BASE64 = "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"

LOGO_DAVIVIENDA = f'<img src="data:image/png;base64,{LOGO_BASE64}" alt="Davivienda" style="height: 45px;">'
LOGO_DAVIVIENDA_INDEX = f'<img src="data:image/png;base64,{LOGO_BASE64}" alt="Davivienda" style="height: 45px;">'

ICONS = {
    "documento": '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/></svg>',
    "mundo": '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.9,17.39C17.64,16.59 16.89,16 16,16H15V13A1,1 0 0,0 14,12H8V10H10A1,1 0 0,0 11,9V7H13A2,2 0 0,0 15,5V4.59C17.93,5.77 20,8.64 20,12C20,14.08 19.2,15.97 17.9,17.39M11,19.93C7.05,19.44 4,16.08 4,12C4,11.38 4.08,10.78 4.21,10.21L9,15V16A2,2 0 0,0 11,18M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z"/></svg>',
    "banco": '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.5,1L2,6V8H21V6M16,10V17H19V10M2,22H21V19H2M10,10V17H13V10M4,10V17H7V10H4Z"/></svg>',
}


def generar_documentacion():
    """Genera módulo de Documentación con botones clickeables"""

    items = [
        {"num": 1, "color": "#DA291C", "titulo": "Formulario W-9",
         "desc": "Para ciudadanos o residentes estadounidenses",
         "contenido": "El W-9 es el formulario oficial del IRS para personas estadounidenses. Incluye nombre completo, dirección, TIN (Tax Identification Number) y certificación de estatus fiscal. El cliente debe firmarlo declarando que la información es correcta."},
        {"num": 2, "color": "#F5A623", "titulo": "Formulario W-8BEN",
         "desc": "Para personas naturales extranjeras",
         "contenido": "Utilizado por personas naturales que NO son ciudadanos ni residentes de EE.UU. Certifica su estatus de extranjero y permite aplicar beneficios de tratados fiscales para reducir retenciones."},
        {"num": 3, "color": "#4A90D9", "titulo": "Formulario W-8BEN-E",
         "desc": "Para entidades extranjeras (empresas)",
         "contenido": "Similar al W-8BEN pero para entidades (empresas, fundaciones, etc.). Documenta el estatus FATCA de la entidad, sus beneficiarios controlantes y permite reclamar beneficios de tratados."},
        {"num": 4, "color": "#00B5AD", "titulo": "Autocertificación CRS",
         "desc": "Declaración de residencia fiscal global",
         "contenido": "Formulario estándar del CRS donde el cliente declara su(s) país(es) de residencia fiscal y proporciona los números de identificación tributaria correspondientes."},
    ]

    html = f'''<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Documentación Requerida</title>
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,400;0,600;0,700;1,700&family=Open+Sans:wght@400;600&display=swap" rel="stylesheet">
    <style>
        :root {{
            --davi-red: #DA291C;
            --davi-orange: #F5A623;
            --davi-blue: #4A90D9;
            --davi-cyan: #00B5AD;
            --bg-light: #F5F3F0;
            --text-dark: #333;
            --text-gray: #666;
        }}
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: 'Open Sans', sans-serif;
            background: var(--bg-light);
            min-height: 100vh;
        }}

        /* Ondas de fondo */
        body::before {{
            content: '';
            position: fixed;
            top: 0; right: 0;
            width: 50%; height: 100%;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 600'%3E%3Cpath d='M500,0 Q650,80 800,40' fill='none' stroke='rgba(218,41,28,0.08)' stroke-width='2'/%3E%3Cpath d='M400,60 Q600,140 800,100' fill='none' stroke='rgba(218,41,28,0.06)' stroke-width='2'/%3E%3Cpath d='M300,120 Q550,200 800,160' fill='none' stroke='rgba(218,41,28,0.04)' stroke-width='2'/%3E%3C/svg%3E");
            background-size: cover;
            pointer-events: none;
            z-index: 0;
        }}

        .container {{
            position: relative;
            z-index: 1;
            max-width: 1100px;
            margin: 0 auto;
            padding: 25px 40px 80px;
        }}

        .header {{
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 30px;
        }}

        .header-left {{
            display: flex;
            align-items: center;
            gap: 20px;
        }}

        .back-btn {{
            width: 45px;
            height: 45px;
            border: 2px solid var(--text-dark);
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: white;
            cursor: pointer;
            font-size: 22px;
        }}

        .course-box {{
            padding: 10px 20px;
            border: 2px solid var(--text-dark);
            border-radius: 8px;
            background: white;
            font-weight: 600;
            font-size: 0.85em;
        }}

        .logo {{
            height: 35px;
        }}

        .logo svg {{
            height: 100%;
            width: auto;
        }}

        .main-title {{
            font-family: 'Montserrat', sans-serif;
            font-weight: 700;
            font-style: italic;
            color: var(--davi-red);
            font-size: 2.2em;
            text-align: center;
            margin-bottom: 10px;
        }}

        .subtitle {{
            text-align: center;
            color: var(--text-gray);
            font-size: 1em;
            margin-bottom: 35px;
        }}

        .content-grid {{
            display: grid;
            grid-template-columns: 90px 1fr;
            gap: 30px;
        }}

        .numbers-column {{
            display: flex;
            flex-direction: column;
            gap: 15px;
            padding-top: 10px;
        }}

        .num-btn {{
            width: 60px;
            height: 60px;
            border-radius: 50%;
            border: none;
            color: white;
            font-family: 'Montserrat', sans-serif;
            font-weight: 700;
            font-size: 1.5em;
            cursor: pointer;
            transition: all 0.3s ease;
            opacity: 0.5;
            transform: scale(0.85);
        }}

        .num-btn:hover {{
            opacity: 0.8;
            transform: scale(0.95);
        }}

        .num-btn.active {{
            opacity: 1;
            transform: scale(1);
            box-shadow: 0 0 0 4px rgba(218,41,28,0.25);
        }}

        .content-area {{
            background: white;
            border-radius: 20px;
            overflow: hidden;
            box-shadow: 0 8px 30px rgba(0,0,0,0.1);
        }}

        .card-header {{
            padding: 25px 30px;
            border-left: 5px solid var(--davi-red);
            background: linear-gradient(90deg, #fff8f7 0%, white 100%);
            display: flex;
            align-items: center;
            gap: 20px;
        }}

        .icon-box {{
            width: 55px;
            height: 55px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            flex-shrink: 0;
        }}

        .icon-box svg {{
            width: 28px;
            height: 28px;
        }}

        .card-header h3 {{
            font-family: 'Montserrat', sans-serif;
            color: var(--davi-red);
            font-size: 1.4em;
            margin-bottom: 4px;
        }}

        .card-header p {{
            color: var(--text-gray);
            font-size: 0.9em;
        }}

        .card-body {{
            padding: 25px 30px;
        }}

        .card-body .text {{
            color: var(--text-gray);
            line-height: 1.8;
            font-size: 1.05em;
            margin-bottom: 20px;
        }}

        .tip-box {{
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 15px 20px;
            background: #FFF8E6;
            border-radius: 10px;
            font-size: 0.92em;
            color: #8B6914;
        }}

        .tip-icon {{
            font-size: 1.3em;
        }}

        /* Nav inferior */
        .bottom-nav {{
            position: fixed;
            bottom: 20px;
            right: 30px;
            display: flex;
            gap: 12px;
            z-index: 100;
        }}

        .page-nav {{
            display: flex;
            align-items: center;
            gap: 15px;
            background: white;
            padding: 12px 22px;
            border-radius: 10px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.12);
            font-weight: 600;
        }}

        .arrow {{
            color: var(--davi-red);
            font-size: 1.4em;
            cursor: pointer;
            user-select: none;
            transition: transform 0.2s;
        }}

        .arrow:hover {{
            transform: scale(1.2);
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="header-left">
                <div class="back-btn" onclick="history.back()">‹</div>
                <div class="course-box">{CURSO_NOMBRE}</div>
            </div>
            <div class="logo">{LOGO_DAVIVIENDA}</div>
        </div>

        <h1 class="main-title">Documentación Requerida</h1>
        <p class="subtitle">Haz clic en cada número para conocer los formularios que tus clientes deben completar.</p>

        <div class="content-grid">
            <div class="numbers-column">
                {"".join([f'<button class="num-btn {"active" if i["num"]==1 else ""}" style="background: {i["color"]}" onclick="showItem({i["num"]})">{i["num"]}</button>' for i in items])}
            </div>

            <div class="content-area">
                {"".join([f'''
                <div class="content-item" id="item-{i["num"]}" style="display: {"block" if i["num"]==1 else "none"}">
                    <div class="card-header" style="border-left-color: {i["color"]}">
                        <div class="icon-box" style="background: {i["color"]}">{ICONS["documento"]}</div>
                        <div>
                            <h3>{i["titulo"]}</h3>
                            <p>{i["desc"]}</p>
                        </div>
                    </div>
                    <div class="card-body">
                        <p class="text">{i["contenido"]}</p>
                        <div class="tip-box">
                            <span class="tip-icon">💡</span>
                            <span>Tip: Verifica que el formulario esté completo y firmado antes de procesarlo.</span>
                        </div>
                    </div>
                </div>
                ''' for i in items])}
            </div>
        </div>
    </div>

    <div class="bottom-nav">
        <div class="page-nav">
            <span class="arrow" onclick="prevItem()">‹</span>
            <span id="page-num">1 / 4</span>
            <span class="arrow" onclick="nextItem()">›</span>
        </div>
    </div>

    <script>
        let currentItem = 1;
        const totalItems = 4;

        function showItem(num) {{
            // Ocultar todos
            document.querySelectorAll('.content-item').forEach(el => el.style.display = 'none');
            document.querySelectorAll('.num-btn').forEach(btn => btn.classList.remove('active'));

            // Mostrar el seleccionado
            document.getElementById('item-' + num).style.display = 'block';
            document.querySelectorAll('.num-btn')[num-1].classList.add('active');

            currentItem = num;
            document.getElementById('page-num').textContent = num + ' / ' + totalItems;
        }}

        function nextItem() {{
            showItem(currentItem >= totalItems ? 1 : currentItem + 1);
        }}

        function prevItem() {{
            showItem(currentItem <= 1 ? totalItems : currentItem - 1);
        }}

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {{
            if (e.key === 'ArrowRight') nextItem();
            if (e.key === 'ArrowLeft') prevItem();
        }});
    </script>
</body>
</html>'''

    return html


def generar_comparador():
    """Genera comparador FATCA vs CRS"""

    html = f'''<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Comparador FATCA vs CRS</title>
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,400;0,600;0,700;1,700&family=Open+Sans:wght@400;600&display=swap" rel="stylesheet">
    <style>
        :root {{
            --davi-red: #DA291C;
            --davi-blue: #4A90D9;
            --bg-light: #F5F3F0;
            --text-dark: #333;
            --text-gray: #666;
        }}
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: 'Open Sans', sans-serif;
            background: var(--bg-light);
            min-height: 100vh;
        }}

        body::before {{
            content: '';
            position: fixed;
            top: 0; right: 0;
            width: 50%; height: 100%;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 600'%3E%3Cpath d='M500,0 Q650,80 800,40' fill='none' stroke='rgba(218,41,28,0.08)' stroke-width='2'/%3E%3Cpath d='M400,60 Q600,140 800,100' fill='none' stroke='rgba(218,41,28,0.06)' stroke-width='2'/%3E%3C/svg%3E");
            background-size: cover;
            pointer-events: none;
        }}

        .container {{
            position: relative;
            z-index: 1;
            max-width: 1000px;
            margin: 0 auto;
            padding: 25px 40px 80px;
        }}

        .header {{
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 30px;
        }}

        .header-left {{
            display: flex;
            align-items: center;
            gap: 20px;
        }}

        .back-btn {{
            width: 45px;
            height: 45px;
            border: 2px solid var(--text-dark);
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: white;
            cursor: pointer;
            font-size: 22px;
        }}

        .course-box {{
            padding: 10px 20px;
            border: 2px solid var(--text-dark);
            border-radius: 8px;
            background: white;
            font-weight: 600;
            font-size: 0.85em;
        }}

        .logo {{
            height: 35px;
        }}

        .logo svg {{
            height: 100%;
            width: auto;
        }}

        .main-title {{
            font-family: 'Montserrat', sans-serif;
            font-weight: 700;
            font-style: italic;
            color: var(--davi-red);
            font-size: 2.2em;
            text-align: center;
            margin-bottom: 10px;
        }}

        .subtitle {{
            text-align: center;
            color: var(--text-gray);
            margin-bottom: 35px;
        }}

        .cards-row {{
            display: grid;
            grid-template-columns: 1fr auto 1fr;
            gap: 25px;
            align-items: stretch;
        }}

        .compare-card {{
            background: white;
            border-radius: 20px;
            padding: 30px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.1);
        }}

        .compare-card.fatca {{
            border-top: 5px solid var(--davi-red);
        }}

        .compare-card.crs {{
            border-top: 5px solid var(--davi-blue);
        }}

        .card-icon {{
            width: 60px;
            height: 60px;
            border-radius: 50%;
            margin: 0 auto 15px;
            display: flex;
            align-items: center;
            justify-content: center;
        }}

        .compare-card.fatca .card-icon {{
            background: #FFF0EF;
            color: var(--davi-red);
        }}

        .compare-card.crs .card-icon {{
            background: #EEF6FF;
            color: var(--davi-blue);
        }}

        .card-icon svg {{
            width: 30px;
            height: 30px;
        }}

        .compare-card h3 {{
            font-family: 'Montserrat', sans-serif;
            font-size: 1.6em;
            text-align: center;
            margin-bottom: 5px;
        }}

        .compare-card.fatca h3 {{ color: var(--davi-red); }}
        .compare-card.crs h3 {{ color: var(--davi-blue); }}

        .tagline {{
            text-align: center;
            color: var(--text-gray);
            font-size: 0.85em;
            margin-bottom: 25px;
        }}

        .compare-card ul {{
            list-style: none;
        }}

        .compare-card li {{
            padding: 14px 0;
            border-bottom: 1px solid #eee;
            color: var(--text-gray);
            display: flex;
            align-items: center;
            gap: 10px;
        }}

        .compare-card li::before {{
            content: '•';
            font-weight: bold;
        }}

        .compare-card.fatca li::before {{ color: var(--davi-red); }}
        .compare-card.crs li::before {{ color: var(--davi-blue); }}

        .vs-circle {{
            width: 60px;
            height: 60px;
            background: linear-gradient(135deg, #F5A623, #e09000);
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Montserrat', sans-serif;
            font-weight: 700;
            font-size: 1.1em;
            align-self: center;
            box-shadow: 0 4px 15px rgba(245,166,35,0.4);
        }}

        .bottom-nav {{
            position: fixed;
            bottom: 20px;
            right: 30px;
            z-index: 100;
        }}

        .page-nav {{
            display: flex;
            align-items: center;
            gap: 15px;
            background: white;
            padding: 12px 22px;
            border-radius: 10px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.12);
            font-weight: 600;
        }}

        .arrow {{
            color: var(--davi-red);
            font-size: 1.4em;
            cursor: pointer;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="header-left">
                <div class="back-btn" onclick="history.back()">‹</div>
                <div class="course-box">{CURSO_NOMBRE}</div>
            </div>
            <div class="logo">{LOGO_DAVIVIENDA}</div>
        </div>

        <h1 class="main-title">FATCA vs CRS</h1>
        <p class="subtitle">Comprende las diferencias clave entre ambas regulaciones</p>

        <div class="cards-row">
            <div class="compare-card fatca">
                <div class="card-icon">{ICONS["banco"]}</div>
                <h3>FATCA</h3>
                <p class="tagline">Foreign Account Tax Compliance Act</p>
                <ul>
                    <li>Ley de Estados Unidos (2010)</li>
                    <li>Aplica a US persons</li>
                    <li>Umbral: USD $50,000</li>
                    <li>Retención del 30% como sanción</li>
                    <li>Formularios: W-9, W-8BEN</li>
                    <li>Reporta al IRS</li>
                </ul>
            </div>

            <div class="vs-circle">VS</div>

            <div class="compare-card crs">
                <div class="card-icon">{ICONS["mundo"]}</div>
                <h3>CRS</h3>
                <p class="tagline">Common Reporting Standard</p>
                <ul>
                    <li>Estándar OCDE (2014)</li>
                    <li>136+ jurisdicciones</li>
                    <li>Sin umbral mínimo</li>
                    <li>Sanciones locales</li>
                    <li>Autocertificación CRS</li>
                    <li>Intercambio automático</li>
                </ul>
            </div>
        </div>
    </div>

    <div class="bottom-nav">
        <div class="page-nav">
            <span class="arrow" onclick="history.back()">‹</span>
            <span>1 / 1</span>
            <span class="arrow">›</span>
        </div>
    </div>
</body>
</html>'''

    return html


def generar_quiz():
    """Genera quiz interactivo"""

    preguntas = [
        {
            "pregunta": "¿Qué formulario debe completar un ciudadano estadounidense?",
            "opciones": ["W-8BEN", "W-9", "Autocertificación CRS", "W-8BEN-E"],
            "correcta": 1
        },
        {
            "pregunta": "¿Cuántos países participan aproximadamente en el CRS?",
            "opciones": ["50 países", "100 países", "136+ países", "200+ países"],
            "correcta": 2
        },
        {
            "pregunta": "¿Cuál es el umbral mínimo de reporte para FATCA?",
            "opciones": ["USD $10,000", "USD $50,000", "USD $100,000", "Sin umbral"],
            "correcta": 1
        },
    ]

    preguntas_html = ""
    for i, q in enumerate(preguntas):
        opciones_html = ""
        for j, op in enumerate(q["opciones"]):
            opciones_html += f'''
            <div class="option" data-idx="{j}" data-correct="{1 if j == q['correcta'] else 0}" onclick="selectOption(this, {i})">
                <span class="opt-letter">{chr(65+j)}</span>
                <span class="opt-text">{op}</span>
            </div>'''

        preguntas_html += f'''
        <div class="question-slide" id="q-{i}" style="display: {'block' if i==0 else 'none'}">
            <div class="q-header">
                <span class="q-num">Pregunta {i+1} de {len(preguntas)}</span>
                <div class="dots">
                    {"".join([f'<span class="dot {"active" if x <= i else ""}"></span>' for x in range(len(preguntas))])}
                </div>
            </div>
            <div class="q-card">
                <h2>{q["pregunta"]}</h2>
                <div class="options">{opciones_html}</div>
                <div class="feedback" id="fb-{i}"></div>
            </div>
        </div>'''

    html = f'''<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Evaluación - {CURSO_NOMBRE}</title>
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,400;0,600;0,700;1,700&family=Open+Sans:wght@400;600&display=swap" rel="stylesheet">
    <style>
        :root {{
            --davi-red: #DA291C;
            --davi-cyan: #00B5AD;
            --bg-light: #F5F3F0;
            --text-dark: #333;
            --text-gray: #666;
        }}
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: 'Open Sans', sans-serif;
            background: var(--bg-light);
            min-height: 100vh;
        }}

        .container {{
            max-width: 800px;
            margin: 0 auto;
            padding: 30px 40px 100px;
        }}

        .header {{
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 30px;
        }}

        .header-left {{
            display: flex;
            align-items: center;
            gap: 20px;
        }}

        .back-btn {{
            width: 45px;
            height: 45px;
            border: 2px solid var(--text-dark);
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: white;
            cursor: pointer;
            font-size: 22px;
        }}

        .course-box {{
            padding: 10px 20px;
            border: 2px solid var(--text-dark);
            border-radius: 8px;
            background: white;
            font-weight: 600;
            font-size: 0.85em;
        }}

        .logo {{
            height: 35px;
        }}

        .logo svg {{
            height: 100%;
            width: auto;
        }}

        .main-title {{
            font-family: 'Montserrat', sans-serif;
            font-weight: 700;
            font-style: italic;
            color: var(--davi-red);
            font-size: 2em;
            text-align: center;
            margin-bottom: 30px;
        }}

        .q-header {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }}

        .q-num {{
            color: var(--davi-red);
            font-weight: 600;
            font-family: 'Montserrat', sans-serif;
        }}

        .dots {{
            display: flex;
            gap: 8px;
        }}

        .dot {{
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #ddd;
        }}

        .dot.active {{
            background: #F5A623;
        }}

        .q-card {{
            background: white;
            border-radius: 20px;
            padding: 35px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.1);
        }}

        .q-card h2 {{
            font-family: 'Montserrat', sans-serif;
            color: var(--text-dark);
            font-size: 1.3em;
            margin-bottom: 25px;
            line-height: 1.4;
        }}

        .options {{
            display: flex;
            flex-direction: column;
            gap: 12px;
        }}

        .option {{
            display: flex;
            align-items: center;
            gap: 15px;
            padding: 16px 20px;
            background: var(--bg-light);
            border: 2px solid transparent;
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.2s;
        }}

        .option:hover {{
            border-color: var(--davi-red);
            background: #fff5f5;
        }}

        .opt-letter {{
            width: 36px;
            height: 36px;
            border-radius: 50%;
            border: 2px solid #ccc;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 600;
            flex-shrink: 0;
        }}

        .option.correct {{
            border-color: var(--davi-cyan);
            background: #e6fff9;
        }}

        .option.correct .opt-letter {{
            border-color: var(--davi-cyan);
            background: var(--davi-cyan);
            color: white;
        }}

        .option.wrong {{
            border-color: #ff6b6b;
            background: #ffe6e6;
        }}

        .option.wrong .opt-letter {{
            border-color: #ff6b6b;
            background: #ff6b6b;
            color: white;
        }}

        .feedback {{
            margin-top: 20px;
            padding: 15px 20px;
            border-radius: 10px;
            display: none;
        }}

        .feedback.show {{
            display: flex;
            align-items: center;
            gap: 10px;
        }}

        .feedback.correct {{
            background: #e6fff9;
            color: #0d7d6c;
        }}

        .feedback.wrong {{
            background: #ffe6e6;
            color: #c44;
        }}

        /* Resultados */
        .results {{
            display: none;
            text-align: center;
            padding: 50px;
        }}

        .results.show {{
            display: block;
        }}

        .results-card {{
            background: white;
            border-radius: 20px;
            padding: 50px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.1);
        }}

        .results-icon {{
            font-size: 4em;
            margin-bottom: 15px;
        }}

        .results h2 {{
            font-family: 'Montserrat', sans-serif;
            color: var(--text-dark);
            margin-bottom: 20px;
        }}

        .score-circle {{
            width: 120px;
            height: 120px;
            border-radius: 50%;
            background: linear-gradient(135deg, var(--davi-red), #b8231a);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 2em;
            font-weight: 700;
            margin: 0 auto 25px;
            font-family: 'Montserrat', sans-serif;
        }}

        .restart-btn {{
            background: var(--davi-red);
            color: white;
            border: none;
            padding: 14px 40px;
            border-radius: 8px;
            font-size: 1em;
            font-weight: 600;
            cursor: pointer;
        }}

        .restart-btn:hover {{
            background: #b8231a;
        }}

        .bottom-nav {{
            position: fixed;
            bottom: 20px;
            right: 30px;
            z-index: 100;
        }}

        .page-nav {{
            display: flex;
            align-items: center;
            gap: 15px;
            background: white;
            padding: 12px 22px;
            border-radius: 10px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.12);
            font-weight: 600;
        }}

        .arrow {{
            color: var(--davi-red);
            font-size: 1.4em;
            cursor: pointer;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="header-left">
                <div class="back-btn" onclick="history.back()">‹</div>
                <div class="course-box">{CURSO_NOMBRE}</div>
            </div>
            <div class="logo">{LOGO_DAVIVIENDA}</div>
        </div>

        <h1 class="main-title">Evaluación Final</h1>

        <div id="quiz-container">
            {preguntas_html}
        </div>

        <div class="results" id="results">
            <div class="results-card">
                <div class="results-icon">🎉</div>
                <h2>¡Evaluación Completada!</h2>
                <div class="score-circle"><span id="final-score">0</span>%</div>
                <p style="color: var(--text-gray); margin-bottom: 25px;">Has demostrado conocimiento sobre FATCA y CRS.</p>
                <button class="restart-btn" onclick="restart()">Reintentar</button>
            </div>
        </div>
    </div>

    <div class="bottom-nav">
        <div class="page-nav">
            <span class="arrow" onclick="prevQ()">‹</span>
            <span id="page-num">1 / {len(preguntas)}</span>
            <span class="arrow" onclick="nextQ()">›</span>
        </div>
    </div>

    <script>
        let current = 0;
        const total = {len(preguntas)};
        let score = 0;
        let answered = new Set();

        function selectOption(el, qIdx) {{
            if (answered.has(qIdx)) return;
            answered.add(qIdx);

            const isCorrect = el.dataset.correct === '1';
            const options = el.parentElement.querySelectorAll('.option');

            options.forEach(opt => {{
                if (opt.dataset.correct === '1') {{
                    opt.classList.add('correct');
                }} else if (opt === el) {{
                    opt.classList.add('wrong');
                }}
            }});

            const fb = document.getElementById('fb-' + qIdx);
            if (isCorrect) {{
                score++;
                fb.textContent = '✓ ¡Correcto!';
                fb.className = 'feedback show correct';
            }} else {{
                fb.textContent = '✗ Incorrecto. La respuesta correcta está marcada en verde.';
                fb.className = 'feedback show wrong';
            }}

            // Auto avanzar
            setTimeout(() => {{
                if (current < total - 1) {{
                    nextQ();
                }} else {{
                    showResults();
                }}
            }}, 1500);
        }}

        function showQ(n) {{
            document.querySelectorAll('.question-slide').forEach(q => q.style.display = 'none');
            document.getElementById('q-' + n).style.display = 'block';
            document.getElementById('page-num').textContent = (n+1) + ' / ' + total;
            current = n;
        }}

        function nextQ() {{
            if (current < total - 1) showQ(current + 1);
            else if (answered.size === total) showResults();
        }}

        function prevQ() {{
            if (current > 0) showQ(current - 1);
        }}

        function showResults() {{
            document.getElementById('quiz-container').style.display = 'none';
            document.getElementById('results').classList.add('show');
            document.getElementById('final-score').textContent = Math.round((score / total) * 100);
        }}

        function restart() {{
            score = 0;
            current = 0;
            answered.clear();
            document.querySelectorAll('.option').forEach(o => {{
                o.classList.remove('correct', 'wrong');
            }});
            document.querySelectorAll('.feedback').forEach(f => f.className = 'feedback');
            document.getElementById('results').classList.remove('show');
            document.getElementById('quiz-container').style.display = 'block';
            showQ(0);
        }}

        document.addEventListener('keydown', (e) => {{
            if (e.key === 'ArrowRight') nextQ();
            if (e.key === 'ArrowLeft') prevQ();
        }});
    </script>
</body>
</html>'''

    return html


def generar_index():
    """Genera index principal del SCORM"""

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
            width: 300px;
            background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
            color: white;
            padding: 25px 20px;
            display: flex;
            flex-direction: column;
            flex-shrink: 0;
        }}

        .logo-area {{
            text-align: center;
            padding: 15px 0 20px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
            margin-bottom: 20px;
        }}

        .logo-area svg {{
            height: 40px;
            width: auto;
        }}

        .sidebar h2 {{
            color: white;
            font-family: 'Montserrat', sans-serif;
            font-size: 1em;
            text-align: center;
            margin-bottom: 5px;
        }}

        .sidebar .subtitle {{
            color: #888;
            font-size: 0.8em;
            text-align: center;
            margin-bottom: 25px;
        }}

        .nav-item {{
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 14px 18px;
            margin: 6px 0;
            background: rgba(255,255,255,0.05);
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.2s;
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

        .nav-item.done {{
            opacity: 0.7;
        }}

        .nav-icon {{
            font-size: 1.2em;
        }}

        .nav-title {{
            flex: 1;
            font-size: 0.9em;
        }}

        .nav-check {{
            color: #4CAF50;
            display: none;
        }}

        .nav-item.done .nav-check {{
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
            padding: 15px 25px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-shadow: 0 2px 10px rgba(0,0,0,0.05);
        }}

        .header h1 {{
            font-family: 'Montserrat', sans-serif;
            font-size: 1.1em;
            color: #333;
        }}

        .progress-area {{
            display: flex;
            align-items: center;
            gap: 12px;
        }}

        .progress-text {{
            font-weight: 600;
            color: #666;
            font-size: 0.9em;
        }}

        .progress-bar {{
            width: 180px;
            height: 8px;
            background: #e0e0e0;
            border-radius: 4px;
            overflow: hidden;
        }}

        .progress-fill {{
            height: 100%;
            background: linear-gradient(90deg, #DA291C, #F5A623);
            width: 0%;
            transition: width 0.4s ease;
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
        }}

        .welcome-content {{
            background: white;
            padding: 50px 60px;
            border-radius: 20px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
        }}

        .welcome-content h2 {{
            font-family: 'Montserrat', sans-serif;
            color: #DA291C;
            font-size: 1.8em;
            margin-bottom: 10px;
        }}

        .welcome-content p {{
            color: #666;
            line-height: 1.6;
            max-width: 400px;
        }}
    </style>
</head>
<body>
    <div class="sidebar">
        <div class="logo-area">
            {LOGO_DAVIVIENDA_INDEX}
        </div>
        <h2>{CURSO_NOMBRE}</h2>
        <p class="subtitle">Facultad Digital</p>

        <div class="nav-item" data-src="01_video/video.mp4" data-type="video" onclick="load(this)">
            <span class="nav-icon">🎬</span>
            <span class="nav-title">Introducción a FATCA & CRS</span>
            <span class="nav-check">✓</span>
        </div>

        <div class="nav-item" data-src="01_documentacion/index.html" data-type="html" onclick="load(this)">
            <span class="nav-icon">📄</span>
            <span class="nav-title">Documentación Requerida</span>
            <span class="nav-check">✓</span>
        </div>

        <div class="nav-item" data-src="02_comparador/index.html" data-type="html" onclick="load(this)">
            <span class="nav-icon">⚖️</span>
            <span class="nav-title">FATCA vs CRS</span>
            <span class="nav-check">✓</span>
        </div>

        <div class="nav-item" data-src="03_quiz/index.html" data-type="html" onclick="load(this)">
            <span class="nav-icon">📝</span>
            <span class="nav-title">Evaluación Final</span>
            <span class="nav-check">✓</span>
        </div>
    </div>

    <div class="content">
        <div class="header">
            <h1 id="current-title">Selecciona un módulo para comenzar</h1>
            <div class="progress-area">
                <span class="progress-text" id="progress-text">0/4</span>
                <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
            </div>
        </div>

        <div class="main" id="main">
            <div class="welcome">
                <div class="welcome-content">
                    <h2>¡Bienvenido!</h2>
                    <p>En este curso aprenderás sobre las regulaciones FATCA y CRS, y cómo aplicarlas en tu trabajo diario.</p>
                </div>
            </div>
        </div>
    </div>

    <script>
        const total = 4;
        let done = new Set();

        function load(el) {{
            const src = el.dataset.src;
            const type = el.dataset.type;
            const title = el.querySelector('.nav-title').textContent;

            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            el.classList.add('active');
            document.getElementById('current-title').textContent = title;

            const main = document.getElementById('main');
            if (type === 'video') {{
                main.innerHTML = '<video controls autoplay style="width:100%;height:100%;background:#000"><source src="' + src + '" type="video/mp4"></video>';
                main.querySelector('video').onended = () => markDone(el);
            }} else {{
                main.innerHTML = '<iframe src="' + src + '"></iframe>';
                setTimeout(() => markDone(el), 10000);
            }}

            if (typeof API !== 'undefined') {{
                API.LMSSetValue('cmi.core.lesson_location', src);
                API.LMSCommit('');
            }}
        }}

        function markDone(el) {{
            const src = el.dataset.src;
            if (!done.has(src)) {{
                done.add(src);
                el.classList.add('done');
                updateProgress();
            }}
        }}

        function updateProgress() {{
            const pct = (done.size / total) * 100;
            document.getElementById('progress-fill').style.width = pct + '%';
            document.getElementById('progress-text').textContent = done.size + '/' + total;

            if (typeof API !== 'undefined') {{
                API.LMSSetValue('cmi.core.score.raw', Math.round(pct));
                if (done.size >= total) {{
                    API.LMSSetValue('cmi.core.lesson_status', 'completed');
                }}
                API.LMSCommit('');
            }}
        }}

        if (typeof API !== 'undefined') {{
            API.LMSInitialize('');
            API.LMSSetValue('cmi.core.lesson_status', 'incomplete');
        }}
    </script>
</body>
</html>'''


def main():
    if OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)
    OUTPUT_DIR.mkdir(parents=True)

    print("🎨 Generando SCORM v2...")

    # Documentación
    doc_dir = OUTPUT_DIR / "01_documentacion"
    doc_dir.mkdir()
    with open(doc_dir / "index.html", 'w', encoding='utf-8') as f:
        f.write(generar_documentacion())
    print("  ✓ Documentación Requerida")

    # Comparador
    comp_dir = OUTPUT_DIR / "02_comparador"
    comp_dir.mkdir()
    with open(comp_dir / "index.html", 'w', encoding='utf-8') as f:
        f.write(generar_comparador())
    print("  ✓ Comparador FATCA vs CRS")

    # Quiz
    quiz_dir = OUTPUT_DIR / "03_quiz"
    quiz_dir.mkdir()
    with open(quiz_dir / "index.html", 'w', encoding='utf-8') as f:
        f.write(generar_quiz())
    print("  ✓ Evaluación Final")

    # Video (copiar si existe)
    video_src = Path("/Users/federico/Desktop/ia-davivienda/output/fatca_&_crs:_cumplimiento_normativo/01_video")
    if video_src.exists() and (video_src / "video.mp4").exists():
        video_dst = OUTPUT_DIR / "01_video"
        video_dst.mkdir()
        shutil.copy(video_src / "video.mp4", video_dst / "video.mp4")
        print("  ✓ Video de introducción")

    # Index
    with open(OUTPUT_DIR / "index.html", 'w', encoding='utf-8') as f:
        f.write(generar_index())
    print("  ✓ Index principal")

    # Manifest
    manifest = f'''<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="fatca_crs_v2" version="1.0"
    xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
    xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
    <metadata>
        <schema>ADL SCORM</schema>
        <schemaversion>1.2</schemaversion>
    </metadata>
    <organizations default="org1">
        <organization identifier="org1">
            <title>{CURSO_NOMBRE}</title>
            <item identifier="item1" identifierref="res1">
                <title>{CURSO_NOMBRE}</title>
            </item>
        </organization>
    </organizations>
    <resources>
        <resource identifier="res1" type="webcontent" adlcp:scormtype="sco" href="index.html">
            <file href="index.html"/>
        </resource>
    </resources>
</manifest>'''

    with open(OUTPUT_DIR / "imsmanifest.xml", 'w', encoding='utf-8') as f:
        f.write(manifest)
    print("  ✓ imsmanifest.xml")

    # Crear ZIP
    with zipfile.ZipFile(SCORM_ZIP, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(OUTPUT_DIR):
            for file in files:
                fp = Path(root) / file
                zipf.write(fp, fp.relative_to(OUTPUT_DIR))

    size = SCORM_ZIP.stat().st_size / 1024 / 1024
    print(f"\n✅ SCORM generado: {SCORM_ZIP}")
    print(f"📦 Tamaño: {size:.2f} MB")


if __name__ == "__main__":
    main()
