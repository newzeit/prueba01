<?php
/**
 * Backend Proxy API para Diagnóstico Estructurado de Errores con OpenAI
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-OpenAI-Key');

// Responder a preflight requests de CORS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Cargar variables de entorno desde .env si existe
function loadEnv(string $path): array {
    if (!file_exists($path)) {
        return [];
    }
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    $env = [];
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) {
            continue;
        }
        if (strpos($line, '=') !== false) {
            [$key, $val] = explode('=', $line, 2);
            $key = trim($key);
            $val = trim($val, " \t\n\r\0\x0B\"'");
            $env[$key] = $val;
        }
    }
    return $env;
}

$envFile = __DIR__ . '/.env';
$envVars = loadEnv($envFile);

$openaiApiKeyEnv = getenv('OPENAI_API_KEY') ?: ($envVars['OPENAI_API_KEY'] ?? '');
$openaiApiUrl = getenv('OPENAI_API_URL') ?: ($envVars['OPENAI_API_URL'] ?? 'https://api.openai.com/v1');
$openaiModelDefault = getenv('OPENAI_MODEL') ?: ($envVars['OPENAI_MODEL'] ?? 'gpt-4o-mini');

// Endpoint de estado
$action = $_GET['action'] ?? '';
if ($action === 'status') {
    echo json_encode([
        'status' => 'online',
        'openai_configured' => !empty($openaiApiKeyEnv),
        'default_model' => $openaiModelDefault,
        'api_url' => $openaiApiUrl,
        'php_version' => PHP_VERSION,
        'server_time' => date('c'),
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

// Endpoint para guardar clave API localmente en .env
if ($action === 'save_key' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true) ?: [];
    $newKey = trim($data['api_key'] ?? '');
    $newModel = trim($data['model'] ?? $openaiModelDefault);

    if ($newKey !== '' && !str_starts_with($newKey, 'sk-')) {
        http_response_code(400);
        echo json_encode(['error' => 'Formato de API Key no válido. Debe comenzar con sk-'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $content = "# Configuración de OpenAI para Diagnóstico de Errores\n";
    $content .= "OPENAI_API_KEY={$newKey}\n";
    $content .= "OPENAI_API_URL=" . ($openaiApiUrl ?: 'https://api.openai.com/v1') . "\n";
    $content .= "OPENAI_MODEL=" . ($newModel ?: 'gpt-4o-mini') . "\n";

    if (@file_put_contents($envFile, $content) !== false) {
        echo json_encode(['success' => true, 'message' => 'Configuración guardada en .env'], JSON_UNESCAPED_UNICODE);
    } else {
        http_response_code(500);
        echo json_encode(['error' => 'No se pudo escribir en el archivo .env'], JSON_UNESCAPED_UNICODE);
    }
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Método no permitido. Use POST.'], JSON_UNESCAPED_UNICODE);
    exit;
}

// Leer payload del POST
$rawInput = file_get_contents('php://input');
$input = json_decode($rawInput, true);

if (!is_array($input)) {
    http_response_code(400);
    echo json_encode(['error' => 'Cuerpo de la solicitud inválido. Debe ser JSON.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$errorText = trim($input['error_text'] ?? '');
$contextTag = trim($input['context'] ?? 'General');
$requestedModel = trim($input['model'] ?? $openaiModelDefault);

if ($errorText === '') {
    http_response_code(400);
    echo json_encode(['error' => 'El texto del log o error es requerido.'], JSON_UNESCAPED_UNICODE);
    exit;
}

// Determinar API key (encabezado HTTP o .env)
$headerKey = $_SERVER['HTTP_X_OPENAI_KEY'] ?? '';
$apiKey = !empty($headerKey) ? trim($headerKey) : $openaiApiKeyEnv;

// Si hay clave API, llamar a OpenAI
if (!empty($apiKey)) {
    $openaiResult = callOpenAiDiagnostic($apiKey, $openaiApiUrl, $requestedModel, $errorText, $contextTag);
    if ($openaiResult['success']) {
        echo json_encode([
            'success' => true,
            'source' => 'openai',
            'model' => $requestedModel,
            'data' => $openaiResult['data']
        ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        exit;
    } else {
        // Si falló OpenAI (ej. quota, clave incorrecta), devolvemos el error o fallback
        $apiError = $openaiResult['error'] ?? 'Error desconocido en OpenAI';
        
        // Si el usuario quiere ver el error directamente cuando provee una clave inválida
        $fallback = getHeuristicDiagnostic($errorText, $contextTag);
        echo json_encode([
            'success' => true,
            'source' => 'heuristic_fallback',
            'warning' => "OpenAI API error: {$apiError}. Se utilizó el motor heurístico de contingencia.",
            'model' => 'heuristic-engine',
            'data' => $fallback
        ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        exit;
    }
}

// Si NO hay clave API configurada, utilizar el motor heurístico local
$diagnostic = getHeuristicDiagnostic($errorText, $contextTag);

echo json_encode([
    'success' => true,
    'source' => 'heuristic',
    'notice' => 'Diagnóstico generado con el motor heurístico local integrado. Para diagnósticos con IA avanzada en tiempo real, configure su OPENAI_API_KEY en .env o en Ajustes.',
    'model' => 'local-rules-engine',
    'data' => $diagnostic
], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
exit;

/**
 * Llamada a la API de OpenAI con JSON Schema estructurado
 */
function callOpenAiDiagnostic(string $apiKey, string $apiUrl, string $model, string $errorText, string $contextTag): array {
    $endpoint = rtrim($apiUrl, '/') . '/chat/completions';

    $systemPrompt = <<<PROMPT
Eres un Ingeniero Principal de Infraestructura, DevOps y SRE especializado en diagnóstico de incidentes, logs y fallos de software.
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
- NO agregues texto antes ni después del bloque JSON.
PROMPT;

    $userContent = "Contexto / Tag: [{$contextTag}]\n\nFragmento de Error / Log / Terminal:\n```\n{$errorText}\n```";

    $payload = [
        'model' => $model,
        'messages' => [
            ['role' => 'system', 'content' => $systemPrompt],
            ['role' => 'user', 'content' => $userContent]
        ],
        'response_format' => ['type' => 'json_object'],
        'temperature' => 0.1,
    ];

    $ch = curl_init($endpoint);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $apiKey,
            'Content-Type: application/json',
            'User-Agent: ErrorDiagnosticProxy/1.0'
        ],
        CURLOPT_POSTFIELDS => json_encode($payload),
        CURLOPT_TIMEOUT => 35,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => true
    ]);

    $response = curl_exec($ch);
    $curlError = curl_error($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($curlError !== '') {
        return ['success' => false, 'error' => "cURL error: {$curlError}"];
    }

    if ($httpCode !== 200) {
        $jsonErr = json_decode((string)$response, true);
        $msg = $jsonErr['error']['message'] ?? "HTTP {$httpCode}: {$response}";
        return ['success' => false, 'error' => $msg];
    }

    $decoded = json_decode((string)$response, true);
    if (!isset($decoded['choices'][0]['message']['content'])) {
        return ['success' => false, 'error' => 'Respuesta inesperada de OpenAI API'];
    }

    $contentStr = $decoded['choices'][0]['message']['content'];
    $data = json_decode($contentStr, true);

    if (!is_array($data)) {
        return ['success' => false, 'error' => 'La IA no devolvió un JSON válido'];
    }

    // Normalizar campos obligatorios
    $data['root_cause'] = $data['root_cause'] ?? 'Causa raíz no identificada claramente.';
    $data['severity'] = in_array($data['severity'] ?? '', ['Crítico', 'Advertencia', 'Info'], true) ? $data['severity'] : 'Advertencia';
    $data['action_plan'] = is_array($data['action_plan'] ?? null) ? $data['action_plan'] : [];
    $data['verification_command'] = $data['verification_command'] ?? 'echo "Sin comando de verificación disponible"';

    return ['success' => true, 'data' => $data];
}

/**
 * Motor heurístico avanzado para respuestas locales inmediatas
 */
function getHeuristicDiagnostic(string $text, string $context): array {
    $lower = mb_strtolower($text, 'UTF-8');

    // 1. Caso Nginx 502 Bad Gateway
    if (strpos($lower, '502 bad gateway') !== false || (strpos($lower, 'nginx') !== false && strpos($lower, '502') !== false) || strpos($lower, 'connect() to unix:') !== false) {
        return [
            'summary' => 'Error 502 Bad Gateway en Nginx Upstream',
            'root_cause' => 'Nginx actúa como proxy inverso pero el servidor backend upstream (comúnmente PHP-FPM, Node.js o Gunicorn) está detenido, sobrecargado o el socket UNIX/puerto TCP no responde.',
            'severity' => 'Crítico',
            'affected_component' => 'Nginx Reverse Proxy / PHP-FPM Upstream',
            'action_plan' => [
                [
                    'step' => 1,
                    'title' => 'Verificar el estado del servicio upstream (PHP-FPM)',
                    'description' => 'Comprobar si el proceso de procesamiento PHP está activo o si se cerró por agotamiento de recursos.',
                    'command' => 'sudo systemctl status php8.2-fpm || sudo systemctl status php8.3-fpm || sudo systemctl status php-fpm',
                    'type' => 'terminal'
                ],
                [
                    'step' => 2,
                    'title' => 'Reiniciar el servicio upstream y validar permisos del socket',
                    'description' => 'Reiniciar el servicio para restablecer el socket UNIX y asegurarse de que el usuario www-data o nginx tenga permisos de lectura/escritura.',
                    'command' => 'sudo systemctl restart php-fpm || sudo systemctl restart php8.2-fpm',
                    'type' => 'terminal'
                ],
                [
                    'step' => 3,
                    'title' => 'Revisar el registro de errores de Nginx para ver el destino exacto',
                    'description' => 'Verificar en el log de error la ruta del socket o IP/puerto donde falló la conexión.',
                    'command' => 'sudo tail -n 25 /var/log/nginx/error.log',
                    'type' => 'terminal'
                ]
            ],
            'verification_command' => 'curl -I http://localhost/ && sudo nginx -t',
            'verification_explanation' => 'Debe devolver un código HTTP 200 OK en lugar de 502, y nginx -t debe reportar "syntax is ok / test is successful".',
            'preventive_tip' => 'Configura monitoreo de procesos (Monit, Supervisor o systemd Restart=always) y ajusta pm.max_children en la configuración del pool de FPM.'
        ];
    }

    // 2. Caso CORS Error Policy
    if (strpos($lower, 'cors') !== false || strpos($lower, 'access-control-allow-origin') !== false || strpos($lower, 'has been blocked by cors policy') !== false) {
        return [
            'summary' => 'Bloqueo de Política de Mismo Origen (CORS Policy)',
            'root_cause' => 'El navegador bloqueó la petición fetch/XHR porque el servidor no envió la cabecera "Access-Control-Allow-Origin" permitiendo el dominio origen del cliente, o rechazó la solicitud preflight OPTIONS.',
            'severity' => 'Advertencia',
            'affected_component' => 'Cabeceras HTTP de API / Middleware CORS',
            'action_plan' => [
                [
                    'step' => 1,
                    'title' => 'Habilitar cabeceras CORS en el backend (Node/Express o PHP)',
                    'description' => 'Configurar los encabezados necesarios para responder con el origen permitido y habilitar métodos GET, POST, PUT, DELETE, OPTIONS.',
                    'command' => "header('Access-Control-Allow-Origin: *');\nheader('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');\nheader('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');",
                    'type' => 'code'
                ],
                [
                    'step' => 2,
                    'title' => 'Manejar la petición preflight HTTP OPTIONS',
                    'description' => 'Asegurarse de que el servidor retorne inmediatamente HTTP 200/204 cuando el navegador envíe el preflight OPTIONS antes del POST/PUT.',
                    'command' => "if (\$_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }",
                    'type' => 'code'
                ],
                [
                    'step' => 3,
                    'title' => 'Alternativa en Express.js (Node.js)',
                    'description' => 'Si tu backend es Node/Express, instala y utiliza el paquete oficial de cors.',
                    'command' => "npm install cors\n// en app.js:\nconst cors = require('cors');\napp.use(cors({ origin: 'http://localhost:3000', credentials: true }));",
                    'type' => 'code'
                ]
            ],
            'verification_command' => 'curl -I -X OPTIONS http://localhost:8000/api -H "Origin: http://localhost:3000" -H "Access-Control-Request-Method: POST"',
            'verification_explanation' => 'La respuesta debe incluir la cabecera "Access-Control-Allow-Origin: *" o tu dominio, con código 200 o 204.',
            'preventive_tip' => 'Utiliza middlewares estándar de CORS y configura una lista blanca estricta de dominios para entornos de producción en lugar de un comodín indiscriminado.'
        ];
    }

    // 3. Caso ECONNREFUSED MySQL / Database
    if (strpos($lower, 'econnrefused') !== false || strpos($lower, '3306') !== false || strpos($lower, 'sqlstate[hy000] [2002]') !== false || (strpos($lower, 'connection refused') !== false && strpos($lower, 'mysql') !== false)) {
        return [
            'summary' => 'Conexión rechazada a Base de Datos (ECONNREFUSED 3306)',
            'root_cause' => 'El cliente intentó conectar con el puerto 3306 pero el daemon MySQL/MariaDB no está en ejecución, o está escuchando únicamente en una interfaz de red diferente (ej. bind-address restringida a 127.0.0.1 o socket local).',
            'severity' => 'Crítico',
            'affected_component' => 'Servicio MySQL / MariaDB Database Server',
            'action_plan' => [
                [
                    'step' => 1,
                    'title' => 'Verificar si el servicio MySQL / MariaDB está activo',
                    'description' => 'Comprobar si el demonio de base de datos está detenido o falló durante el arranque.',
                    'command' => 'sudo systemctl status mysqld || sudo systemctl status mysql || sudo systemctl status mariadb',
                    'type' => 'terminal'
                ],
                [
                    'step' => 2,
                    'title' => 'Iniciar el servicio de base de datos',
                    'description' => 'Levantar el servicio de base de datos y verificar que inicie sin errores.',
                    'command' => 'sudo systemctl start mariadb || sudo systemctl start mysql || sudo systemctl start mysqld',
                    'type' => 'terminal'
                ],
                [
                    'step' => 3,
                    'title' => 'Comprobar si el puerto 3306 está abierto y escuchando',
                    'description' => 'Inspeccionar los sockets de red para validar que el puerto esté en LISTEN.',
                    'command' => 'ss -tulpn | grep :3306 || netstat -tulnp | grep 3306',
                    'type' => 'terminal'
                ],
                [
                    'step' => 4,
                    'title' => 'Revisar bind-address en my.cnf si es conexión entre contenedores/remota',
                    'description' => 'Si usas Docker o red remota, verifica que bind-address no esté bloqueando peticiones externas.',
                    'command' => 'grep -rn "bind-address" /etc/mysql/ /etc/my.cnf.d/ /etc/my.cnf 2>/dev/null',
                    'type' => 'terminal'
                ]
            ],
            'verification_command' => 'mysqladmin -u root -p ping || mysql -h 127.0.0.1 -P 3306 -e "SELECT 1;"',
            'verification_explanation' => 'Debe responder "mysqld is alive" o devolver una fila con el valor 1.',
            'preventive_tip' => 'Configura `systemctl enable mysql` para que inicie automáticamente tras reinicios y monitorea el espacio en disco con `df -h` para evitar que MySQL se apague por falta de almacenamiento.'
        ];
    }

    // 4. Caso PHP Fatal error: Allowed memory size of X bytes exhausted
    if (strpos($lower, 'allowed memory size') !== false || strpos($lower, 'memory exhausted') !== false) {
        return [
            'summary' => 'Memoria PHP agotada (Memory Limit Exhausted)',
            'root_cause' => 'El script PHP excedió el límite de memoria RAM permitido por la directiva memory_limit en php.ini, típicamente al cargar conjuntos de datos grandes o procesar archivos pesados sin paginación.',
            'severity' => 'Advertencia',
            'affected_component' => 'Motor de ejecución PHP / php.ini memory_limit',
            'action_plan' => [
                [
                    'step' => 1,
                    'title' => 'Aumentar temporalmente el límite en tiempo de ejecución',
                    'description' => 'Si es un script específico o comando CLI que requiere más memoria puntualmente.',
                    'command' => "ini_set('memory_limit', '512M');",
                    'type' => 'code'
                ],
                [
                    'step' => 2,
                    'title' => 'Aumentar memory_limit global en php.ini',
                    'description' => 'Modificar la configuración general del servidor web o php-fpm.',
                    'command' => "sudo sed -i 's/^memory_limit = .*/memory_limit = 512M/' $(php -r 'echo php_ini_loaded_file();') && sudo systemctl restart php-fpm",
                    'type' => 'terminal'
                ],
                [
                    'step' => 3,
                    'title' => 'Optimizar la consulta o iterador para no saturar la RAM',
                    'description' => 'Procesar registros en lotes (chunks o generators) en lugar de fetchAll() masivos.',
                    'command' => "// Usar cursores / yield en lugar de cargar todo en un array\nwhile (\$row = \$stmt->fetch(PDO::FETCH_ASSOC)) { /* procesar uno a uno */ }",
                    'type' => 'code'
                ]
            ],
            'verification_command' => 'php -i | grep memory_limit',
            'verification_explanation' => 'Debe mostrar el nuevo límite configurado (ej. memory_limit => 512M => 512M).',
            'preventive_tip' => 'Evita cargar colecciones completas de datos o archivos enteros en memoria. Utiliza generadores (generators) y procesamiento por bloques (chunking).'
        ];
    }

    // 5. Caso EADDRINUSE (Port already in use)
    if (strpos($lower, 'eaddrinuse') !== false || strpos($lower, 'address already in use') !== false) {
        return [
            'summary' => 'Puerto de red en uso (EADDRINUSE)',
            'root_cause' => 'El servidor no puede enlazar el socket TCP porque otro proceso ya está escuchando en la misma dirección IP y puerto.',
            'severity' => 'Advertencia',
            'affected_component' => 'Stack de Red TCP / Proceso competidor',
            'action_plan' => [
                [
                    'step' => 1,
                    'title' => 'Identificar el PID del proceso que ocupa el puerto',
                    'description' => 'Buscar qué ejecutable y PID está enlazado al puerto en conflicto.',
                    'command' => 'sudo lsof -i :3000 || sudo ss -tulpn | grep :3000',
                    'type' => 'terminal'
                ],
                [
                    'step' => 2,
                    'title' => 'Finalizar el proceso colgado o duplicado',
                    'description' => 'Terminar de forma segura el proceso zombie o instancia anterior de la app.',
                    'command' => 'sudo kill -15 <PID> || fuser -k 3000/tcp',
                    'type' => 'terminal'
                ]
            ],
            'verification_command' => 'sudo lsof -i :3000 || echo "Puerto libre"',
            'verification_explanation' => 'Si el puerto fue liberado, el comando no mostrará ninguna salida o imprimirá "Puerto libre".',
            'preventive_tip' => 'Maneja adecuadamente el evento SIGINT/SIGTERM en tu aplicación para liberar sockets antes de salir (server.close()).'
        ];
    }

    // Diagnóstico genérico estructurado
    return [
        'summary' => 'Incidente de ejecución detectado (' . htmlspecialchars($context) . ')',
        'root_cause' => 'Se detectó una excepción o anomalía en el flujo de ejecución. Analiza las trazas de pila superiores para ubicar el archivo y línea donde se interrumpió el proceso.',
        'severity' => (strpos($lower, 'fatal') !== false || strpos($lower, 'panic') !== false || strpos($lower, 'crash') !== false) ? 'Crítico' : 'Advertencia',
        'affected_component' => 'Capa de aplicación / ' . $context,
        'action_plan' => [
            [
                'step' => 1,
                'title' => 'Revisar las líneas superiores del log de depuración',
                'description' => 'Ubicar el archivo de código fuente específico y la función que disparó la excepción no controlada.',
                'command' => 'tail -n 50 /var/log/syslog 2>/dev/null || journalctl -xe --no-pager -n 30',
                'type' => 'terminal'
            ],
            [
                'step' => 2,
                'title' => 'Verificar variables de entorno y conectividad de dependencias',
                'description' => 'Asegúrate de que los servicios de apoyo (caché, base de datos, APIs de terceros) estén disponibles.',
                'command' => 'cat .env 2>/dev/null | grep -v "KEY\\|SECRET\\|PASSWORD"',
                'type' => 'terminal'
            ]
        ],
        'verification_command' => 'uptime && free -h',
        'verification_explanation' => 'Comprobar que el sistema mantenga una carga estable y memoria RAM suficiente.',
        'preventive_tip' => 'Configura tu OPENAI_API_KEY en la configuración de la app para obtener un análisis semántico exhaustivo impulsado por IA para cualquier tipo de stack tecnológico.'
    ];
}
