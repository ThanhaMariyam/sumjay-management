import { getAllowedOrigins, sendWhatsAppTemplateOrMessage, WhatsAppSendRequest } from './shared';

type VercelRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type VercelResponse = {
  setHeader: (name: string, value: string) => void;
  status: (statusCode: number) => VercelResponse;
  json: (body: unknown) => void;
  end: () => void;
};

function getHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function applyCors(req: VercelRequest, res: VercelResponse) {
  const origin = getHeaderValue(req.headers.origin);
  if (origin && getAllowedOrigins().includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

function parseBody(body: unknown): WhatsAppSendRequest {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as WhatsAppSendRequest;
    } catch {
      return {};
    }
  }
  return body && typeof body === 'object' ? (body as WhatsAppSendRequest) : {};
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    applyCors(req, res);

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }

    const result = await sendWhatsAppTemplateOrMessage(parseBody(req.body));
    res.status(result.status).json(result.body);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unexpected Vercel function error.',
    });
  }
}
