import { doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

const env = (import.meta.env as Record<string, string | undefined>) ?? {};
const apiBaseUrl = (env.VITE_WHATSAPP_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:8787' : '')).replace(/\/$/, '');
const isLocalApi = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/.test(apiBaseUrl);

export interface WhatsAppTemplate {
  name: string;
  languageCode?: string;
  bodyParams?: string[];
}

const SENT_MESSAGES_STORAGE_KEY = 'sumjay.sentWhatsAppMessages';
const safeSendKeyPart = (value: string) => value.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'unknown';

export function buildWhatsAppSendKey(...parts: string[]) {
  return parts.map(safeSendKeyPart).join('__');
}

export function buildLegacyWhatsAppSendKey(...parts: string[]) {
  return parts.join(':');
}

export function readSentWhatsAppMessageIds(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(SENT_MESSAGES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function saveSentWhatsAppMessageId(sendKey: string) {
  if (typeof window === 'undefined') return;
  const nextSentMessages = {
    ...readSentWhatsAppMessageIds(),
    [sendKey]: true,
  };
  window.localStorage.setItem(SENT_MESSAGES_STORAGE_KEY, JSON.stringify(nextSentMessages));
}

export async function saveSentWhatsAppMessageRecord(data: {
  adminId: string;
  sendKey: string;
  category: 'fee' | 'attendance';
  targetId: string;
  messageType: string;
  periodKey: string;
}) {
  saveSentWhatsAppMessageId(data.sendKey);
  await setDoc(doc(db, 'whatsappMessages', data.sendKey), {
    ...data,
    sentAt: Date.now(),
  }, { merge: true });
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

  const responseText = await response.text().catch(() => '');
  let payload: Record<string, unknown> = {};
  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const rawError = typeof payload.error === 'string'
      ? payload.error
      : responseText.trim();
    const errorText = rawError || `WhatsApp request failed with HTTP ${response.status}.`;
    throw new Error(errorText);
  }

  return payload;
}
