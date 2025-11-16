/**
 * Sistema de Seguridad y Logging para ModeX Pro
 * Protección contra ataques comunes y registro de eventos en Discord
 *
 * IMPORTANTE:
 * - Nada que esté en JavaScript del lado cliente puede considerarse 100% secreto.
 * - El webhook de Discord, claves u otros secretos deben ir SIEMPRE en el backend.
 * - Este archivo añade capas extra de protección, detección y ofuscación,
 *   pero un atacante avanzado aún podría obtener la información si solo existe aquí.
 *
 * Con la nueva API backend:
 * - El frontend ya no llama directamente al webhook de Discord.
 * - Todos los logs van a `/api/security-log` en tu servidor, y desde ahí al webhook.
 */

// URL base de la API (en desarrollo apunta a localhost, en producción puedes
// exponerla como window.MODEX_API_BASE antes de cargar los scripts).
// Usamos `var` para evitar errores de redeclaración cuando otros archivos
// (como payment-system.js) definan MODEX_API_BASE en el mismo contexto global.
var MODEX_API_BASE =
    typeof window !== 'undefined' && window.MODEX_API_BASE
        ? window.MODEX_API_BASE
        : 'http://localhost:3000';

// Decodificador básico usado como bloque de construcción
function decodeSegments(segments) {
    return decodeURIComponent(segments.join(''));
}

// Capa extra de “ofuscación lógica” (no es criptografía real)
// Usa una doble operación XOR que en la práctica deja el texto igual,
// pero complica la lectura directa del flujo de decodificación.
function layeredDecode(segments, key) {
    const base = decodeSegments(segments);
    if (!key || typeof key !== 'string') {
        return base;
    }

    const xor = (str, secret) => {
        const secretLen = secret.length;
        return Array.from(str)
            .map((ch, idx) => {
                const code = ch.charCodeAt(0) ^ secret.charCodeAt(idx % secretLen);
                return String.fromCharCode(code);
            })
            .join('');
    };

    // Primera pasada XOR
    const once = xor(base, key);
    // Segunda pasada XOR (se revierte la primera)
    const twice = xor(once, key);
    return twice;
}

class SecurityLogger {
    constructor(webhookUrl) {
        this.webhookUrl = webhookUrl;
        this.rateLimitMap = new Map();
        this.maxRequestsPerMinute = 30;
        this.blockedIPs = new Set();
        this.domDefaceFlagKey = 'modex_dom_deface_protection_triggered';
        this.sessionId = this.generateSessionId();
        this.init();
    }

    init() {
        // Generar token CSRF único para la sesión
        this.csrfToken = this.generateCSRFToken();
        sessionStorage.setItem('csrf_token', this.csrfToken);
        
        // Obtener y actualizar contador de visitas
        let visitCount = parseInt(localStorage.getItem('modex_visit_count') || '0');
        visitCount++;
        localStorage.setItem('modex_visit_count', visitCount.toString());
        localStorage.setItem('modex_last_visit', new Date().toISOString());
        
        // Registrar carga de página con contador
        this.logEvent('page_load', {
            page: window.location.pathname,
            referrer: document.referrer,
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
            visitCount: visitCount,
            lastVisit: localStorage.getItem('modex_last_visit')
        });

        // Proteger formularios automáticamente
        this.protectForms();
        
        // Proteger contra ataques comunes
        this.setupSecurityHeaders();
        this.setupXSSProtection();
        this.setupRateLimiting();
        this.setupFrameProtection();
        this.setupDomIntegrityProtection();
        this.setupAntiDebugging();
        
        // Interceptar errores JavaScript
        window.addEventListener('error', (e) => {
            this.logEvent('javascript_error', {
                message: e.message,
                filename: e.filename,
                lineno: e.lineno,
                colno: e.colno,
                stack: e.error?.stack
            }, 'error');
        });

        // Interceptar promesas rechazadas
        window.addEventListener('unhandledrejection', (e) => {
            this.logEvent('unhandled_promise_rejection', {
                reason: e.reason?.toString(),
                stack: e.reason?.stack
            }, 'error');
        });
    }

    /**
     * Genera un ID de sesión único
     */
    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Genera un token CSRF único
     */
    generateCSRFToken() {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Obtiene información del cliente
     */
    getClientInfo() {
        return {
            ip: this.getClientIP(),
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            screenResolution: `${screen.width}x${screen.height}`,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            sessionId: this.sessionId,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Intenta obtener la IP del cliente (limitado en cliente)
     */
    getClientIP() {
        // Nota: En el cliente no podemos obtener la IP real directamente
        // Esto sería manejado en el servidor
        return 'client_side';
    }

    /**
     * Sanitiza entrada de usuario para prevenir XSS
     */
    sanitizeInput(input) {
        if (typeof input !== 'string') return input;

        const div = document.createElement('div');
        div.textContent = input;
        return div.innerHTML;
    }

    /**
     * Valida y sanitiza datos de formulario
     */
    validateFormData(formData) {
        const sanitized = {};
        const suspiciousPatterns = [
            /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
            /javascript:/gi,
            /on\w+\s*=/gi,
            /<iframe/gi,
            /<object/gi,
            /<embed/gi,
            /eval\(/gi,
            /expression\(/gi
        ];

        for (const [key, value] of formData.entries()) {
            if (typeof value === 'string') {
                // Detectar patrones sospechosos
                const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(value));
                
                if (isSuspicious) {
                    this.logEvent('xss_attempt', {
                        field: key,
                        value: value.substring(0, 100), // Limitar longitud
                        page: window.location.pathname
                    }, 'warning');
                    throw new Error('Entrada no válida detectada');
                }
                
                sanitized[key] = this.sanitizeInput(value);
            } else {
                sanitized[key] = value;
            }
        }

        return sanitized;
    }

    /**
     * Verifica rate limiting
     */
    checkRateLimit(identifier) {
        const now = Date.now();
        const key = identifier || 'default';
        
        if (!this.rateLimitMap.has(key)) {
            this.rateLimitMap.set(key, []);
        }

        const requests = this.rateLimitMap.get(key);
        
        // Limpiar solicitudes antiguas (más de 1 minuto)
        const recentRequests = requests.filter(time => now - time < 60000);
        
        if (recentRequests.length >= this.maxRequestsPerMinute) {
            this.logEvent('rate_limit_exceeded', {
                identifier: key,
                requests: recentRequests.length,
                page: window.location.pathname
            }, 'warning');
            return false;
        }

        recentRequests.push(now);
        this.rateLimitMap.set(key, recentRequests);
        return true;
    }

    /**
     * Protege todos los formularios de la página
     */
    protectForms() {
        const forms = document.querySelectorAll('form');
        
        forms.forEach(form => {
            // Agregar token CSRF oculto
            const csrfInput = document.createElement('input');
            csrfInput.type = 'hidden';
            csrfInput.name = '_csrf_token';
            csrfInput.value = this.csrfToken;
            form.appendChild(csrfInput);

            // Interceptar envío de formulario
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                
                // Verificar rate limiting
                if (!this.checkRateLimit('form_submit')) {
                    alert('Demasiadas solicitudes. Por favor, espera un momento.');
                    return false;
                }

                // Validar token CSRF
                const formData = new FormData(form);
                const submittedToken = formData.get('_csrf_token');
                
                if (submittedToken !== this.csrfToken) {
                    this.logEvent('csrf_attack', {
                        form: form.id || 'unknown',
                        page: window.location.pathname
                    }, 'error');
                    alert('Error de seguridad. Por favor, recarga la página.');
                    return false;
                }

                try {
                    // Validar y sanitizar datos
                    const sanitizedData = this.validateFormData(formData);
                    
                    // Registrar envío de formulario
                    this.logEvent('form_submit', {
                        formId: form.id || 'unknown',
                        formAction: form.action || 'none',
                        fields: Object.keys(sanitizedData),
                        page: window.location.pathname
                    });

                    // Permitir envío normal (o procesar con fetch)
                    // form.submit(); // Descomentar si quieres permitir envío normal
                    
                } catch (error) {
                    this.logEvent('form_validation_error', {
                        error: error.message,
                        formId: form.id || 'unknown'
                    }, 'error');
                    alert('Error al validar el formulario. Por favor, verifica tus datos.');
                    return false;
                }
            });
        });
    }

    /**
     * Configura protección XSS
     */
    setupXSSProtection() {
        // Content Security Policy reforzada
        // NOTA: si tu aplicación depende de scripts inline o de más dominios,
        // deberás ajustar esta política cuidadosamente para no romper funcionalidad.
        const metaCSP = document.createElement('meta');
        metaCSP.httpEquiv = 'Content-Security-Policy';
        metaCSP.content = ""
            + "default-src 'self'; "
            + "script-src 'self' https://cdn.jsdelivr.net https://cdn.tailwindcss.com https://cdnjs.cloudflare.com; "
            + "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://fonts.googleapis.com; "
            + "font-src 'self' https://fonts.gstatic.com; "
            + "img-src 'self' data: https:; "
            + "connect-src 'self' https://discord.com; "
            + "object-src 'none'; "
            + "base-uri 'self'; "
            + "frame-ancestors 'none'; "
            + "upgrade-insecure-requests;";
        document.head.appendChild(metaCSP);
    }

    /**
     * Configura headers de seguridad básicos
     */
    setupSecurityHeaders() {
        // Estos headers normalmente se configuran en el servidor
        // Aquí solo los documentamos para referencia
        console.log('[Security] Headers de seguridad recomendados:');
        console.log('X-Content-Type-Options: nosniff');
        console.log('X-Frame-Options: DENY');
        console.log('X-XSS-Protection: 1; mode=block');
        console.log('Referrer-Policy: strict-origin-when-cross-origin');
    }

    /**
     * Evita que el sitio se cargue dentro de iframes de otros dominios (clickjacking)
     * La protección real debe ser con cabeceras en el servidor, esto es una capa extra.
     */
    setupFrameProtection() {
        try {
            if (window.top !== window.self) {
                this.logEvent('frame_embedding_detected', {
                    page: window.location.pathname,
                    referrer: document.referrer || 'none'
                }, 'warning');
                // Intentar forzar salida del iframe
                window.top.location = window.location.href;
            }
        } catch (e) {
            this.logEvent('frame_protection_error', {
                error: e.message
            }, 'error');
        }
    }

    /**
     * Protección básica contra defacement / manipulación sospechosa del DOM
     * - Detecta cambios bruscos en el DOM (scripts/iframes nuevos, textos típicos de deface, etc.)
     * - Si se detecta algo raro, registra el evento y opcionalmente recarga la página.
     */
    setupDomIntegrityProtection() {
        if (!window.MutationObserver) {
            return;
        }

        // Evitar bucles de recarga infinitos
        const alreadyTriggered = sessionStorage.getItem(this.domDefaceFlagKey) === '1';

        const initialTitle = document.title;
        const initialBodyLength = document.body ? document.body.innerHTML.length : 0;

        const suspiciousWords = [
            'hacked by',
            'h4cked',
            'defaced',
            'pwned',
            'owned by'
        ];

        const observer = new MutationObserver((mutations) => {
            let suspicious = false;
            let reason = [];

            try {
                const currentTitle = document.title;
                const currentBodyLength = document.body ? document.body.innerHTML.length : 0;

                if (Math.abs(currentBodyLength - initialBodyLength) > initialBodyLength * 0.5) {
                    suspicious = true;
                    reason.push('Cambio brusco en tamaño del DOM');
                }

                if (currentTitle && currentTitle !== initialTitle &&
                    /hacked|h4cked|defaced|pwned|owned/i.test(currentTitle)) {
                    suspicious = true;
                    reason.push('Título de página sospechoso');
                }

                if (document.body) {
                    const text = document.body.innerText.toLowerCase();
                    if (suspiciousWords.some(w => text.includes(w))) {
                        suspicious = true;
                        reason.push('Texto típico de deface detectado');
                    }
                }

                for (const mutation of mutations) {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === 1) {
                                const tag = node.tagName;
                                if (tag === 'SCRIPT' || tag === 'IFRAME') {
                                    suspicious = true;
                                    reason.push(`Nodo sospechoso añadido: ${tag}`);
                                }
                            }
                        });
                    }

                    if (mutation.type === 'attributes' && mutation.target) {
                        const target = mutation.target;
                        if (target.tagName === 'BODY' || target.tagName === 'HTML') {
                            // Cambios en atributos globales (por ejemplo, class) podrían usarse para
                            // inyectar estilos de deface, lo registramos como sospechoso leve.
                            reason.push('Atributo global modificado');
                        }
                    }
                }
            } catch (e) {
                // Si algo falla, mejor registrar un warning que silenciarlo
                this.logEvent('dom_integrity_error', {
                    error: e.message
                }, 'warning');
            }

            if (suspicious && !alreadyTriggered) {
                sessionStorage.setItem(this.domDefaceFlagKey, '1');
                this.logEvent('dom_tamper_detected', {
                    reasons: reason,
                    page: window.location.pathname
                }, 'warning');

                // Capa extrema: recargar la página para intentar restaurar estado limpio
                // (no evitará un compromiso de servidor, pero puede ayudar ante XSS/inyectores simples)
                setTimeout(() => {
                    window.location.reload();
                }, 1500);
            }
        });

        observer.observe(document.documentElement || document.body, {
            childList: true,
            subtree: true,
            attributes: true
        });

        this.domIntegrityObserver = observer;
    }

    /**
     * Medidas anti-debugging (obfuscación y estorbo, no son seguridad real)
     * - Intenta detectar DevTools abiertos mediante tiempos anómalos
     * - Bloquea algunas combinaciones de teclas comunes (F12, Ctrl+Shift+I/J/C)
     * - Bloquea el menú contextual (clic derecho)
     */
    setupAntiDebugging() {
        // Bloqueo de atajos típicos
        window.addEventListener('keydown', (e) => {
            const key = e.key || e.keyCode;
            const k = String(key).toUpperCase();

            // F12
            if (k === 'F12' || key === 123) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }

            // Ctrl+Shift+I / J / C
            if (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(k)) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }

            // Ctrl+U (ver código fuente)
            if (e.ctrlKey && !e.shiftKey && k === 'U') {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        }, true);

        // Bloquear menú contextual
        window.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        }, true);

        // Detección aproximada de DevTools por tiempos anómalos
        const detectDevTools = () => {
            const start = Date.now();
            // Este debugger es intencional: si DevTools está abierto y en pausa,
            // el tiempo de ejecución de esta función se dispara.
            // eslint-disable-next-line no-debugger
            debugger;
            const diff = Date.now() - start;

            if (diff > 200) {
                this.logEvent('devtools_detected', {
                    delayMs: diff
                }, 'warning');
            }

            setTimeout(detectDevTools, 4000);
        };

        setTimeout(detectDevTools, 4000);
    }

    /**
     * Configura rate limiting
     */
    setupRateLimiting() {
        // Rate limiting para clics en botones importantes
        const importantButtons = document.querySelectorAll('a[href*="tienda"], a[href*="pagos"], button[type="submit"]');
        
        importantButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                if (!this.checkRateLimit('button_click')) {
                    e.preventDefault();
                    alert('Demasiadas acciones. Por favor, espera un momento.');
                    return false;
                }
            });
        });
    }

    /**
     * Envía log a Discord webhook
     */
    async sendToDiscord(eventType, data, level = 'info') {
        const colors = {
            info: 0x3498db,      // Azul
            warning: 0xf39c12,   // Naranja
            error: 0xe74c3c,     // Rojo
            success: 0x2ecc71    // Verde
        };

        const emojis = {
            info: 'ℹ️',
            warning: '⚠️',
            error: '🚨',
            success: '✅'
        };

        const clientInfo = this.getClientInfo();
        
        // Preparar descripción con contador de visitas si es page_load
        let description = `**Nivel:** ${level}\n**Página:** ${data.page || window.location.pathname}`;
        if (eventType === 'page_load' && data.visitCount) {
            description += `\n\n🔢 **Visita #${data.visitCount}**`;
            if (data.lastVisit) {
                const lastVisitDate = new Date(data.lastVisit);
                const now = new Date();
                const diffMs = now - lastVisitDate;
                const diffMins = Math.floor(diffMs / 60000);
                const diffHours = Math.floor(diffMins / 60);
                const diffDays = Math.floor(diffHours / 24);
                
                let timeAgo = '';
                if (diffDays > 0) {
                    timeAgo = `hace ${diffDays} día${diffDays > 1 ? 's' : ''}`;
                } else if (diffHours > 0) {
                    timeAgo = `hace ${diffHours} hora${diffHours > 1 ? 's' : ''}`;
                } else if (diffMins > 0) {
                    timeAgo = `hace ${diffMins} minuto${diffMins > 1 ? 's' : ''}`;
                } else {
                    timeAgo = 'hace unos segundos';
                }
                
                if (data.visitCount > 1) {
                    description += `\n⏰ Última visita: ${timeAgo}`;
                }
            }
        }
        
        const embed = {
            title: `${emojis[level]} ${eventType.toUpperCase()}`,
            description: description,
            color: colors[level] || colors.info,
            fields: [],
            timestamp: new Date().toISOString(),
            footer: {
                text: `ModeX Security System | Session: ${this.sessionId.substring(0, 8)}`
            }
        };

        // Agregar campos de datos
        Object.keys(data).forEach(key => {
            if (key !== 'page') {
                let value = data[key];
                
                // Limitar longitud de valores largos
                if (typeof value === 'string' && value.length > 1024) {
                    value = value.substring(0, 1020) + '...';
                } else if (typeof value === 'object') {
                    value = JSON.stringify(value).substring(0, 1024);
                }
                
                embed.fields.push({
                    name: key.charAt(0).toUpperCase() + key.slice(1),
                    value: String(value).substring(0, 1024),
                    inline: true
                });
            }
        });

        // Agregar información del cliente
        embed.fields.push({
            name: '🌐 Información del Cliente',
            value: `**User Agent:** ${clientInfo.userAgent.substring(0, 100)}\n**Plataforma:** ${clientInfo.platform}\n**Idioma:** ${clientInfo.language}\n**Resolución:** ${clientInfo.screenResolution}\n**Zona Horaria:** ${clientInfo.timezone}`,
            inline: false
        });

        const payload = {
            embeds: [embed],
            username: 'ModeX Security Logger'
        };

        try {
            // Enviar SIEMPRE al backend, nunca directo al webhook de Discord
            const response = await fetch(`${MODEX_API_BASE}/api/security-log`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                console.error('[Security] Error al enviar log a Discord:', response.status);
            }
        } catch (error) {
            console.error('[Security] Error al conectar con Discord webhook:', error);
        }
    }

    /**
     * Registra un evento
     */
    async logEvent(eventType, data = {}, level = 'info') {
        const logData = {
            ...data,
            page: window.location.pathname,
            url: window.location.href,
            timestamp: new Date().toISOString()
        };

        // Log en consola para desarrollo
        console.log(`[Security Logger] ${level.toUpperCase()}:`, eventType, logData);

        // Enviar a Discord (solo eventos importantes o errores)
        if (level === 'error' || level === 'warning' || 
            ['page_load', 'form_submit', 'xss_attempt', 'csrf_attack', 'rate_limit_exceeded'].includes(eventType)) {
            await this.sendToDiscord(eventType, logData, level);
        }
    }

    /**
     * Registra un intento de compra
     */
    logPurchaseAttempt(product, price, paymentMethod) {
        this.logEvent('purchase_attempt', {
            product: product,
            price: price,
            paymentMethod: paymentMethod
        }, 'info');
    }

    /**
     * Registra un error de seguridad
     */
    logSecurityError(errorType, details) {
        this.logEvent('security_error', {
            errorType: errorType,
            details: details
        }, 'error');
    }
}

// Inicializar el sistema de seguridad cuando el DOM esté listo
let securityLogger;

document.addEventListener('DOMContentLoaded', () => {
    // URL del webhook de Discord (ofuscado para dificultar extracción).
    // RECOMENDACIÓN: mover el webhook al backend y exponer solo un endpoint propio.
    // Esta capa es solo para subir la dificultad de lectura directa del código.
    const webhookKey = 'modex_security_' + (new Date().getFullYear());
    const SECURITY_WEBHOOK_URL = layeredDecode([
        '%68%74%74%70%73%3a%2f%2f%64%69%73%63%6f%72%64%2e%63%6f%6d%2f',
        '%61%70%69%2f%77%65%62%68%6f%6f%6b%73%2f%31%34%31%37%39%37%37%37%34%32%36%36%31%35%31%37%34%36%33%2f',
        '%33%56%53%48%64%32%78%42%35%76%77%4a%47%71%76%51%41%62%31%47%50%73%73%73%73%6f%79%4d%42%50%56%4f%7a%41%54%73%69%52%55%37%66%6d%5f%63%44%39%34%73%4e%52%72%58%63%31%59%56%41%38%33%47%45%66%57%35%50%44%6b%30%32'
    ], webhookKey);
    
    // Inicializar sistema de seguridad
    securityLogger = new SecurityLogger(SECURITY_WEBHOOK_URL);
    
    // Hacer disponible globalmente para uso manual
    window.securityLogger = securityLogger;
    
    console.log('[Security] Sistema de seguridad y logging inicializado');
});

// Exportar para uso en módulos (si se usa ES6 modules)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SecurityLogger;
}

