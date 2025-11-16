/**
 * Sistema de Compras Unificado - ModeX Pro
 * Sistema de pago manual con subida de comprobantes
 *
 * Con backend:
 * - El comprobante ya NO se envía directo al webhook de Discord.
 * - Ahora se manda a `/api/payment/receipt` en tu servidor.
 */

// URL base de la API (en desarrollo: http://localhost:3000)
// Usamos `var` para evitar errores de redeclaración cuando otros archivos
// también definan MODEX_API_BASE en el entorno global del navegador.
var MODEX_API_BASE =
    typeof window !== 'undefined' && window.MODEX_API_BASE
        ? window.MODEX_API_BASE
        : 'http://localhost:3000';

// Utilidades de ofuscación básica
function decodeSegments(segments) {
    return decodeURIComponent(segments.join(''));
}

// Variables globales
let currentProduct = null;
let selectedDuration = null;
let selectedDurationLabel = null;
let selectedMethod = null;
let selectedReceiptFile = null;

// Configuración de pagos (ofuscado para dificultar su extracción directa)
const PAYMENT_CONFIG = {
    paypalEmail: decodeSegments(['%37%37%37%6c%65%6f%67%40%67%6d%61%69%6c%2e%63%6f%6d']),
    binanceId: 'PENDIENTE' // Reemplaza esto con tu ID real cuando lo tengas
};

// Precios de TODOS los productos
const productPrices = {
    // Sensibilidades iPhone (pago único)
    'Sensibilidad VIP': { '1': 10 },
    'Modificación': { '1': 20 },
    'Atajos': { '1': 15 },
    'Sensibilidad + Atajos': { '1': 15 },
    'Sensibilidad Media': { '1': 10 },
    'Sensibilidad Baja': { '1': 5 },
    
    // Sensibilidades Android (pago único)
    'Talkback VIP': { '1': 25 },
    'Sensibilidad Básica': { '1': 10 },
    'Sensibilidad Avanzada + Talback Vip': { '1': 20 },
    
    // Hacks iPhone
    'Fluorite 7 días': { '7': 24.99 },
    'Fluorite 31 días': { '31': 45.99 },
    
    // Hacks Android
    'Drip 7 días': { '7': 14.99 },
    'Drip 31 días': { '31': 22.99 },
    
    // Bot de Discord / Revendedores
    'BOT DE DISCORD': { '1': 200 },
    'BOT DE DISCORD 1 Mes': { '1': 200 },
    'Bot de Discord 3 Mes': { '3': 500 },
    'Panel Premium': { '3': 500 },
    'Panel iPhone': { '1': 200 },
    'Panel PC': { '1': 200 },
    'Panel Android': { '1': 200 }
};

// Productos con pago único (no muestran selección de duración)
const oneTimeProducts = [
    'Sensibilidad VIP', 'Modificación', 'Atajos', 'Sensibilidad + Atajos',
    'Sensibilidad Media', 'Sensibilidad Baja', 'Talkback VIP',
    'Sensibilidad Básica', 'Sensibilidad Avanzada + Talback Vip',
    'BOT DE DISCORD', 'BOT DE DISCORD 1 Mes', 'Panel iPhone', 'Panel PC', 'Panel Android'
];

// Variable para evitar múltiples inicializaciones
let paymentSystemInitialized = false;

// Función para inicializar el sistema de pagos
function initializePaymentSystem() {
    // Configurar subida de imagen (solo una vez)
    const receiptUpload = document.getElementById('receiptUpload');
    if (receiptUpload && !receiptUpload.hasAttribute('data-listener-added')) {
        receiptUpload.addEventListener('change', handleImageUpload);
        receiptUpload.setAttribute('data-listener-added', 'true');
    }
    
    // Los event listeners de clic se manejan con delegación de eventos global
    // No necesitamos agregarlos aquí para evitar duplicados
    if (!paymentSystemInitialized) {
        console.log('✅ Sistema de pagos inicializado');
        paymentSystemInitialized = true;
    }
}

// Mostrar modal de precios
function showPrices(productName) {
    currentProduct = productName;
    const modalTitle = document.getElementById('modalTitle');
    const priceModal = document.getElementById('priceModal');
    const price7days = document.getElementById('price7days');
    const price31days = document.getElementById('price31days');
    
    selectedDuration = null;
    selectedDurationLabel = null;
    selectedMethod = null;
    selectedReceiptFile = null;
    
    if (!modalTitle || !priceModal) return;

    // Actualizar precios según el producto
    const prices = productPrices[productName] || { '1': 0 };
    
    // Ocultar todos los selectores de duración primero
    document.querySelectorAll('.duration-selector').forEach(el => {
        el.classList.remove('selected', 'bg-yellow-500/20', 'border-yellow-500');
        const label = el.querySelector('h4');
        if (label && el.dataset.originalLabel) {
            label.textContent = el.dataset.originalLabel;
            delete el.dataset.originalLabel;
        }
        el.classList.add('hidden');
    });
    
    // Configurar según el tipo de producto
    if (oneTimeProducts.includes(productName)) {
        // Productos de pago único
        const price = prices['1'] || 0;
        selectedDuration = '1';
        selectedDurationLabel = 'Pago único';
        
        if (price7days) {
            price7days.textContent = `$${price}`;
            const parent = price7days.closest('.duration-selector');
            if (parent) {
                const h4 = parent.querySelector('h4');
                if (h4) {
                    if (!parent.dataset.originalLabel) {
                        parent.dataset.originalLabel = h4.textContent;
                    }
                    h4.textContent = 'Pago único';
                }
            }
            const selector = document.querySelector('.duration-selector[data-days="7"]');
            if (selector) selector.classList.remove('hidden');
        }
        const selector31 = document.querySelector('.duration-selector[data-days="31"]');
        if (selector31) selector31.classList.add('hidden');
        
        // Seleccionar automáticamente la opción por defecto
        setTimeout(() => {
            selectDuration('7');
        }, 100);
    } else if (productName.includes('Fluorite') || productName.includes('Drip')) {
        // Hacks con opción de 7 o 31 días
        const days = productName.includes('31') ? '31' : '7';
        const price = prices[days] || 0;
        
        if (days === '7' && price7days) {
            price7days.textContent = `$${price}`;
            const selector = document.querySelector('.duration-selector[data-days="7"]');
            if (selector) selector.classList.remove('hidden');
        } else if (days === '31' && price31days) {
            price31days.textContent = `$${price}`;
            const selector = document.querySelector('.duration-selector[data-days="31"]');
            if (selector) selector.classList.remove('hidden');
        }
        
        setTimeout(() => {
            selectDuration(days);
        }, 100);
    } else if (productName.includes('BOT DE DISCORD') || productName.includes('Panel')) {
        // Bot de Discord o Paneles
        const price = prices['1'] || prices['3'] || 0;
        if (price7days) {
            price7days.textContent = `$${price}`;
            const selector = document.querySelector('.duration-selector[data-days="7"]');
            if (selector) selector.classList.remove('hidden');
        }
        
        setTimeout(() => {
            selectDuration('7');
        }, 100);
    }

    if (modalTitle) modalTitle.textContent = productName;
    if (priceModal) {
        priceModal.classList.remove('hidden');
        priceModal.classList.add('flex');
        
        // Reinicializar event listeners cuando se abre el modal
        setTimeout(() => {
            initializePaymentSystem();
        }, 100);
    }
}

// Seleccionar duración
function selectDuration(days) {
    const isOneTime = oneTimeProducts.includes(currentProduct);
    const targetDays = isOneTime ? '7' : days;
    
    selectedDuration = isOneTime ? '1' : days;
    selectedDurationLabel = isOneTime ? 'Pago único' : `${days} días`;
    
    // Remover selección previa
    document.querySelectorAll('.duration-selector').forEach(el => {
        el.classList.remove('selected', 'bg-yellow-500/20', 'border-yellow-500');
    });
    
    // Resaltar selección actual
    const selectedEl = document.querySelector(`.duration-selector[data-days="${targetDays}"]`);
    if (selectedEl) {
        selectedEl.classList.add('selected', 'bg-yellow-500/20', 'border-yellow-500');
        
        if (isOneTime) {
            const label = selectedEl.querySelector('h4');
            if (label) {
                if (!selectedEl.dataset.originalLabel) {
                    selectedEl.dataset.originalLabel = label.textContent;
                }
                label.textContent = 'Pago único';
            }
        }
    }
    
    // Mostrar selección de método de pago
    setTimeout(() => {
        const durationSelection = document.getElementById('durationSelection');
        const paymentMethodSelection = document.getElementById('paymentMethodSelection');
        const backToDuration = document.getElementById('backToDuration');
        
        if (durationSelection) durationSelection.classList.add('hidden');
        if (paymentMethodSelection) paymentMethodSelection.classList.remove('hidden');
        if (backToDuration) backToDuration.style.display = 'flex';
    }, 300);
}

// Mostrar información de pago
function showPaymentInfo() {
    console.log('🔵 showPaymentInfo llamado:', { currentProduct, selectedDuration, selectedMethod });
    
    if (!currentProduct || !selectedDuration || !selectedMethod) {
        console.error('❌ Faltan datos:', { currentProduct, selectedDuration, selectedMethod });
        alert('Error: Faltan datos. Por favor, intenta nuevamente.');
        return;
    }
    
    const price = productPrices[currentProduct]?.[selectedDuration] || 0;
    console.log('💰 Precio calculado:', price);
    
    const paymentMethodSelection = document.getElementById('paymentMethodSelection');
    const paymentInfoSection = document.getElementById('paymentInfoSection');
    
    if (!paymentMethodSelection) {
        console.error('❌ paymentMethodSelection no encontrado');
        return;
    }
    
    if (!paymentInfoSection) {
        console.error('❌ paymentInfoSection no encontrado');
        return;
    }
    
    // Ocultar selección de método y mostrar información de pago
    paymentMethodSelection.classList.add('hidden');
    paymentInfoSection.classList.remove('hidden');
    
    // Mostrar información según método
    if (selectedMethod === 'paypal') {
        const paypalInfo = document.getElementById('paypalInfo');
        const binanceInfo = document.getElementById('binanceInfo');
        const paypalAmount = document.getElementById('paypalAmount');
        const paypalEmailDisplay = document.getElementById('paypalEmailDisplay');
        
        if (!paypalInfo || !paypalAmount || !paypalEmailDisplay) {
            console.error('❌ Elementos de PayPal no encontrados');
            return;
        }
        
        paypalInfo.classList.remove('hidden');
        if (binanceInfo) binanceInfo.classList.add('hidden');
        paypalAmount.textContent = `$${price.toFixed(2)}`;
        paypalEmailDisplay.textContent = PAYMENT_CONFIG.paypalEmail;
        
        console.log('✅ Información de PayPal mostrada correctamente');
    } else if (selectedMethod === 'binance') {
        const binanceInfo = document.getElementById('binanceInfo');
        const paypalInfo = document.getElementById('paypalInfo');
        const binanceAmount = document.getElementById('binanceAmount');
        const binanceIdDisplay = document.getElementById('binanceIdDisplay');
        
        if (!binanceInfo || !binanceAmount || !binanceIdDisplay) {
            console.error('❌ Elementos de Binance no encontrados');
            return;
        }
        
        binanceInfo.classList.remove('hidden');
        if (paypalInfo) paypalInfo.classList.add('hidden');
        binanceAmount.textContent = `$${price.toFixed(2)}`;
        binanceIdDisplay.textContent = PAYMENT_CONFIG.binanceId;
        
        console.log('✅ Información de Binance mostrada correctamente');
    } else {
        console.error('❌ Método de pago desconocido:', selectedMethod);
    }
}

// Copiar al portapapeles
function copyToClipboard(text, triggerEvent) {
    const evt = triggerEvent || window.event;
    
    navigator.clipboard.writeText(text).then(() => {
        const btn = evt ? evt.target.closest('button') : null;
        if (btn) {
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check mr-2"></i> ¡Copiado!';
            btn.classList.add('bg-green-500', 'hover:bg-green-600');
            btn.classList.remove('bg-yellow-500', 'hover:bg-yellow-600');
            
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.classList.remove('bg-green-500', 'hover:bg-green-600');
                btn.classList.add('bg-yellow-500', 'hover:bg-yellow-600');
            }, 2000);
        }
    }).catch(err => {
        console.error('Error al copiar:', err);
        alert('Error al copiar. Por favor, copia manualmente: ' + text);
    });
}

// Manejar subida de imagen
function handleImageUpload(e) {
    const file = e.target.files[0];
    if (file) {
        if (file.size > 5 * 1024 * 1024) {
            alert('La imagen es demasiado grande. Máximo 5MB.');
            return;
        }
        
        selectedReceiptFile = file;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const previewImg = document.getElementById('previewImg');
            const imagePreview = document.getElementById('imagePreview');
            const uploadArea = document.getElementById('uploadArea');
            const submitPayment = document.getElementById('submitPayment');
            
            if (previewImg) previewImg.src = e.target.result;
            if (imagePreview) imagePreview.classList.remove('hidden');
            if (uploadArea) uploadArea.classList.add('hidden');
            if (submitPayment) submitPayment.disabled = false;
        };
        reader.readAsDataURL(file);
    }
}

// Eliminar imagen
function removeImage() {
    selectedReceiptFile = null;
    const receiptUpload = document.getElementById('receiptUpload');
    const imagePreview = document.getElementById('imagePreview');
    const uploadArea = document.getElementById('uploadArea');
    const submitPayment = document.getElementById('submitPayment');
    
    if (receiptUpload) receiptUpload.value = '';
    if (imagePreview) imagePreview.classList.add('hidden');
    if (uploadArea) uploadArea.classList.remove('hidden');
    if (submitPayment) submitPayment.disabled = true;
}

// Enviar comprobante a la API backend (que luego lo manda a Discord)
async function submitReceipt() {
    if (!selectedReceiptFile) {
        alert('Por favor, sube una imagen del comprobante.');
        return;
    }

    const price = productPrices[currentProduct]?.[selectedDuration] || 0;
    const paymentNote = document.getElementById('paymentNote');
    const note = paymentNote ? paymentNote.value : '';

    const reader = new FileReader();
    reader.onload = async function() {
        const durationLabel =
            selectedDurationLabel ||
            (oneTimeProducts.includes(currentProduct) ? 'Pago único' : `${selectedDuration} días`);

        const clientInfo = {
            userAgent: navigator.userAgent.substring(0, 200),
            language: navigator.language,
            platform: navigator.platform
        };

        try {
            const imageDataUrl = reader.result; // data:image/png;base64,...

            const payload = {
                product: currentProduct,
                duration: selectedDuration,
                durationLabel: durationLabel,
                price: price,
                method: selectedMethod,
                note: note,
                clientInfo: clientInfo,
                imageDataUrl: imageDataUrl
            };

            const response = await fetch(`${MODEX_API_BASE}/api/payment/receipt`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error('Error al enviar comprobante al servidor');
            }

            if (window.securityLogger) {
                window.securityLogger.logEvent('payment_receipt_submitted', {
                    product: currentProduct,
                    duration: selectedDuration,
                    durationLabel: durationLabel,
                    price: price,
                    method: selectedMethod,
                    hasNote: !!note
                }, 'info');
            }

            alert('✅ ¡Comprobante enviado exitosamente!\n\nTu pago será verificado y te contactaremos pronto con los detalles de tu compra.');
            closeModal();
        } catch (error) {
            console.error('Error:', error);
            alert('❌ Error al enviar el comprobante. Por favor, intenta nuevamente o contáctanos directamente.');
        }
    };
    reader.readAsDataURL(selectedReceiptFile);
}

// Cerrar modal
function closeModal(event) {
    const priceModal = document.getElementById('priceModal');
    
    if (!event || event.target.id === 'priceModal') {
        if (priceModal) {
            priceModal.classList.add('hidden');
            priceModal.classList.remove('flex');
            
            // Resetear
            currentProduct = null;
            selectedDuration = null;
            selectedDurationLabel = null;
            selectedMethod = null;
            selectedReceiptFile = null;
            
            const durationSelection = document.getElementById('durationSelection');
            const paymentMethodSelection = document.getElementById('paymentMethodSelection');
            const paymentInfoSection = document.getElementById('paymentInfoSection');
            const receiptUpload = document.getElementById('receiptUpload');
            const paymentNote = document.getElementById('paymentNote');
            const imagePreview = document.getElementById('imagePreview');
            const uploadArea = document.getElementById('uploadArea');
            const submitPayment = document.getElementById('submitPayment');
            
            if (durationSelection) durationSelection.classList.remove('hidden');
            if (paymentMethodSelection) paymentMethodSelection.classList.add('hidden');
            if (paymentInfoSection) paymentInfoSection.classList.add('hidden');
            if (receiptUpload) receiptUpload.value = '';
            if (paymentNote) paymentNote.value = '';
            if (imagePreview) imagePreview.classList.add('hidden');
            if (uploadArea) uploadArea.classList.remove('hidden');
            if (submitPayment) submitPayment.disabled = true;
            
            document.querySelectorAll('.duration-selector').forEach(el => {
                el.classList.remove('hidden', 'selected', 'bg-yellow-500/20', 'border-yellow-500');
                const label = el.querySelector('h4');
                if (label && el.dataset.originalLabel) {
                    label.textContent = el.dataset.originalLabel;
                    delete el.dataset.originalLabel;
                }
            });
        }
    }
}

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePaymentSystem);
} else {
    initializePaymentSystem();
}

// Event listeners globales usando delegación de eventos
document.addEventListener('click', (e) => {
    // Debug: log de todos los clics
    console.log('🖱️ Click detectado:', e.target);
    
    // Seleccionar duración
    const durationSelector = e.target.closest('.duration-selector');
    if (durationSelector && !durationSelector.classList.contains('hidden')) {
        e.preventDefault();
        e.stopPropagation();
        const days = durationSelector.getAttribute('data-days');
        if (days) {
            console.log('✅ Duración seleccionada:', days);
            selectDuration(days);
        }
        return;
    }
    
    // Seleccionar método de pago (PayPal/Binance)
    const paymentMethod = e.target.closest('.payment-method');
    if (paymentMethod) {
        e.preventDefault();
        e.stopPropagation();
        const method = paymentMethod.getAttribute('data-method');
        console.log('🔍 Click en método de pago:', method);
        
        if (method && currentProduct && selectedDuration) {
            selectedMethod = method;
            console.log('✅ Método seleccionado:', selectedMethod);
            console.log('📦 Producto:', currentProduct, '⏱️ Duración:', selectedDuration);
            showPaymentInfo();
        } else {
            console.error('❌ Error:', { method, currentProduct, selectedDuration });
            if (!currentProduct || !selectedDuration) {
                alert('Error al procesar. Por favor, cierra el modal e intenta nuevamente.');
            }
        }
        return;
    }
    
    // Botón "Volver" (desde métodos de pago a selección de duración)
    const backToDuration = e.target.closest('#backToDuration');
    if (backToDuration) {
        e.preventDefault();
        e.stopPropagation();
        console.log('🔙 Volver a selección de duración');
        
        const durationSelection = document.getElementById('durationSelection');
        const paymentMethodSelection = document.getElementById('paymentMethodSelection');
        const paymentInfoSection = document.getElementById('paymentInfoSection');
        
        if (paymentMethodSelection) paymentMethodSelection.classList.add('hidden');
        if (paymentInfoSection) paymentInfoSection.classList.add('hidden');
        if (durationSelection) durationSelection.classList.remove('hidden');
        return;
    }
    
    // Botón "Volver" (desde info de pago a métodos de pago)
    const backToPaymentMethod = e.target.closest('#backToPaymentMethod');
    if (backToPaymentMethod) {
        e.preventDefault();
        e.stopPropagation();
        console.log('🔙 Volver a métodos de pago');
        
        const paymentMethodSelection = document.getElementById('paymentMethodSelection');
        const paymentInfoSection = document.getElementById('paymentInfoSection');
        
        if (paymentInfoSection) paymentInfoSection.classList.add('hidden');
        if (paymentMethodSelection) paymentMethodSelection.classList.remove('hidden');
        return;
    }
    
    // Enviar comprobante
    const submitButton = e.target.closest('#submitPayment');
    if (submitButton) {
        e.preventDefault();
        e.stopPropagation();
        console.log('📤 Enviando comprobante');
        submitReceipt();
        return;
    }
}, true); // Agregar 'true' para capturar en fase de captura

