const env = (import.meta.env as Record<string, string | undefined>) ?? {};
const apiBaseUrl = (env.VITE_WHATSAPP_API_BASE_URL || 'http://localhost:8787').replace(/\/$/, '');

export async function sendWhatsAppMessage(to: string, message: string) {
  const response = await fetch(`${apiBaseUrl}/api/whatsapp/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to, message }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorText = payload?.error || 'Failed to send WhatsApp message.';
    throw new Error(errorText);
  }

  return payload;
}
