#!/usr/bin/env python3
"""
Generador de páginas interactivas desde JSON
Crea HTML con botones reveal y modales estilo Genially
"""

import json
import os
from pathlib import Path

# Iconos SVG disponibles
ICONOS = {
    "heart": '<svg viewBox="0 0 24 24"><path d="M12,21.35L10.55,20.03C5.4,15.36 2,12.27 2,8.5C2,5.41 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.08C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.41 22,8.5C22,12.27 18.6,15.36 13.45,20.03L12,21.35Z"/></svg>',
    "star": '<svg viewBox="0 0 24 24"><path d="M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.97L5.82,21L12,17.27Z"/></svg>',
    "info": '<svg viewBox="0 0 24 24"><path d="M13,9H11V7H13M13,17H11V11H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z"/></svg>',
    "check": '<svg viewBox="0 0 24 24"><path d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z"/></svg>',
    "clock": '<svg viewBox="0 0 24 24"><path d="M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22C6.47,22 2,17.5 2,12A10,10 0 0,1 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z"/></svg>',
    "book": '<svg viewBox="0 0 24 24"><path d="M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z"/></svg>',
    "target": '<svg viewBox="0 0 24 24"><path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8Z"/></svg>'
}

ARROW_SVG = '<svg viewBox="0 0 24 24"><path d="M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z"/></svg>'
CLOSE_SVG = '<svg viewBox="0 0 24 24"><path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/></svg>'

def generar_boton(boton: dict) -> str:
    """Genera HTML de un botón reveal"""
    icono = ICONOS.get(boton.get("icono", "info"), ICONOS["info"])
    return f'''
        <button class="reveal-btn" data-modal="modal-{boton['id']}">
          <div class="reveal-btn-icon {boton.get('icono', 'info')}">
            {icono}
          </div>
          <span class="reveal-btn-text">{boton['texto']}</span>
          <div class="reveal-btn-arrow">
            {ARROW_SVG}
          </div>
        </button>'''

def generar_modal(boton: dict) -> str:
    """Genera HTML de un modal"""
    modal = boton.get("modal", {})
    contenido = modal.get("contenido", [])

    if isinstance(contenido, list):
        items = "\n          ".join([f"<li>{item}</li>" for item in contenido])
        body = f"<ul>\n          {items}\n        </ul>"
    else:
        body = f"<p>{contenido}</p>"

    return f'''
  <div class="modal-overlay" id="modal-{boton['id']}">
    <div class="modal-content">
      <button class="modal-close" aria-label="Cerrar">
        {CLOSE_SVG}
      </button>
      <h3 class="modal-title">{modal.get('titulo', boton['texto'])}</h3>
      <div class="modal-body">
        {body}
      </div>
    </div>
  </div>'''

def generar_pagina(config: dict, css_path: str = "../css") -> str:
    """Genera HTML completo desde configuración JSON"""

    pagina = config.get("pagina", {})
    botones = config.get("botones", [])

    # Generar botones
    botones_html = "\n".join([generar_boton(b) for b in botones])

    # Generar badge de duración si existe
    duracion = pagina.get("duracion")
    duracion_html = ""
    if duracion:
        duracion_html = f'''
        <div class="info-badge">
          <div class="info-badge-icon">
            {ICONOS['clock']}
          </div>
          <span class="info-badge-text">Duración: {duracion}</span>
        </div>'''

    # Generar modales
    modales_html = "\n".join([generar_modal(b) for b in botones if "modal" in b])

    return f'''<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=1920, height=1080">
  <title>{pagina.get('titulo', 'Página Interactiva')}</title>
  <link rel="stylesheet" href="{css_path}/brand.css">
  <link rel="stylesheet" href="{css_path}/components.css">
  <link rel="stylesheet" href="{css_path}/interactive.css">
</head>
<body>
  <div class="top-accent"></div>
  <div class="deco-wave"></div>

  <div class="interactive-layout">
    <div class="interactive-header">
      <div class="davi-logo">
        <div class="davi-logo-house">
          <svg viewBox="0 0 55 50" fill="none">
            <path d="M27.5 0L55 22H45V50H10V22H0L27.5 0Z" fill="#DA291C"/>
            <rect x="22" y="30" width="11" height="20" fill="white"/>
          </svg>
        </div>
        <span class="davi-logo-text">DAVIVIENDA</span>
      </div>
    </div>

    <div class="interactive-main">
      <div class="interactive-content">
        <div class="card" style="max-width: 700px; padding: 48px;">
          <h2 class="heading-3 mb-md">{pagina.get('titulo', '')}</h2>
          <p class="body-lg">{pagina.get('descripcion', '')}</p>
        </div>
      </div>

      <div class="interactive-sidebar">
        {botones_html}
        {duracion_html}
      </div>
    </div>
  </div>

  {modales_html}

  <div class="bottom-bar"></div>

  <script>
    document.addEventListener('DOMContentLoaded', function() {{
      const revealBtns = document.querySelectorAll('.reveal-btn');
      const modals = document.querySelectorAll('.modal-overlay');
      const closeBtns = document.querySelectorAll('.modal-close');

      revealBtns.forEach(btn => {{
        btn.addEventListener('click', function() {{
          const modalId = this.getAttribute('data-modal');
          const modal = document.getElementById(modalId);
          if (modal) modal.classList.add('active');
        }});
      }});

      closeBtns.forEach(btn => {{
        btn.addEventListener('click', function() {{
          this.closest('.modal-overlay').classList.remove('active');
        }});
      }});

      modals.forEach(modal => {{
        modal.addEventListener('click', function(e) {{
          if (e.target === this) this.classList.remove('active');
        }});
      }});

      document.addEventListener('keydown', function(e) {{
        if (e.key === 'Escape') {{
          modals.forEach(modal => modal.classList.remove('active'));
        }}
      }});
    }});
  </script>
</body>
</html>'''


def main():
    """Ejemplo de uso"""
    import sys

    if len(sys.argv) < 2:
        print("Uso: python generate_interactive.py <config.json> [output.html] [css_path]")
        print("Ejemplo: python generate_interactive.py config.json pagina.html ../../templates/css")
        return

    config_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else "output.html"
    css_path = sys.argv[3] if len(sys.argv) > 3 else "../css"

    with open(config_path, 'r', encoding='utf-8') as f:
        config = json.load(f)

    html = generar_pagina(config, css_path=css_path)

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)

    print(f"Generado: {output_path}")


if __name__ == "__main__":
    main()
