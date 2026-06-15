const env = (import.meta.env as Record<string, string | undefined>) ?? {};
const apiBaseUrl = (env.VITE_WHATSAPP_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:8787' : '')).replace(/\/$/, '');
const isLocalApi = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/.test(apiBaseUrl);

export interface WhatsAppTemplate {
  name: string;
  languageCode?: string;
  bodyParams?: string[];
}

export async function sendWhatsAppMessage(to: string, message: string, template?: WhatsAppTemplate) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}/api/whatsapp/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to, message, template }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('WhatsApp service timed out. Please try again.');
    }
    const hint = isLocalApi
      ? ' Start API server with "npm run dev:api".'
      : ' Check the production WhatsApp API URL and server health.';
    throw new Error(`WhatsApp service is unreachable at ${apiBaseUrl || 'this site'}.${hint}`);
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorText = payload?.error || 'Failed to send WhatsApp message.';
    throw new Error(errorText);
  }

  return payload;
}
