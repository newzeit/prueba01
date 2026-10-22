# LogTrace AI - Diagnóstico Estructurado de Logs y Errores (Google Gemini & OpenAI)

Herramienta web profesional para desarrolladores, DevOps y equipos de soporte basada en **Node.js + Express**. Permite ingresar fragmentos de logs, códigos de error HTTP o fallos de terminal y recibir un **diagnóstico estructurado inmediato y accionable** con análisis de causa raíz, severidad, pasos de resolución y comandos de verificación.

---

## 🚀 Características Principales

1. **Interfaz de Usuario (Frontend):**
   - **Editor amplio de logs:** Área de texto con tipografía monoespaciada (*JetBrains Mono*), contador dinámico de caracteres y líneas en tiempo real, atajo de teclado (`Ctrl+Enter` / `Cmd+Enter`), botón de pegado rápido desde portapapeles y limpieza en 1 clic.
   - **Selector de motor de IA:** Alternancia rápida entre **Auto (Smart)**, **Google Gemini** y **OpenAI**.
   - **Selector de contexto / tags:** Filtros rápidos ("General", "Nginx / Servidor", "Base de datos", "Node/JS", "PHP", "Docker / DevOps", "Python").
   - **Botón de análisis interactivo:** Con estado de carga (*loading state*) que muestra el progreso del análisis por fases (parsing, severidad, comandos).
   - **3 Ejemplos rápidos integrados:**
     - `502 Bad Gateway Nginx` (Upstream socket caído o no responde).
     - `CORS error policy` (Preflight OPTIONS y cabeceras Access-Control-Allow-Origin).
     - `ECONNREFUSED 127.0.0.1:3306` (Daemon MySQL / MariaDB apagado o bind-address restringida).
   - **Historial de diagnósticos:** Guarda localmente en el navegador las últimas consultas con indicador del proveedor utilizado.
   - **Exportación en Markdown:** Copia el reporte completo formateado con un solo clic para pegarlo en Jira, Slack o GitHub Issues.

2. **Diagnóstico Estructurado:**
   - **Causa Raíz:** Explicación clara y directa en 1-2 frases sobre el origen del fallo.
   - **Nivel de Severidad:** Identificación visual mediante insignias de color (🔴 Crítico, 🟡 Advertencia, 🔵 Info).
   - **Plan de Acción Paso a Paso:** Pasos numerados con comandos de consola bash o snippets de código con botones de copia instantánea.
   - **Comando de Verificación:** Comando de terminal directo para validar que el fallo ha sido resuelto.
   - **Consejo Preventivo:** Recomendaciones técnicas de mejores prácticas para evitar reincidencias en producción.

3. **Backend Node.js & Multi-Proveedor de IA:**
   - **Servidor Express Asíncrono:** Servidor de alto rendimiento con CORS, recarga dinámica de variables de entorno y servidor estático integrado.
   - **Google Gemini API:** Conexión nativa con `generativelanguage.googleapis.com` utilizando JSON Schema estructurado (`responseMimeType: application/json`). Soporta modelos contemporáneos (`gemini-3.5-flash`, `gemini-3.5-pro`, `gemini-3.8-flash`, `gemini-3.8-pro`, y personalizados).
   - **OpenAI API:** Conexión con `api.openai.com/v1/chat/completions` con `response_format: { type: "json_object" }`. Soporta `gpt-4o-mini`, `gpt-4o`, `o3-mini`, `o1`.
   - **Motor Heurístico Local:** Motor de contingencia integrado para funcionamiento inmediato sin llaves o ante fallos de cuota/red.

---

## 📁 Estructura del Proyecto

```
/var/www/html/prueba01/
├── server.js         # Backend Node.js (Servidor Express, API REST y archivos estáticos)
├── package.json      # Dependencias y scripts de ejecución (start, dev)
├── index.html        # Frontend interactivo estructurado con Tailwind CSS y Lucide Icons
├── app.js            # Lógica cliente: llamadas API, gestión de estado y persistencia local
├── styles.css        # Estilos visuales personalizados y animaciones
├── .env.example      # Plantilla de configuración de entorno
└── .env              # Variables locales de configuración (ignorado en git)
```

---

## 📋 Requisitos Previos

- **Node.js:** Versión 18.0.0 o superior (probado en Node.js v24).
- **npm:** Versión 9.0.0 o superior.

---

## 🛠️ Instalación y Puesta en Marcha

### 1. Clonar o ingresar al directorio del proyecto
```bash
cd /var/www/html/prueba01
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno
Copia la plantilla `.env.example` si aún no existe `.env`:
```bash
cp .env.example .env
```

### 4. Iniciar el servidor

**Modo Producción:**
```bash
npm start
```

**Modo Desarrollo (con recarga automática ante cambios de código):**
```bash
npm run dev
```

La aplicación y su API estarán disponibles en:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## ⚙️ Configuración de API Keys

Puedes configurar tu clave de **Google Gemini** y/o **OpenAI** de dos maneras:

### 1. Desde la interfaz web (Recomendado)
Haz clic en el botón superior **"Ajustes IA"** en la interfaz para ingresar tu API Key (`AIzaSy...` para Google o `sk-...` para OpenAI) y seleccionar tu modelo favorito. Puedes guardarla solo en memoria local del navegador o persistirla en el archivo `.env` del servidor con un solo clic.

### 2. Desde el archivo `.env`
Edita [`/var/www/html/prueba01/.env`](file:///var/www/html/prueba01/.env):
```env
# Puerto del servidor web
PORT=3000

# Proveedor preferido: "auto", "gemini" o "openai"
AI_PROVIDER=auto

# Google Gemini API
GEMINI_API_KEY=tu-google-api-key
GEMINI_MODEL=gemini-3.5-flash
GEMINI_API_URL=https://generativelanguage.googleapis.com/v1beta

# OpenAI API
OPENAI_API_KEY=tu-openai-api-key
OPENAI_MODEL=gpt-4o-mini
OPENAI_API_URL=https://api.openai.com/v1
```

---

## 📡 Endpoints de la API REST

### 1. Estado del Servidor
- **Método:** `GET`
- **Ruta:** `/api/status`
- **Respuesta de ejemplo:**
```json
{
  "status": "online",
  "openai_configured": true,
  "gemini_configured": true,
  "default_provider": "auto",
  "default_openai_model": "gpt-4o-mini",
  "default_gemini_model": "gemini-3.5-flash",
  "node_version": "v24.18.0",
  "server_time": "2026-10-22T13:20:07.942Z"
}
```

### 2. Diagnóstico de Log o Error
- **Método:** `POST`
- **Ruta:** `/api/analyze`
- **Headers opcionales:** `X-OpenAI-Key`, `X-Gemini-Key`, `X-AI-Provider`
- **Cuerpo (JSON):**
```json
{
  "error_text": "Error: connect ECONNREFUSED 127.0.0.1:3306",
  "context": "Base de datos",
  "provider": "auto",
  "model": "gemini-3.5-flash"
}
```

### 3. Prueba de Conexión de API Key
- **Método:** `POST`
- **Ruta:** `/api/test-connection`
- **Cuerpo (JSON):**
```json
{
  "provider": "gemini",
  "key": "AIzaSy...",
  "model": "gemini-3.5-flash"
}
```

### 4. Guardar Configuración en `.env`
- **Método:** `POST`
- **Ruta:** `/api/save-key`
- **Cuerpo (JSON):**
```json
{
  "gemini_key": "AIzaSy...",
  "openai_key": "sk-...",
  "gemini_model": "gemini-3.5-flash",
  "openai_model": "gpt-4o-mini",
  "provider": "auto"
}
```

### 5. Retrocompatibilidad
Las rutas anteriores basadas en PHP (`/api.php` y `/api?action=...`) son interceptadas y atendidas automáticamente por el servidor Node.js sin interrupciones.

---

## 🚢 Ejecución en Segundo Plano con PM2

Para mantener el servicio ejecutándose de forma continua en producción:

```bash
# Instalar PM2 de manera global (si no está instalado)
npm install -g pm2

# Iniciar la aplicación
pm2 start server.js --name "logtrace-ai"

# Configurar reinicio automático tras reinicios del sistema
pm2 save
pm2 startup
```
