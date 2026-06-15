export type WhatsAppTemplateRequest = {
  name: string;
  languageCode?: string;
  bodyParams?: string[];
};

export type WhatsAppSendRequest = {
  to?: string;
  message?: string;
  template?: WhatsAppTemplateRequest;
};

export type WhatsAppSendResult = {
  status: number;
  body: Record<string, unknown>;
};

const getAllowedTemplates = () =>
  (process.env.WHATSAPP_ALLOWED_TEMPLATES || '')
    .split(',')
    .map((templateName) => templateName.trim())
    .filter(Boolean);

const getDefaultCountryCode = () => (process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '91').replace(/[^0-9]/g, '');

const getDefaultTemplateLanguage = () => process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en';

export function normalizeWhatsAppNumber(value: string) {
  const input = value.trim();
  if (!input) return '';

  if (input.startsWith('+')) {
    return input.replace(/[^0-9]/g, '');
  }

  if (input.startsWith('00')) {
    return input.replace(/[^0-9]/g, '').replace(/^00/, '');
  }

  const digits = input.replace(/[^0-9]/g, '');
  const defaultCountryCode = getDefaultCountryCode();
  if (digits.length === 10 && defaultCountryCode) {
    return `${defaultCountryCode}${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('0') && defaultCountryCode) {
    return `${defaultCountryCode}${digits.slice(1)}`;
  }

  return digits;
}

function buildTemplatePayload(cleanTo: string, template: WhatsAppTemplateRequest) {
  return {
    messaging_product: 'whatsapp',
    to: cleanTo,
    type: 'template',
    template: {
      name: template.name,
      language: {
        code: template.languageCode || getDefaultTemplateLanguage(),
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
  const allowedTemplates = getAllowedTemplates();
  return allowedTemplates.length === 0 || allowedTemplates.includes(templateName);
}

export async function sendWhatsAppTemplateOrMessage(requestBody: WhatsAppSendRequest): Promise<WhatsAppSendResult> {
  const { to, message, template } = requestBody;
  const whatsappAccessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
  const whatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  const whatsappApiVersion = process.env.WHATSAPP_API_VERSION || 'v23.0';

  if (!to || (!message && !template?.name)) {
    return {
      status: 400,
      body: { error: 'Both "to" and either "message" or "template.name" are required.' },
    };
  }

  if (!whatsappAccessToken || !whatsappPhoneNumberId) {
    return {
      status: 500,
      body: { error: 'Missing WhatsApp API credentials on server.' },
    };
  }

  if (template?.name && !isAllowedTemplate(template.name)) {
    const allowedTemplates = getAllowedTemplates();
    return {
      status: 400,
      body: {
        error: `WhatsApp template "${template.name}" is not enabled for this app. Enabled templates: ${allowedTemplates.join(', ') || 'all'}.`,
      },
    };
  }

  const cleanTo = normalizeWhatsAppNumber(String(to));
  if (!/^[1-9][0-9]{7,14}$/.test(cleanTo)) {
    return {
      status: 400,
      body: {
        error: 'Invalid recipient mobile number. Use international format like +919876543210 or +971501234567.',
      },
    };
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
      console.log(
        `Sending WhatsApp template "${template.name}" (${template.languageCode || getDefaultTemplateLanguage()}) with ${template.bodyParams?.length ?? 0} body params`,
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
      return { status: response.status, body: { error: details, raw: data } };
    }

    return { status: 200, body: { ok: true, data } };
  } catch (error) {
    return {
      status: 500,
      body: {
        error: error instanceof Error ? error.message : 'Unexpected server error while sending WhatsApp message.',
      },
    };
  }
}

export function getAllowedOrigins() {
  return (process.env.WHATSAPP_ALLOWED_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
