/**
 * Backend API para ModeX
 * - Oculta los webhooks de Discord del frontend
 * - Expone endpoints seguros para logs de seguridad y comprobantes de pago
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 3000;

// Cargar webhooks desde variables de entorno (NUNCA en el frontend)
const SECURITY_WEBHOOK_URL = process.env.SECURITY_WEBHOOK_URL;
const PAYMENT_WEBHOOK_URL = process.env.PAYMENT_WEBHOOK_URL;

if (!SECURITY_WEBHOOK_URL || !PAYMENT_WEBHOOK_URL) {
  console.warn(
    '[ModeX API] ⚠️ Falta configurar SECURITY_WEBHOOK_URL o PAYMENT_WEBHOOK_URL en .env'
  );
}

// Middleware
app.use(
  cors({
    origin: [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:5500',
      'http://127.0.0.1:5500',
      /\.modex\.lat$/ // para producción detrás de Cloudflare
    ],
    methods: ['POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
  })
);

app.use(express.json({ limit: '10mb' }));

// Endpoint de prueba
app.get('/', (req, res) => {
  res.json({ ok: true, message: 'ModeX API online' });
});

/**
 * POST /api/security-log
 * Recibe el payload de seguridad desde el frontend y lo reenvía al webhook de Discord.
 */
app.post('/api/security-log', async (req, res) => {
  try {
    if (!SECURITY_WEBHOOK_URL) {
      return res.status(500).json({ ok: false, error: 'SECURITY_WEBHOOK_URL no configurado' });
    }

    const payload = req.body;

    const response = await fetch(SECURITY_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error(
        '[ModeX API] Error al enviar log de seguridad a Discord:',
        response.status,
        await response.text()
      );
      return res.status(500).json({ ok: false });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('[ModeX API] Error /api/security-log:', e);
    res.status(500).json({ ok: false });
  }
});

/**
 * POST /api/payment/receipt
 * Recibe el comprobante de pago (datos + imagen base64) y lo envía al webhook de pagos.
 */
app.post('/api/payment/receipt', async (req, res) => {
  try {
    if (!PAYMENT_WEBHOOK_URL) {
      return res.status(500).json({ ok: false, error: 'PAYMENT_WEBHOOK_URL no configurado' });
    }

    const {
      product,
      duration,
      durationLabel,
      price,
      method,
      note,
      clientInfo,
      imageDataUrl
    } = req.body || {};

    if (!product || !duration || !price || !method || !imageDataUrl) {
      return res.status(400).json({ ok: false, error: 'Datos insuficientes en el cuerpo' });
    }

    const amountText = `$${Number(price).toFixed(2)}`;
    const methodLabel = method === 'paypal' ? 'PayPal' : 'Binance';

    // Embed principal (datos de la compra)
    const mainEmbed = {
      title: '💰 Nuevo Comprobante de Pago',
      color: method === 'paypal' ? 0x0070ba : 0xf3ba2f,
      fields: [
        {
          name: '📦 Producto',
          value: String(product),
          inline: true
        },
        {
          name: '⏱️ Duración',
          value: durationLabel || `${duration} días`,
          inline: true
        },
        {
          name: '💵 Monto',
          value: amountText,
          inline: true
        },
        {
          name: '💳 Método de Pago',
          value: methodLabel,
          inline: true
        }
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: 'ModeX Pro - Sistema de Pagos'
      }
    };

    if (note) {
      mainEmbed.fields.push({
        name: '📝 Nota del Cliente',
        value: String(note),
        inline: false
      });
    }

    if (clientInfo) {
      mainEmbed.fields.push({
        name: '🌐 Información del Cliente',
        value:
          `**User Agent:** ${String(clientInfo.userAgent || '').substring(0, 150)}\n` +
          `**Idioma:** ${clientInfo.language || 'desconocido'}\n` +
          `**Plataforma:** ${clientInfo.platform || 'desconocida'}`,
        inline: false
      });
    }

    // 1) Enviar embed principal
    const headResp = await fetch(PAYMENT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [mainEmbed],
        username: 'ModeX Payment System'
      })
    });

    if (!headResp.ok) {
      console.error(
        '[ModeX API] Error al enviar embed principal de pago:',
        headResp.status,
        await headResp.text()
      );
    }

    // 2) Enviar imagen como archivo adjunto
    const match = imageDataUrl.match(/^data:(.+);base64,(.+)$/);
    if (!match) {
      console.error('[ModeX API] imageDataUrl no tiene el formato esperado data:*;base64,');
      return res.json({ ok: true, warning: 'Imagen no adjuntada por formato inválido' });
    }

    const mimeType = match[1] || 'image/png';
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');

    const form = new FormData();
    form.append('file', buffer, {
      filename: 'comprobante.png',
      contentType: mimeType
    });

    form.append(
      'payload_json',
      JSON.stringify({
        embeds: [
          {
            title: '📸 Comprobante de Pago',
            description: `Producto: ${product}\nMonto: ${amountText}\nMétodo: ${methodLabel}`,
            color: method === 'paypal' ? 0x0070ba : 0xf3ba2f,
            timestamp: new Date().toISOString()
          }
        ]
      })
    );

    const imgResp = await fetch(PAYMENT_WEBHOOK_URL, {
      method: 'POST',
      headers: form.getHeaders(),
      body: form
    });

    if (!imgResp.ok) {
      console.error(
        '[ModeX API] Error al enviar imagen de comprobante:',
        imgResp.status,
        await imgResp.text()
      );
      return res.status(500).json({ ok: false });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('[ModeX API] Error /api/payment/receipt:', e);
    res.status(500).json({ ok: false });
  }
});

app.listen(PORT, () => {
  console.log(`[ModeX API] Escuchando en http://localhost:${PORT}`);
});


