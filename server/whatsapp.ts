import 'dotenv/config';
import express from 'express';

const app = express();
const port = Number(process.env.WHATSAPP_API_PORT || 8787);
const whatsappAccessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
const whatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const whatsappApiVersion = process.env.WHATSAPP_API_VERSION || 'v23.0';
const allowedOrigins = (process.env.WHATSAPP_ALLOWED_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const defaultCountryCode = (process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '91').replace(/[^0-9]/g, '');
const defaultTemplateLanguage = process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en';
const allowedTemplates = (process.env.WHATSAPP_ALLOWED_TEMPLATES || '')
  .split(',')
  .map((templateName) => templateName.trim())
  .filter(Boolean);

app.use(express.json());

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
  }
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'whatsapp-api' });
});

function normalizeWhatsAppNumber(value: string) {
  const input = value.trim();
  if (!input) return '';

  if (input.startsWith('+')) {
    return input.replace(/[^0-9]/g, '');
  }

  if (input.startsWith('00')) {
    return input.replace(/[^0-9]/g, '').replace(/^00/, '');
  }

  const digits = input.replace(/[^0-9]/g, '');
  if (digits.length === 10 && defaultCountryCode) {
    return `${defaultCountryCode}${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('0') && defaultCountryCode) {
    return `${defaultCountryCode}${digits.slice(1)}`;
  }

  return digits;
}

type WhatsAppTemplateRequest = {
  name: string;
  languageCode?: string;
  bodyParams?: string[];
};

function buildTemplatePayload(cleanTo: string, template: WhatsAppTemplateRequest) {
  return {
    messaging_product: 'whatsapp',
    to: cleanTo,
    type: 'template',
    template: {
      name: template.name,
      language: {
        code: template.languageCode || defaultTemplateLanguage,
      },
      components: template.bodyParams?.length
        ? [
            {
              type: 'body',
              parameters: template.bodyParams.map((value) => ({
                type: 'text',
                text: String(value),
              })),
            },
          ]
        : undefined,
    },
  };
}

function isAllowedTemplate(templateName: string) {
  return allowedTemplates.length === 0 || allowedTemplates.includes(templateName);
}

app.post('/api/whatsapp/send', async (req, res) => {
  const { to, message, template } = req.body as {
    to?: string;
    message?: string;
    template?: WhatsAppTemplateRequest;
  };

  if (!to || (!message && !template?.name)) {
    res.status(400).json({ error: 'Both "to" and either "message" or "template.name" are required.' });
    return;
  }

  if (!whatsappAccessToken || !whatsappPhoneNumberId) {
    res.status(500).json({ error: 'Missing WhatsApp API credentials on server.' });
    return;
  }

  if (template?.name && !isAllowedTemplate(template.name)) {
    res.status(400).json({
      error: `WhatsApp template "${template.name}" is not enabled for this app. Enabled templates: ${allowedTemplates.join(', ') || 'all'}.`,
    });
    return;
  }

  const cleanTo = normalizeWhatsAppNumber(String(to));
  if (!/^[1-9][0-9]{7,14}$/.test(cleanTo)) {
    res.status(400).json({
      error: 'Invalid recipient mobile number. Use international format like +919876543210 or +971501234567.',
    });
    return;
  }

  const endpoint = `https://graph.facebook.com/${whatsappApiVersion}/${whatsappPhoneNumberId}/messages`;
  const outboundPayload = template?.name
    ? buildTemplatePayload(cleanTo, template)
    : {
        messaging_product: 'whatsapp',
        to: cleanTo,
        type: 'text',
        text: {
          body: String(message),
        },
      };

  try {
    if (template?.name) {
      // eslint-disable-next-line no-console
      console.log(
        `Sending WhatsApp template "${template.name}" (${template.languageCode || defaultTemplateLanguage}) with ${template.bodyParams?.length ?? 0} body params`,
      );
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${whatsappAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(outboundPayload),
    });

    const data = await response.json();

    if (!response.ok) {
      const details = data?.error?.message || 'WhatsApp API error';
      res.status(response.status).json({ error: details, raw: data });
      return;
    }

    res.json({ ok: true, data });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unexpected server error while sending WhatsApp message.',
    });
  }
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`WhatsApp API running on http://localhost:${port}`);
});
