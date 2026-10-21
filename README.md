# LogTrace AI - Diagnóstico Estructurado de Logs y Errores

Herramienta web profesional para desarrolladores, DevOps y equipos de soporte. Permite pegar fragmentos de logs, códigos de error HTTP o fallos de terminal y recibir un **diagnóstico estructurado inmediato y accionable**.

## 🚀 Características Principales

1. **Interfaz de Usuario (Frontend):**
   - **Editor amplio de logs:** Área de texto con tipografía monoespaciada (*JetBrains Mono*), contador dinámico de caracteres y líneas, botón de pegado rápido desde portapapeles y limpieza en 1 clic.
   - **Selector de contexto / tags:** Filtros rápidos ("General", "Nginx / Servidor", "Base de datos", "Node/JS", "PHP", "Docker / DevOps", "Python").
   - **Botón de análisis interactivo:** Con estado de carga (*loading state*) que muestra el progreso de análisis por fases (parsing, severidad, formulación de comandos).
   - **3 Ejemplos rápidos con 1 clic:**
     - `502 Bad Gateway Nginx` (Upstream UNIX socket PHP-FPM caído).
     - `CORS error policy` (Preflight OPTIONS y cabeceras Access-Control-Allow-Origin).
     - `ECONNREFUSED 127.0.0.1:3306` (Daemon MySQL / MariaDB apagado o bind-address restringida).
   - **Historial de diagnósticos:** Guarda localmente las últimas consultas para volver a consultarlas al instante.
   - **Exportación en Markdown:** Copia el reporte completo con un solo clic para pegarlo en Jira, Slack o GitHub Issues.

2. **Diagnóstico Estructurado:**
   - **Causa Raíz:** Explicación clara y directa en 1-2 frases sobre el origen del fallo.
   - **Nivel de Severidad:** Identificación visual mediante insignias de color (🔴 Crítico, 🟡 Advertencia, 🔵 Info).
   - **Plan de Acción Paso a Paso:** Pasos numerados con comandos de consola bash o snippets de código con botones de copia instantánea.
   - **Comando de Verificación:** Comando de terminal directo para validar que el fallo ha sido resuelto (ej. `sudo nginx -t && sudo systemctl reload nginx`).
   - **Consejo Preventivo:** Recomendaciones técnicas de mejores prácticas para evitar reincidencias en producción.

3. **Integración con IA y Resiliencia:**
   - Conexión a la API de OpenAI (`https://api.openai.com/v1/chat/completions`) mediante proxy backend en PHP (`api.php`).
   - Soporte para configurar la clave vía archivo `.env` del servidor o directamente desde el panel de Ajustes en el frontend (vía `localStorage` y cabecera HTTP `X-OpenAI-Key`).
   - Motor heurístico local integrado para funcionamiento inmediato sin clave o ante fallos de cuota/red.

## 📁 Estructura del Proyecto

```
/var/www/html/prueba01/
├── index.html        # Frontend estructurado y responsivo con Tailwind y Lucide
├── app.js            # Lógica interactiva del cliente, gestión de estados y clipboard
├── styles.css        # Estilos visuales, scrollbars personalizados y severidades
├── api.php           # Backend proxy PHP para OpenAI y motor heurístico
├── .env.example      # Plantilla de configuración de entorno
└── .env              # Variables locales de configuración
```

## ⚙️ Configuración de OpenAI (Opcional)

Puedes definir tu API Key en `.env`:
```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
OPENAI_API_URL=https://api.openai.com/v1
```
O directamente desde la interfaz web haciendo clic en el botón **"Ajustes API"**.

## 🌐 Acceso Local

La herramienta se encuentra desplegada y lista para usar en:
[http://localhost/prueba01/](http://localhost/prueba01/)
