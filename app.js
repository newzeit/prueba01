/**
 * LogTrace AI - Frontend Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  // Inicializar Lucide Icons
  if (window.lucide) {
    lucide.createIcons();
  }

  // Elementos DOM
  const errorInput = document.getElementById('errorInput');
  const charCount = document.getElementById('charCount');
  const lineCount = document.getElementById('lineCount');
  const btnAnalyze = document.getElementById('btnAnalyze');
  const btnAnalyzeText = document.getElementById('btnAnalyzeText');
  const btnClearInput = document.getElementById('btnClearInput');
  const btnPasteClipboard = document.getElementById('btnPasteClipboard');
  const contextTagsContainer = document.getElementById('contextTagsContainer');
  const providerNotice = document.getElementById('providerNotice');
  const providerNoticeText = document.getElementById('providerNoticeText');
  const serverStatusBadge = document.getElementById('serverStatusBadge');
  const statusDot = document.getElementById('statusDot');
  const statusLabel = document.getElementById('statusLabel');

  // Paneles
  const emptyStateCard = document.getElementById('emptyStateCard');
  const loadingCard = document.getElementById('loadingCard');
  const loadingStatusText = document.getElementById('loadingStatusText');
  const resultsCard = document.getElementById('resultsCard');

  // Campos de Resultados
  const severityGlow = document.getElementById('severityGlow');
  const severityBadge = document.getElementById('severityBadge');
  const severityText = document.getElementById('severityText');
  const componentBadge = document.getElementById('componentBadge');
  const issueSummary = document.getElementById('issueSummary');
  const rootCauseText = document.getElementById('rootCauseText');
  const actionPlanSteps = document.getElementById('actionPlanSteps');
  const verificationExplanation = document.getElementById('verificationExplanation');
  const verificationCode = document.getElementById('verificationCode');
  const btnCopyVerification = document.getElementById('btnCopyVerification');
  const preventiveText = document.getElementById('preventiveText');
  const analysisSourceText = document.getElementById('analysisSourceText');
  const analysisTimestampText = document.getElementById('analysisTimestampText');
  const btnCopyReport = document.getElementById('btnCopyReport');

  // Ajustes Modal
  const settingsModal = document.getElementById('settingsModal');
  const btnOpenSettings = document.getElementById('btnOpenSettings');
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  const btnCancelSettings = document.getElementById('btnCancelSettings');
  const btnSaveSettings = document.getElementById('btnSaveSettings');
  const btnSaveKeyServer = document.getElementById('btnSaveKeyServer');
  const inputApiKey = document.getElementById('inputApiKey');
  const selectModel = document.getElementById('selectModel');
  const btnToggleKeyVisibility = document.getElementById('btnToggleKeyVisibility');

  // Historial Modal
  const historyModal = document.getElementById('historyModal');
  const btnHistory = document.getElementById('btnHistory');
  const btnCloseHistory = document.getElementById('btnCloseHistory');
  const btnClearHistory = document.getElementById('btnClearHistory');
  const historyList = document.getElementById('historyList');

  // Toast
  const toastNotification = document.getElementById('toastNotification');
  const toastMessage = document.getElementById('toastMessage');

  // Estado de la Aplicación
  let activeContext = 'General';
  let currentDiagnosticData = null;
  let loadingInterval = null;

  // Ejemplos predeterminados
  const quickExamples = {
    nginx: {
      context: 'Nginx / Servidor',
      text: `2026/10/21 14:15:22 [error] 1420#0: *1 connect() to unix:/run/php/php8.2-fpm.sock failed (2: No such file or directory) while connecting to upstream, client: 127.0.0.1, server: localhost, request: "GET / HTTP/1.1", upstream: "fastcgi://unix:/run/php/php8.2-fpm.sock:", host: "localhost"`
    },
    cors: {
      context: 'Node/JS',
      text: `Access to XMLHttpRequest at 'https://api.internal.dev/v1/auth/login' from origin 'http://localhost:3000' has been blocked by CORS policy: Response to preflight request doesn't pass access control check: No 'Access-Control-Allow-Origin' header is present on the requested resource.`
    },
    mysql: {
      context: 'Base de datos',
      text: `Error: connect ECONNREFUSED 127.0.0.1:3306\n    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1494:16)\n    --------------------\n    at Protocol._enqueue (/var/www/node_modules/mysql/lib/protocol/Protocol.js:144:48)\n    at Connection.query (/var/www/node_modules/mysql/lib/Connection.js:198:25)\n    code: 'ECONNREFUSED', errno: -111, syscall: 'connect', address: '127.0.0.1', port: 3306`
    }
  };

  // Cargar configuración guardada
  const savedApiKey = localStorage.getItem('logtrace_api_key') || '';
  const savedModel = localStorage.getItem('logtrace_model') || 'gpt-4o-mini';
  inputApiKey.value = savedApiKey;
  selectModel.value = savedModel;

  // Actualizar contadores del textarea
  function updateCounters() {
    const val = errorInput.value;
    charCount.textContent = `${val.length} caracteres`;
    const lines = val.length ? val.split(/\r\n|\r|\n/).length : 0;
    lineCount.textContent = `${lines} líneas`;
  }

  errorInput.addEventListener('input', updateCounters);

  // Selector de Contexto / Tags
  contextTagsContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.tag-btn');
    if (!btn) return;

    document.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeContext = btn.dataset.context;
  });

  function setContext(contextName) {
    activeContext = contextName;
    document.querySelectorAll('.tag-btn').forEach(b => {
      if (b.dataset.context.toLowerCase() === contextName.toLowerCase()) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });
  }

  // Botones de Ejemplos Rápidos
  document.querySelectorAll('.example-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.example;
      const example = quickExamples[type];
      if (example) {
        errorInput.value = example.text;
        setContext(example.context);
        updateCounters();
        // Ejecutar inmediatamente para máxima comodidad de prueba
        triggerDiagnosis();
      }
    });
  });

  // Limpiar y Pegar
  btnClearInput.addEventListener('click', () => {
    errorInput.value = '';
    updateCounters();
    errorInput.focus();
  });

  btnPasteClipboard.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        errorInput.value = text;
        updateCounters();
        showToast('Texto pegado desde portapapeles');
      }
    } catch (err) {
      showToast('Permiso de portapapeles denegado o no soportado', 'warn');
    }
  });

  // Botón Analizar
  btnAnalyze.addEventListener('click', () => {
    triggerDiagnosis();
  });

  // Atajo de teclado: Ctrl+Enter o Cmd+Enter en el textarea
  errorInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      triggerDiagnosis();
    }
  });

  // Función Principal de Diagnóstico
  async function triggerDiagnosis() {
    const errorText = errorInput.value.trim();
    if (!errorText) {
      showToast('Por favor pega o ingresa un fragmento de error', 'warn');
      errorInput.focus();
      return;
    }

    // Activar estado de carga
    setLoadingState(true);

    try {
      const apiKey = localStorage.getItem('logtrace_api_key') || '';
      const model = localStorage.getItem('logtrace_model') || 'gpt-4o-mini';

      const headers = {
        'Content-Type': 'application/json'
      };
      if (apiKey) {
        headers['X-OpenAI-Key'] = apiKey;
      }

      const response = await fetch('api.php', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          error_text: errorText,
          context: activeContext,
          model: model
        })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Ocurrió un error al procesar el diagnóstico');
      }

      currentDiagnosticData = result.data;
      renderDiagnostic(result);
      saveToHistory(errorText, activeContext, result);

      if (result.warning) {
        showToast(result.warning, 'warn');
      } else {
        showToast('Diagnóstico generado con éxito');
      }
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Error de conexión con el backend', 'error');
    } finally {
      setLoadingState(false);
    }
  }

  // Manejo visual del Loading State
  function setLoadingState(isLoading) {
    if (isLoading) {
      emptyStateCard.classList.add('hidden');
      resultsCard.classList.add('hidden');
      loadingCard.classList.remove('hidden');

      btnAnalyze.disabled = true;
      btnAnalyzeText.textContent = 'Analizando...';

      const messages = [
        'Identificando patrones de fallo e inspeccionando componentes...',
        'Evaluando severidad e impacto técnico del incidente...',
        'Generando causas raíz y comandos de verificación exactos...',
        'Compilando plan de acción paso a paso...'
      ];
      let msgIndex = 0;
      loadingInterval = setInterval(() => {
        msgIndex = (msgIndex + 1) % messages.length;
        loadingStatusText.textContent = messages[msgIndex];
      }, 1200);

    } else {
      clearInterval(loadingInterval);
      loadingCard.classList.add('hidden');
      btnAnalyze.disabled = false;
      btnAnalyzeText.textContent = 'Diagnosticar Error';
    }
  }

  // Renderizar Diagnóstico en el Panel de Resultados
  function renderDiagnostic(result) {
    const data = result.data;
    resultsCard.classList.remove('hidden');

    // Título y Componente
    issueSummary.textContent = data.summary || 'Diagnóstico de Incidente Técnico';
    componentBadge.textContent = data.affected_component || activeContext;

    // Severidad: Crítico / Advertencia / Info
    const sev = (data.severity || 'Advertencia').toLowerCase();
    severityText.textContent = data.severity || 'Advertencia';

    severityBadge.className = 'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 border';
    severityGlow.className = 'absolute top-0 left-0 right-0 h-1';

    if (sev.includes('crít') || sev.includes('crit')) {
      severityBadge.classList.add('severity-critical');
      severityGlow.classList.add('glow-critical');
      severityBadge.querySelector('i').setAttribute('data-lucide', 'alert-octagon');
    } else if (sev.includes('info')) {
      severityBadge.classList.add('severity-info');
      severityGlow.classList.add('glow-info');
      severityBadge.querySelector('i').setAttribute('data-lucide', 'info');
    } else {
      severityBadge.classList.add('severity-warning');
      severityGlow.classList.add('glow-warning');
      severityBadge.querySelector('i').setAttribute('data-lucide', 'alert-triangle');
    }

    // Causa Raíz
    rootCauseText.textContent = data.root_cause || 'Causa no determinada.';

    // Plan de acción paso a paso
    actionPlanSteps.innerHTML = '';
    const steps = Array.isArray(data.action_plan) ? data.action_plan : [];

    steps.forEach((step, index) => {
      const stepNumber = step.step || (index + 1);
      const stepDiv = document.createElement('div');
      stepDiv.className = 'code-action-step bg-slate-950/70 border border-slate-800 rounded-xl p-4 transition-all';

      let commandHtml = '';
      if (step.command) {
        commandHtml = `
          <div class="mt-3 relative group">
            <div class="bg-slate-900 border border-slate-800 rounded-lg p-3 font-mono text-xs text-slate-200 overflow-x-auto flex items-start justify-between gap-3">
              <pre class="whitespace-pre font-mono text-xs text-indigo-300"><code>${escapeHtml(step.command)}</code></pre>
              <button type="button" class="btn-copy-code shrink-0 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-sans flex items-center gap-1 transition-colors" data-code="${escapeAttribute(step.command)}">
                <i data-lucide="copy" class="w-3 h-3"></i>
                <span>Copiar</span>
              </button>
            </div>
          </div>
        `;
      }

      stepDiv.innerHTML = `
        <div class="flex items-start gap-3">
          <div class="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 font-mono font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
            ${stepNumber}
          </div>
          <div class="flex-1">
            <h4 class="text-xs font-bold text-slate-200 uppercase tracking-wide">${escapeHtml(step.title || `Paso ${stepNumber}`)}</h4>
            <p class="text-xs text-slate-400 mt-1 leading-relaxed">${escapeHtml(step.description || '')}</p>
            ${commandHtml}
          </div>
        </div>
      `;

      actionPlanSteps.appendChild(stepDiv);
    });

    // Comando de Verificación
    verificationCode.textContent = data.verification_command || 'echo "Listo"';
    verificationExplanation.textContent = data.verification_explanation || 'Ejecuta este comando en tu terminal para comprobar si el error fue resuelto con éxito:';

    // Consejo Preventivo
    preventiveText.textContent = data.preventive_tip || 'Mantén registros centralizados y alertas automatizadas para prevenir tiempos de inactividad.';

    // Metadatos de la fuente
    if (result.source === 'openai') {
      analysisSourceText.textContent = `Fuente: OpenAI API (${result.model})`;
    } else if (result.source === 'heuristic_fallback') {
      analysisSourceText.textContent = `Fuente: Motor de Contingencia (Fallback)`;
    } else {
      analysisSourceText.textContent = `Fuente: Motor Heurístico Integrado`;
    }

    analysisTimestampText.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Re-inicializar iconos Lucide
    if (window.lucide) {
      lucide.createIcons();
    }

    // Scroll suave hacia los resultados en móviles
    if (window.innerWidth < 1024) {
      resultsCard.scrollIntoView({ behavior: 'smooth' });
    }
  }

  // Delegación de eventos para copiar comandos del plan de acción
  actionPlanSteps.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-copy-code');
    if (!btn) return;
    const code = btn.getAttribute('data-code');
    if (code) {
      navigator.clipboard.writeText(code).then(() => {
        showToast('Comando copiado al portapapeles');
      });
    }
  });

  // Copiar comando de verificación
  btnCopyVerification.addEventListener('click', () => {
    const code = verificationCode.textContent.trim();
    if (code) {
      navigator.clipboard.writeText(code).then(() => {
        showToast('Comando de verificación copiado');
      });
    }
  });

  // Copiar reporte completo en Markdown
  btnCopyReport.addEventListener('click', () => {
    if (!currentDiagnosticData) return;
    const d = currentDiagnosticData;
    let md = `# Diagnóstico Técnico: ${d.summary}\n\n`;
    md += `**Severidad:** ${d.severity}\n`;
    md += `**Componente:** ${d.affected_component}\n\n`;
    md += `### Causa Raíz:\n${d.root_cause}\n\n`;
    md += `### Plan de Acción Paso a Paso:\n`;
    (d.action_plan || []).forEach((s, idx) => {
      md += `${idx + 1}. **${s.title}**: ${s.description}\n`;
      if (s.command) {
        md += `\`\`\`bash\n${s.command}\n\`\`\`\n`;
      }
    });
    md += `\n### Comando de Verificación:\n\`\`\`bash\n${d.verification_command}\n\`\`\`\n`;
    md += `_${d.verification_explanation}_\n\n`;
    if (d.preventive_tip) {
      md += `### Recomendación Preventiva:\n${d.preventive_tip}\n`;
    }

    navigator.clipboard.writeText(md).then(() => {
      showToast('Reporte Markdown copiado al portapapeles');
    });
  });

  // Historial Local
  function saveToHistory(errorText, context, result) {
    try {
      const history = JSON.parse(localStorage.getItem('logtrace_history') || '[]');
      const item = {
        id: Date.now(),
        date: new Date().toLocaleString(),
        summary: result.data.summary || 'Error diagnosticado',
        severity: result.data.severity || 'Advertencia',
        context: context,
        error_preview: errorText.slice(0, 100) + (errorText.length > 100 ? '...' : ''),
        error_full: errorText,
        result: result
      };
      // Conservar los últimos 15
      history.unshift(item);
      if (history.length > 15) history.pop();
      localStorage.setItem('logtrace_history', JSON.stringify(history));
    } catch (e) {
      console.warn('No se pudo guardar en historial:', e);
    }
  }

  function renderHistory() {
    try {
      const history = JSON.parse(localStorage.getItem('logtrace_history') || '[]');
      if (!history.length) {
        historyList.innerHTML = `
          <div class="text-center py-8 text-slate-400">
            <i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>
            <p>No hay diagnósticos previos registrados.</p>
          </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
      }

      historyList.innerHTML = history.map(item => `
        <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-indigo-500/50 cursor-pointer transition-all group" data-id="${item.id}">
          <div class="flex items-center justify-between text-xs mb-1">
            <span class="font-bold text-slate-200 group-hover:text-indigo-300 truncate mr-2">${escapeHtml(item.summary)}</span>
            <span class="text-[10px] text-slate-400 shrink-0">${escapeHtml(item.date)}</span>
          </div>
          <div class="text-[11px] text-slate-400 truncate font-mono">${escapeHtml(item.error_preview)}</div>
          <div class="mt-2 flex items-center justify-between">
            <span class="px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${item.severity === 'Crítico' ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400'}">${escapeHtml(item.severity)}</span>
            <span class="text-[10px] text-indigo-400 group-hover:underline">Cargar &rarr;</span>
          </div>
        </div>
      `).join('');

      historyList.querySelectorAll('[data-id]').forEach(el => {
        el.addEventListener('click', () => {
          const id = Number(el.dataset.id);
          const found = history.find(h => h.id === id);
          if (found) {
            errorInput.value = found.error_full;
            setContext(found.context);
            updateCounters();
            currentDiagnosticData = found.result.data;
            renderDiagnostic(found.result);
            historyModal.classList.add('hidden');
            showToast('Diagnóstico cargado desde historial');
          }
        });
      });

      if (window.lucide) lucide.createIcons();
    } catch (e) {
      historyList.innerHTML = '<p class="text-rose-400">Error cargando historial.</p>';
    }
  }

  btnHistory.addEventListener('click', () => {
    renderHistory();
    historyModal.classList.remove('hidden');
  });

  btnCloseHistory.addEventListener('click', () => historyModal.classList.add('hidden'));

  btnClearHistory.addEventListener('click', () => {
    if (confirm('¿Deseas vaciar todo el historial de diagnósticos?')) {
      localStorage.removeItem('logtrace_history');
      renderHistory();
      showToast('Historial vaciado');
    }
  });

  // Ajustes Modal
  btnOpenSettings.addEventListener('click', () => settingsModal.classList.remove('hidden'));
  btnCloseSettings.addEventListener('click', () => settingsModal.classList.add('hidden'));
  btnCancelSettings.addEventListener('click', () => settingsModal.classList.add('hidden'));

  btnToggleKeyVisibility.addEventListener('click', () => {
    inputApiKey.type = inputApiKey.type === 'password' ? 'text' : 'password';
  });

  btnSaveSettings.addEventListener('click', () => {
    const key = inputApiKey.value.trim();
    const model = selectModel.value;
    localStorage.setItem('logtrace_api_key', key);
    localStorage.setItem('logtrace_model', model);
    settingsModal.classList.add('hidden');
    showToast('Preferencias guardadas');
    checkServerStatus();
  });

  btnSaveKeyServer.addEventListener('click', async () => {
    const key = inputApiKey.value.trim();
    const model = selectModel.value;
    try {
      btnSaveKeyServer.disabled = true;
      btnSaveKeyServer.textContent = 'Guardando en servidor...';
      const res = await fetch('api.php?action=save_key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: key, model: model })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar en el servidor');
      showToast('Guardado en .env del servidor');
      checkServerStatus();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      btnSaveKeyServer.disabled = false;
      btnSaveKeyServer.textContent = 'Guardar en .env del servidor';
    }
  });

  // Comprobar estado del Backend
  async function checkServerStatus() {
    try {
      const res = await fetch('api.php?action=status');
      const data = await res.json();
      const localKey = localStorage.getItem('logtrace_api_key');

      if (data.status === 'online') {
        const hasOpenAi = data.openai_configured || !!localKey;
        statusDot.className = hasOpenAi ? 'w-2 h-2 rounded-full bg-emerald-400' : 'w-2 h-2 rounded-full bg-amber-400';
        statusLabel.textContent = hasOpenAi ? `OpenAI Listo (${data.default_model})` : 'Modo Heurístico Activo';
        
        providerNoticeText.textContent = hasOpenAi 
          ? `Listo con OpenAI (${localStorage.getItem('logtrace_model') || data.default_model}).`
          : `Modo local activo. Añade tu API Key para análisis de modelos avanzados.`;
      }
    } catch (e) {
      statusDot.className = 'w-2 h-2 rounded-full bg-rose-500';
      statusLabel.textContent = 'API sin conexión';
    }
  }

  // Toast Helper
  let toastTimeout = null;
  function showToast(message, type = 'info') {
    clearTimeout(toastTimeout);
    toastMessage.textContent = message;

    toastNotification.classList.remove('opacity-0', 'translate-y-12');
    toastNotification.classList.add('opacity-100', 'translate-y-0');

    toastTimeout = setTimeout(() => {
      toastNotification.classList.remove('opacity-100', 'translate-y-0');
      toastNotification.classList.add('opacity-0', 'translate-y-12');
    }, 2800);
  }

  // Escape HTML Helpers
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeAttribute(str) {
    if (!str) return '';
    return str.replace(/"/g, '&quot;');
  }

  // Inicializar
  updateCounters();
  checkServerStatus();
});
