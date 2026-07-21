# Generador de recursos con IA — setup local (Local Runner)

El **Modo Agente** (la IA que escribe y diseña los recursos e-learning: contenido,
HTML, video, subtítulos) corre **en tu máquina**, no en la web pública. Cada
persona lo levanta local. Es un rato la primera vez; después es un comando.

> **¿Por qué local?** El agent-service usa tu sesión de Claude Code (tu
> suscripción), que solo existe en tu máquina. Además, la web pública (`https`)
> no puede llamar a `http://localhost` por seguridad del navegador. Por eso se
> corre local y se trabaja en `http://localhost:3000`.

---

## 1. Instalá una vez

- **Node.js** 18+
- **Google Chrome** (para el render)
- **ffmpeg** — `brew install ffmpeg` (solo si vas a componer videos)
- **Claude Code CLI**, **logueado con tu cuenta de Claude**

---

## 2. Cloná y levantá (2 terminales)

```bash
git clone https://github.com/frepettoo12/davivienda-elearning.git
cd davivienda-elearning

# Terminal 1 — el generador con IA
cd agent-service && npm install
PORT=8090 node server.mjs        # dejalo corriendo

# Terminal 2 — la app
cd frontend && npm install
npm run dev                       # abre http://localhost:3000
```

---

## 3. La IA usa tu suscripción de Claude

No hay que configurar ninguna API key: mientras estés **logueado en Claude Code**
y el `ANTHROPIC_API_KEY` esté vacío, el agente usa tu suscripción.

> ⚠️ **Con el plan Pro los límites son bajos**: alcanza para probar y algún
> recurso suelto, pero si generás mucho vas a chocar contra el tope que se
> resetea cada ~5 h. Para producción a volumen se usa el modo administrado
> (key central de la empresa con budget) — lo coordina el equipo de plataforma.

---

## 4. Usá la app

Trabajá **siempre en `http://localhost:3000`** (no en la URL pública).
Logueate con tu Google → **Contenido → ✨ Generar recurso con IA**.
Podés ver el progreso en vivo y el costo estimado de cada generación.

---

## Troubleshooting

| Síntoma | Causa / solución |
|---|---|
| **"Failed to fetch" / "Error de conexión con el agente"** | El agent-service no está corriendo, o estás en la URL pública. Verificá que `PORT=8090 node server.mjs` esté activo y que la barra diga `localhost:3000`. Probar: `curl http://localhost:8090/health` → `{"ok":true}`. |
| **"Cannot GET /ws/..."** en el preview | El recurso todavía no se generó en tu workspace. Tocá "✨ Generar recurso" o "Ver Recurso Final". |
| **Rate limit / "límite alcanzado"** | Cupo de tu suscripción agotado (más frecuente en Pro). Esperá el reset (~5 h) o usá el modelo **Haiku** (más barato en tokens) para estirar. |
| **El video no se compone** | Falta **ffmpeg**: `brew install ffmpeg`. |
| **Marca equivocada (colores Davivienda en otra empresa)** | El agent-service no pudo resolver tu empresa. Corré `gcloud auth application-default login` con acceso al proyecto, o avisá al equipo de plataforma. |
| **Chrome no rinde el screenshot** | Asegurate de tener Google Chrome instalado en la ruta estándar. |

Dudas → escribile al equipo de plataforma.
