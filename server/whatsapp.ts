import 'dotenv/config';
import express from 'express';
import { getAllowedOrigins, sendWhatsAppTemplateOrMessage, WhatsAppSendRequest } from './whatsapp-shared';

const app = express();
const port = Number(process.env.WHATSAPP_API_PORT || 8787);
const allowedOrigins = getAllowedOrigins();

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

app.post('/api/whatsapp/send', async (req, res) => {
  const result = await sendWhatsAppTemplateOrMessage(req.body as WhatsAppSendRequest);
  res.status(result.status).json(result.body);
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`WhatsApp API running on http://localhost:${port}`);
});
