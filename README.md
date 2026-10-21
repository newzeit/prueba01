# LogTrace AI - Diagnóstico Estructurado de Logs y Errores (Google Gemini & OpenAI)

Herramienta web profesional para desarrolladores, DevOps y equipos de soporte. Permite pegar fragmentos de logs, códigos de error HTTP o fallos de terminal y recibir un **diagnóstico estructurado inmediato y accionable**.

## 🚀 Características Principales

1. **Interfaz de Usuario (Frontend):**
   - **Editor amplio de logs:** Área de texto con tipografía monoespaciada (*JetBrains Mono*), contador dinámico de caracteres y líneas en tiempo real, atajo de teclado (`Ctrl+Enter` / `Cmd+Enter`), botón de pegado rápido desde portapapeles y limpieza en 1 clic.
   - **Selector de motor de IA:** Botones de alternancia rápida entre **Auto (Smart)**, **Google Gemini** y **OpenAI**.
   - **Selector de contexto / tags:** Filtros rápidos ("General", "Nginx / Servidor", "Base de datos", "Node/JS", "PHP", "Docker / DevOps", "Python").
   - **Botón de análisis interactivo:** Con estado de carga (*loading state*) que muestra el progreso de análisis por fases (parsing, severidad, formulación de comandos).
   - **3 Ejemplos rápidos con 1 clic:**
     - `502 Bad Gateway Nginx` (Upstream UNIX socket PHP-FPM caído).
     - `CORS error policy` (Preflight OPTIONS y cabeceras Access-Control-Allow-Origin).
     - `ECONNREFUSED 127.0.0.1:3306` (Daemon MySQL / MariaDB apagado o bind-address restringida).
   - **Historial de diagnósticos:** Guarda localmente las últimas consultas para volver a consultarlas al instante con indicador del proveedor utilizado.
   - **Exportación en Markdown:** Copia el reporte completo con un solo clic para pegarlo en Jira, Slack o GitHub Issues.

2. **Diagnóstico Estructurado:**
   - **Causa Raíz:** Explicación clara y directa en 1-2 frases sobre el origen del fallo.
   - **Nivel de Severidad:** Identificación visual mediante insignias de color (🔴 Crítico, 🟡 Advertencia, 🔵 Info).
   - **Plan de Acción Paso a Paso:** Pasos numerados con comandos de consola bash o snippets de código con botones de copia instantánea.
   - **Comando de Verificación:** Comando de terminal directo para validar que el fallo ha sido resuelto (ej. `sudo nginx -t && sudo systemctl reload nginx` o `mysqladmin ping`).
   - **Consejo Preventivo:** Recomendaciones técnicas de mejores prácticas para evitar reincidencias en producción.

3. **Soporte Multi-Proveedor de IA:**
   - **Google Gemini API:** Conexión nativa con `generativelanguage.googleapis.com` utilizando JSON Schema estructurado (`responseMimeType: application/json`). Soporta modelos contemporáneos de la generación 3.5+ (`gemini-3.5-flash`, `gemini-3.5-pro`, `gemini-3.8-flash`, `gemini-3.8-pro`, y personalizados).
   - **OpenAI API:** Conexión con `api.openai.com/v1/chat/completions` con `response_format: { type: "json_object" }`. Soporta `gpt-4o-mini`, `gpt-4o`, `o3-mini`, `o1`.
   - **Motor Heurístico Local:** Motor de contingencia integrado para funcionamiento inmediato sin llaves o ante fallos de cuota/red.

## 📁 Estructura del Proyecto

```
/var/www/html/prueba01/
├── index.html        # Frontend estructurado y responsivo con Tailwind y Lucide
├── app.js            # Lógica interactiva del cliente, gestión de estados y clipboard
├── styles.css        # Estilos visuales, scrollbars personalizados y píldoras de proveedores
├── api.php           # Backend proxy PHP compatible con Google Gemini & OpenAI
├── .env.example      # Plantilla de configuración de entorno
└── .env              # Variables locales de configuración
```

## ⚙️ Configuración de API Keys

Puedes configurar tu clave de **Google Gemini** y/o **OpenAI** de dos maneras:

### 1. Desde la interfaz web (Recomendado)
Haz clic en el botón superior **"Ajustes IA"** o en el enlace rápido del formulario para ingresar tu API Key (`AIzaSy...` para Google o `sk-...` para OpenAI) y seleccionar tu modelo favorito.

### 2. Desde el archivo `.env` del servidor
Edita [`/var/www/html/prueba01/.env`](file:///var/www/html/prueba01/.env):
```env
# Proveedor activo: "auto", "gemini" o "openai"
AI_PROVIDER=auto

# Google Gemini API
GEMINI_API_KEY=tu-google-api-key
GEMINI_MODEL=gemini-3.5-flash

# OpenAI API
OPENAI_API_KEY=tu-openai-api-key
OPENAI_MODEL=gpt-4o-mini
```

## 🌐 Acceso Local

La herramienta se encuentra desplegada y lista para usar en:
[http://localhost/prueba01/](http://localhost/prueba01/)
