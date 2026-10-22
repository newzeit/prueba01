/**
 * LogTrace AI - Servidor Backend Node.js
 * Proxy API y Servidor de Aplicación para Diagnóstico Estructurado de Errores con Google Gemini y OpenAI
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Cargar variables de entorno iniciales
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración CORS amplia
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-OpenAI-Key',
    'X-Google-Key',
    'X-Gemini-Key',
    'X-AI-Provider'
  ]
}));

// Parser para application/json
app.use(express.json({ limit: '10mb' }));

/**
 * Helper para recargar variables desde el archivo .env
 */
function reloadEnv() {
  if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
      process.env[k] = envConfig[k];
    }
  }
}

/**
 * Helper para obtener configuración activa
 */
function getConfig() {
  reloadEnv();
  return {
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    openaiApiUrl: process.env.OPENAI_API_URL || 'https://api.openai.com/v1',
    openaiModelDefault: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
    geminiApiUrl: process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta',
    geminiModelDefault: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
    defaultProvider: process.env.AI_PROVIDER || 'auto'
  };
}

const SYSTEM_PROMPT = `Eres un Ingeniero Principal de Infraestructura, DevOps y SRE especializado en diagnóstico de incidentes, logs y fallos de software.
Analiza con rigor técnico el fragmento de log, código de error HTTP o fallo de terminal proporcionado por el usuario.

Debes responder ÚNICAMENTE con un objeto JSON válido con la siguiente estructura exacta:
{
  "summary": "Título conciso y descriptivo del incidente (máx 60 caracteres)",
  "root_cause": "Qué originó el error en una o dos frases claras, directas y técnicas.",
  "severity": "Crítico" | "Advertencia" | "Info",
  "affected_component": "Componente, servicio o capa afectada (ej. Nginx Upstream, Driver MySQL, CORS Middleware, etc.)",
  "action_plan": [
    {
      "step": 1,
      "title": "Título corto y directo de la acción",
      "description": "Explicación clara de por qué y cómo aplicar esta solución.",
      "command": "Comando bash de terminal o fragmento de código concreto para solucionar el problema (puede ser null si es solo conceptual)",
      "type": "terminal" | "code" | "config"
    }
  ],
  "verification_command": "Un único comando de terminal directo y rápido para comprobar si ya se solucionó el fallo (ej. sudo nginx -t && sudo systemctl reload nginx)",
  "verification_explanation": "Qué salida esperar de dicho comando si todo quedó solucionado satisfactoriamente.",
  "preventive_tip": "Recomendación técnica para evitar que este incidente se repita en producción."
}

Reglas estrictas:
- El idioma del diagnóstico debe ser exclusivamente Español.
- La severidad debe ser estrictamente uno de: "Crítico", "Advertencia", "Info".
- El plan de acción debe contener de 2 a 4 pasos muy concretos, con comandos de terminal ejecutables o snippets precisos.
- El comando de verificación debe ser un comando ejecutable directo en bash/shell.
- NO agregues texto antes ni después del bloque JSON.`;

/**
 * Llamada a Google Gemini API
 */
async function callGeminiDiagnostic(apiKey, apiUrl, model, errorText, contextTag) {
  const cleanApiUrl = (apiUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
  const endpoint = `${cleanApiUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const userContent = `Contexto / Tag: [${contextTag}]\n\nFragmento de Error / Log / Terminal:\n\`\`\`\n${errorText}\n\`\`\``;

  const payload = {
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT }]
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userContent }]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1
    }
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LogTraceAI-NodeProxy/1.0'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(35000)
    });

    const responseBody = await res.text();

    if (!res.ok) {
      try {
        const errJson = JSON.parse(responseBody);
        return {
          success: false,
          error: errJson.error?.message || `Google API HTTP ${res.status}: ${responseBody}`
        };
      } catch {
        return {
          success: false,
          error: `Google API HTTP ${res.status}: ${responseBody}`
        };
      }
    }

    const decoded = JSON.parse(responseBody);
    let rawText = decoded.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return { success: false, error: 'Respuesta vacía o inesperada de Google Gemini API' };
    }

    rawText = rawText.trim();
    if (rawText.startsWith('```')) {
      rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      return { success: false, error: 'Google Gemini no devolvió un JSON estructurado válido' };
    }

    data.root_cause = data.root_cause || 'Causa raíz no identificada claramente.';
    data.severity = ['Crítico', 'Advertencia', 'Info'].includes(data.severity) ? data.severity : 'Advertencia';
    data.action_plan = Array.isArray(data.action_plan) ? data.action_plan : [];
    data.verification_command = data.verification_command || 'echo "Sin comando de verificación disponible"';

    return { success: true, data };
  } catch (err) {
    return {
      success: false,
      error: err.name === 'TimeoutError'
        ? 'Tiempo de espera agotado al conectar con Google Gemini API (35s)'
        : `Error conectando a Google Gemini: ${err.message}`
    };
  }
}

/**
 * Llamada a OpenAI API
 */
async function callOpenAiDiagnostic(apiKey, apiUrl, model, errorText, contextTag) {
  const cleanApiUrl = (apiUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const endpoint = `${cleanApiUrl}/chat/completions`;
  const userContent = `Contexto / Tag: [${contextTag}]\n\nFragmento de Error / Log / Terminal:\n\`\`\`\n${errorText}\n\`\`\``;

  const payload = {
    model: model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'LogTraceAI-NodeProxy/1.0'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(35000)
    });

    const responseBody = await res.text();

    if (!res.ok) {
      try {
        const errJson = JSON.parse(responseBody);
        return {
          success: false,
          error: errJson.error?.message || `OpenAI HTTP ${res.status}: ${responseBody}`
        };
      } catch {
        return {
          success: false,
          error: `OpenAI HTTP ${res.status}: ${responseBody}`
        };
      }
    }

    const decoded = JSON.parse(responseBody);
    const contentStr = decoded.choices?.[0]?.message?.content;

    if (!contentStr) {
      return { success: false, error: 'Respuesta inesperada de OpenAI API' };
    }

    let data;
    try {
      data = JSON.parse(contentStr);
    } catch {
      return { success: false, error: 'OpenAI no devolvió un JSON estructurado válido' };
    }

    data.root_cause = data.root_cause || 'Causa raíz no identificada claramente.';
    data.severity = ['Crítico', 'Advertencia', 'Info'].includes(data.severity) ? data.severity : 'Advertencia';
    data.action_plan = Array.isArray(data.action_plan) ? data.action_plan : [];
    data.verification_command = data.verification_command || 'echo "Sin comando de verificación disponible"';

    return { success: true, data };
  } catch (err) {
    return {
      success: false,
      error: err.name === 'TimeoutError'
        ? 'Tiempo de espera agotado al conectar con OpenAI API (35s)'
        : `Error conectando a OpenAI: ${err.message}`
    };
  }
}

/**
 * Motor heurístico avanzado para respuestas locales inmediatas
 */
function getHeuristicDiagnostic(text, context) {
  const lower = (text || '').toLowerCase();

  // 1. Caso Nginx 502 Bad Gateway
  if (lower.includes('502 bad gateway') || (lower.includes('nginx') && lower.includes('502')) || lower.includes('connect() to unix:')) {
    return {
      summary: 'Error 502 Bad Gateway en Nginx Upstream',
      root_cause: 'Nginx actúa como proxy inverso pero el servidor backend upstream (comúnmente PHP-FPM, Node.js o Gunicorn) está detenido, sobrecargado o el socket UNIX/puerto TCP no responde.',
      severity: 'Crítico',
      affected_component: 'Nginx Reverse Proxy / Upstream Service',
      action_plan: [
        {
          step: 1,
          title: 'Verificar el estado del servicio upstream',
          description: 'Comprobar si el proceso de backend está activo o si se cerró por falta de recursos.',
          command: 'sudo systemctl status php-fpm || sudo systemctl status nodeapp || ps aux | grep node',
          type: 'terminal'
        },
        {
          step: 2,
          title: 'Reiniciar el servicio upstream y validar permisos del socket',
          description: 'Reiniciar el servicio para restablecer la conexión y asegurarse de que el usuario del servidor web tenga permisos.',
          command: 'sudo systemctl restart php-fpm || npm start',
          type: 'terminal'
        },
        {
          step: 3,
          title: 'Revisar el registro de errores de Nginx para ver el destino exacto',
          description: 'Verificar en el log de error la ruta del socket o IP/puerto donde falló la conexión.',
          command: 'sudo tail -n 25 /var/log/nginx/error.log',
          type: 'terminal'
        }
      ],
      verification_command: 'curl -I http://localhost/ && sudo nginx -t',
      verification_explanation: 'Debe devolver un código HTTP 200 OK en lugar de 502, y nginx -t debe reportar "syntax is ok / test is successful".',
      preventive_tip: 'Configura monitoreo de procesos (PM2, systemd con Restart=always o Docker restart-policy) para garantizar alta disponibilidad.'
    };
  }

  // 2. Caso CORS Error Policy
  if (lower.includes('cors') || lower.includes('access-control-allow-origin') || lower.includes('has been blocked by cors policy')) {
    return {
      summary: 'Bloqueo de Política de Mismo Origen (CORS Policy)',
      root_cause: 'El navegador bloqueó la petición fetch/XHR porque el servidor no envió la cabecera "Access-Control-Allow-Origin" permitiendo el dominio origen del cliente, o rechazó la solicitud preflight OPTIONS.',
      severity: 'Advertencia',
      affected_component: 'Cabeceras HTTP de API / Middleware CORS',
      action_plan: [
        {
          step: 1,
          title: 'Habilitar cabeceras CORS en el backend Node.js (Express)',
          description: 'Configurar el paquete cors para permitir solicitudes desde el origen necesario.',
          command: 'npm install cors\n// en server.js:\nconst cors = require("cors");\napp.use(cors({ origin: "*" }));',
          type: 'code'
        },
        {
          step: 2,
          title: 'Responder a la petición preflight HTTP OPTIONS',
          description: 'Asegurarse de que el servidor retorne inmediatamente HTTP 200/204 cuando el navegador envíe el preflight OPTIONS antes del POST/PUT.',
          command: 'app.options("*", cors());',
          type: 'code'
        },
        {
          step: 3,
          title: 'Verificar cabeceras en herramientas de desarrollo',
          description: 'Inspecciona la pestaña Network de DevTools para validar que la respuesta incluya Access-Control-Allow-Origin.',
          command: null,
          type: 'config'
        }
      ],
      verification_command: 'curl -I -X OPTIONS http://localhost:3000/api/status -H "Origin: http://localhost:8080" -H "Access-Control-Request-Method: POST"',
      verification_explanation: 'La respuesta debe incluir la cabecera "Access-Control-Allow-Origin: *" o tu dominio, con código 200 o 204.',
      preventive_tip: 'Utiliza middlewares estándar de CORS y configura una lista blanca estricta de dominios para entornos de producción en lugar de un comodín indiscriminado.'
    };
  }

  // 3. Caso ECONNREFUSED MySQL / Database
  if (lower.includes('econnrefused') || lower.includes('3306') || lower.includes('sqlstate[hy000] [2002]') || (lower.includes('connection refused') && lower.includes('mysql'))) {
    return {
      summary: 'Conexión rechazada a Base de Datos (ECONNREFUSED 3306)',
      root_cause: 'El cliente intentó conectar con el puerto 3306 pero el daemon MySQL/MariaDB no está en ejecución, o está escuchando únicamente en una interfaz de red diferente (ej. bind-address restringida a 127.0.0.1 o socket local).',
      severity: 'Crítico',
      affected_component: 'Servicio MySQL / MariaDB Database Server',
      action_plan: [
        {
          step: 1,
          title: 'Verificar si el servicio MySQL / MariaDB está activo',
          description: 'Comprobar si el demonio de base de datos está detenido o falló durante el arranque.',
          command: 'sudo systemctl status mysqld || sudo systemctl status mysql || sudo systemctl status mariadb',
          type: 'terminal'
        },
        {
          step: 2,
          title: 'Iniciar el servicio de base de datos',
          description: 'Levantar el servicio de base de datos y verificar que inicie sin errores.',
          command: 'sudo systemctl start mariadb || sudo systemctl start mysql || sudo systemctl start mysqld',
          type: 'terminal'
        },
        {
          step: 3,
          title: 'Comprobar si el puerto 3306 está abierto y escuchando',
          description: 'Inspeccionar los sockets de red para validar que el puerto esté en LISTEN.',
          command: 'ss -tulpn | grep :3306 || netstat -tulnp | grep 3306',
          type: 'terminal'
        },
        {
          step: 4,
          title: 'Revisar bind-address en my.cnf si es conexión entre contenedores/remota',
          description: 'Si usas Docker o red remota, verifica que bind-address no esté bloqueando peticiones externas.',
          command: 'grep -rn "bind-address" /etc/mysql/ /etc/my.cnf.d/ /etc/my.cnf 2>/dev/null',
          type: 'terminal'
        }
      ],
      verification_command: 'mysqladmin -u root -p ping || mysql -h 127.0.0.1 -P 3306 -e "SELECT 1;"',
      verification_explanation: 'Debe responder "mysqld is alive" o devolver una fila con el valor 1.',
      preventive_tip: 'Configura `systemctl enable mysql` para que inicie automáticamente tras reinicios y monitorea el espacio en disco con `df -h` para evitar que MySQL se apague por falta de almacenamiento.'
    };
  }

  // 4. Caso PHP / Node Memory Limit Exhausted
  if (lower.includes('allowed memory size') || lower.includes('memory exhausted') || lower.includes('heap out of memory') || lower.includes('javascript heap out of memory')) {
    return {
      summary: 'Límite de memoria agotado (Heap Out of Memory)',
      root_cause: 'El proceso superó la memoria RAM máxima asignada por la configuración del motor de ejecución, típicamente al procesar volúmenes masivos de datos sin flujos continuos (streams/pagination).',
      severity: 'Advertencia',
      affected_component: 'Runtime Memory / Heap Allocator',
      action_plan: [
        {
          step: 1,
          title: 'Aumentar el límite de heap asignado a Node.js',
          description: 'Pasar el argumento --max-old-space-size para conceder más memoria al proceso Node.',
          command: 'node --max-old-space-size=4096 server.js',
          type: 'terminal'
        },
        {
          step: 2,
          title: 'Utilizar Streams y Generadores en lugar de arrays masivos',
          description: 'Procesar grandes ficheros o respuestas de base de datos línea a línea o por lotes.',
          command: 'const stream = fs.createReadStream("bigfile.log");\nstream.pipe(process.stdout);',
          type: 'code'
        }
      ],
      verification_command: 'node -e \'console.log(v8.getHeapStatistics().heap_size_limit / (1024*1024) + " MB");\'',
      verification_explanation: 'Debe mostrar la capacidad de memoria asignada en megabytes.',
      preventive_tip: 'Monitorea con process.memoryUsage() y evita acumular objetos globales innecesarios que impidan la recolección de basura.'
    };
  }

  // 5. Caso EADDRINUSE (Port already in use)
  if (lower.includes('eaddrinuse') || lower.includes('address already in use')) {
    return {
      summary: 'Puerto de red en uso (EADDRINUSE)',
      root_cause: 'El servidor no puede enlazar el socket TCP porque otro proceso ya está escuchando en la misma dirección IP y puerto.',
      severity: 'Advertencia',
      affected_component: 'Stack de Red TCP / Proceso competidor',
      action_plan: [
        {
          step: 1,
          title: 'Identificar el PID del proceso que ocupa el puerto',
          description: 'Buscar qué ejecutable y PID está enlazado al puerto en conflicto.',
          command: 'sudo lsof -i :3000 || sudo ss -tulpn | grep :3000',
          type: 'terminal'
        },
        {
          step: 2,
          title: 'Finalizar el proceso colgado o duplicado',
          description: 'Terminar de forma segura el proceso zombie o instancia anterior de la app.',
          command: 'sudo kill -15 <PID> || fuser -k 3000/tcp',
          type: 'terminal'
        }
      ],
      verification_command: 'sudo lsof -i :3000 || echo "Puerto libre"',
      verification_explanation: 'Si el puerto fue liberado, el comando no mostrará ninguna salida o imprimirá "Puerto libre".',
      preventive_tip: 'Maneja adecuadamente el evento SIGINT/SIGTERM en tu aplicación para liberar sockets antes de salir (server.close()).'
    };
  }

  // Diagnóstico genérico estructurado
  return {
    summary: `Incidente de ejecución detectado (${context || 'General'})`,
    root_cause: 'Se detectó una excepción o anomalía en el flujo de ejecución. Analiza las trazas de pila superiores para ubicar el archivo y línea donde se interrumpió el proceso.',
    severity: (lower.includes('fatal') || lower.includes('panic') || lower.includes('crash')) ? 'Crítico' : 'Advertencia',
    affected_component: `Capa de aplicación / ${context || 'General'}`,
    action_plan: [
      {
        step: 1,
        title: 'Revisar las líneas superiores del log de depuración',
        description: 'Ubicar el archivo de código fuente específico y la función que disparó la excepción no controlada.',
        command: 'tail -n 50 /var/log/syslog 2>/dev/null || journalctl -xe --no-pager -n 30',
        type: 'terminal'
      },
      {
        step: 2,
        title: 'Verificar variables de entorno y conectividad de dependencias',
        description: 'Asegúrate de que los servicios de apoyo (caché, base de datos, APIs de terceros) estén disponibles.',
        command: 'cat .env 2>/dev/null | grep -v "KEY\\|SECRET\\|PASSWORD"',
        type: 'terminal'
      }
    ],
    verification_command: 'uptime && free -h',
    verification_explanation: 'Comprobar que el sistema mantenga una carga estable y memoria RAM suficiente.',
    preventive_tip: 'Configura tu Google Gemini API Key o OpenAI API Key en la configuración de la app para obtener un análisis semántico exhaustivo impulsado por IA.'
  };
}

/**
 * Controlador de Estado (Status)
 */
function handleStatus(req, res) {
  const config = getConfig();
  return res.json({
    status: 'online',
    openai_configured: Boolean(config.openaiApiKey),
    gemini_configured: Boolean(config.geminiApiKey),
    default_provider: config.defaultProvider,
    default_openai_model: config.openaiModelDefault,
    default_gemini_model: config.geminiModelDefault,
    node_version: process.version,
    server_time: new Date().toISOString()
  });
}

/**
 * Controlador para prueba de conexión (Test Connection)
 */
async function handleTestConnection(req, res) {
  const config = getConfig();
  const { provider = 'gemini', key = '', model = '' } = req.body || {};
  const t0 = Date.now();

  if (provider === 'gemini') {
    const testKey = key.trim() || config.geminiApiKey;
    const testModel = model.trim() || config.geminiModelDefault;

    if (!testKey) {
      return res.status(400).json({ success: false, error: 'No se proporcionó API Key de Google Gemini.' });
    }

    const testRes = await callGeminiDiagnostic(testKey, config.geminiApiUrl, testModel, 'ping test: return {"summary": "OK"}', 'Ping');
    const latency = Date.now() - t0;

    if (testRes.success) {
      return res.json({
        success: true,
        provider: 'Google Gemini',
        model: testModel,
        latency_ms: latency,
        message: `¡Conexión exitosa con Google Gemini API en ${latency}ms!`
      });
    } else {
      return res.status(400).json({
        success: false,
        provider: 'Google Gemini',
        model: testModel,
        latency_ms: latency,
        error: testRes.error || 'Fallo de conexión desconocido con Google Gemini'
      });
    }
  } else if (provider === 'openai') {
    const testKey = key.trim() || config.openaiApiKey;
    const testModel = model.trim() || config.openaiModelDefault;

    if (!testKey) {
      return res.status(400).json({ success: false, error: 'No se proporcionó API Key de OpenAI.' });
    }

    const testRes = await callOpenAiDiagnostic(testKey, config.openaiApiUrl, testModel, 'ping test: return {"summary": "OK"}', 'Ping');
    const latency = Date.now() - t0;

    if (testRes.success) {
      return res.json({
        success: true,
        provider: 'OpenAI',
        model: testModel,
        latency_ms: latency,
        message: `¡Conexión exitosa con OpenAI API en ${latency}ms!`
      });
    } else {
      return res.status(400).json({
        success: false,
        provider: 'OpenAI',
        model: testModel,
        latency_ms: latency,
        error: testRes.error || 'Fallo de conexión desconocido con OpenAI'
      });
    }
  }

  return res.status(400).json({ success: false, error: 'Proveedor desconocido.' });
}

/**
 * Controlador para guardar claves en .env (Save Key)
 */
function handleSaveKey(req, res) {
  const config = getConfig();
  const data = req.body || {};

  const newOpenAiKey = (data.openai_key !== undefined ? data.openai_key : (data.api_key !== undefined ? data.api_key : config.openaiApiKey)) || '';
  const newGeminiKey = (data.gemini_key !== undefined ? data.gemini_key : (data.google_key !== undefined ? data.google_key : config.geminiApiKey)) || '';
  const newProvider = (data.provider || config.defaultProvider || 'auto').trim();
  const newOpenAiModel = (data.openai_model || config.openaiModelDefault || 'gpt-4o-mini').trim();
  const newGeminiModel = (data.gemini_model || config.geminiModelDefault || 'gemini-3.5-flash').trim();

  let content = '# Configuración de Proveedores de IA para Diagnóstico de Errores\n';
  content += `AI_PROVIDER=${newProvider}\n\n`;
  content += '# Google Gemini API\n';
  content += `GEMINI_API_KEY=${newGeminiKey}\n`;
  content += `GEMINI_MODEL=${newGeminiModel || 'gemini-3.5-flash'}\n`;
  content += `GEMINI_API_URL=${config.geminiApiUrl || 'https://generativelanguage.googleapis.com/v1beta'}\n\n`;
  content += '# OpenAI API\n';
  content += `OPENAI_API_KEY=${newOpenAiKey}\n`;
  content += `OPENAI_MODEL=${newOpenAiModel || 'gpt-4o-mini'}\n`;
  content += `OPENAI_API_URL=${config.openaiApiUrl || 'https://api.openai.com/v1'}\n`;

  try {
    fs.writeFileSync(envPath, content, 'utf8');
    reloadEnv();
    return res.json({ success: true, message: 'Configuración guardada correctamente en .env' });
  } catch (err) {
    return res.status(500).json({ error: `No se pudo escribir en el archivo .env: ${err.message}` });
  }
}

/**
 * Controlador principal de diagnóstico (Analyze Error)
 */
async function handleAnalyze(req, res) {
  const config = getConfig();
  const input = req.body || {};

  const errorText = (input.error_text || '').trim();
  const contextTag = (input.context || 'General').trim();
  const headerProvider = req.headers['x-ai-provider'];
  const requestedProvider = (input.provider || headerProvider || 'auto').trim();
  const requestedModel = (input.model || '').trim();

  if (!errorText) {
    return res.status(400).json({ error: 'El texto del log o error es requerido.' });
  }

  const startTime = Date.now();

  // Claves pasadas por headers HTTP (permiten usar claves de localStorage)
  const headerOpenAiKey = (req.headers['x-openai-key'] || '').trim();
  const headerGeminiKey = (req.headers['x-google-key'] || req.headers['x-gemini-key'] || '').trim();

  const effectiveOpenAiKey = headerOpenAiKey || config.openaiApiKey;
  const effectiveGeminiKey = headerGeminiKey || config.geminiApiKey;

  // Determinar qué proveedor ejecutar
  let targetProvider = 'heuristic';

  if (requestedProvider === 'gemini') {
    targetProvider = effectiveGeminiKey ? 'gemini' : 'heuristic';
  } else if (requestedProvider === 'openai') {
    targetProvider = effectiveOpenAiKey ? 'openai' : 'heuristic';
  } else {
    // Modo automático: dar prioridad al proveedor con clave configurada
    if (effectiveGeminiKey) {
      targetProvider = 'gemini';
    } else if (effectiveOpenAiKey) {
      targetProvider = 'openai';
    } else {
      targetProvider = 'heuristic';
    }
  }

  // Ejecutar proveedor seleccionado
  if (targetProvider === 'gemini') {
    const modelToUse = requestedModel || config.geminiModelDefault;
    const geminiResult = await callGeminiDiagnostic(effectiveGeminiKey, config.geminiApiUrl, modelToUse, errorText, contextTag);
    const latency = Date.now() - startTime;

    if (geminiResult.success) {
      return res.json({
        success: true,
        is_live_ai: true,
        source: 'gemini',
        provider: 'Google Gemini (En Vivo)',
        model: modelToUse,
        latency_ms: latency,
        api_endpoint: 'generativelanguage.googleapis.com',
        data: geminiResult.data
      });
    } else {
      // Fallback heurístico en caso de error de Google
      const apiError = geminiResult.error || 'Error desconocido en Google Gemini API';
      const fallback = getHeuristicDiagnostic(errorText, contextTag);
      return res.json({
        success: true,
        is_live_ai: false,
        source: 'heuristic_fallback',
        provider: 'Motor de Contingencia (Simulado)',
        attempted_provider: 'Google Gemini',
        fallback_reason: apiError,
        warning: `Google Gemini API error: ${apiError}. Se utilizó el motor heurístico local de prueba.`,
        model: 'heuristic-engine',
        latency_ms: latency,
        data: fallback
      });
    }
  } else if (targetProvider === 'openai') {
    const isKnownOpenAi = requestedModel && (requestedModel.startsWith('gpt') || requestedModel.startsWith('o1') || requestedModel.startsWith('o3'));
    const modelToUse = isKnownOpenAi ? requestedModel : config.openaiModelDefault;
    const openaiResult = await callOpenAiDiagnostic(effectiveOpenAiKey, config.openaiApiUrl, modelToUse, errorText, contextTag);
    const latency = Date.now() - startTime;

    if (openaiResult.success) {
      return res.json({
        success: true,
        is_live_ai: true,
        source: 'openai',
        provider: 'OpenAI (En Vivo)',
        model: modelToUse,
        latency_ms: latency,
        api_endpoint: 'api.openai.com',
        data: openaiResult.data
      });
    } else {
      const apiError = openaiResult.error || 'Error desconocido en OpenAI API';
      const fallback = getHeuristicDiagnostic(errorText, contextTag);
      return res.json({
        success: true,
        is_live_ai: false,
        source: 'heuristic_fallback',
        provider: 'Motor de Contingencia (Simulado)',
        attempted_provider: 'OpenAI',
        fallback_reason: apiError,
        warning: `OpenAI API error: ${apiError}. Se utilizó el motor heurístico local de prueba.`,
        model: 'heuristic-engine',
        latency_ms: latency,
        data: fallback
      });
    }
  }

  // Motor heurístico local directo
  const diagnostic = getHeuristicDiagnostic(errorText, contextTag);
  const latency = Date.now() - startTime;

  return res.json({
    success: true,
    is_live_ai: false,
    source: 'heuristic',
    provider: 'Motor Heurístico Local (Prueba Offline)',
    notice: 'Diagnóstico generado con el motor heurístico de prueba (sin consumir API). Para diagnósticos con IA avanzada en tiempo real, configure su Google Gemini API Key o OpenAI API Key en Ajustes.',
    model: 'local-rules-engine',
    latency_ms: latency,
    data: diagnostic
  });
}

// Router común para soportar tanto rutas REST como compatibilidad con ?action=
function handleDynamicAction(req, res) {
  const action = req.query.action || req.body?.action || '';
  if (req.method === 'GET' && action === 'status') {
    return handleStatus(req, res);
  }
  if (req.method === 'POST') {
    if (action === 'test_connection') {
      return handleTestConnection(req, res);
    }
    if (action === 'save_key') {
      return handleSaveKey(req, res);
    }
    return handleAnalyze(req, res);
  }
  if (req.method === 'GET') {
    return handleStatus(req, res);
  }
  return res.status(405).json({ error: 'Método no permitido' });
}

// Rutas modernas REST
app.get('/api/status', handleStatus);
app.post('/api/test-connection', handleTestConnection);
app.post('/api/save-key', handleSaveKey);
app.post('/api/analyze', handleAnalyze);

// Rutas con compatibilidad total para query parameter ?action= (ej. api.php o /api)
app.all('/api.php', handleDynamicAction);
app.all('/api', handleDynamicAction);

// Servir archivos estáticos del frontend (index.html, styles.css, app.js, etc.)
app.use(express.static(__dirname));

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 LogTrace AI (Node.js Server) corriendo con éxito`);
  console.log(`🌐 Acceso local: http://localhost:${PORT}/`);
  console.log(`📡 Endpoints API: http://localhost:${PORT}/api/`);
  console.log(`⚡ Versión Node.js: ${process.version}`);
  console.log(`====================================================`);
});
