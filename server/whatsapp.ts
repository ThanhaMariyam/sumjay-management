import 'dotenv/config';
import express from 'express';

const app = express();
const port = Number(process.env.WHATSAPP_API_PORT || 8787);
const whatsappAccessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
const whatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const whatsappApiVersion = process.env.WHATSAPP_API_VERSION || 'v23.0';
const allowedOrigin = process.env.WHATSAPP_ALLOWED_ORIGIN || 'http://localhost:3000';

app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', allowedOrigin);
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
  const { to, message } = req.body as { to?: string; message?: string };

  if (!to || !message) {
    res.status(400).json({ error: 'Both "to" and "message" are required.' });
    return;
  }

  if (!whatsappAccessToken || !whatsappPhoneNumberId) {
    res.status(500).json({ error: 'Missing WhatsApp API credentials on server.' });
    return;
  }

  const cleanTo = String(to).replace(/[^0-9]/g, '');
  if (!cleanTo) {
    res.status(400).json({ error: 'Invalid recipient mobile number.' });
    return;
  }

  const endpoint = `https://graph.facebook.com/${whatsappApiVersion}/${whatsappPhoneNumberId}/messages`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${whatsappAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: cleanTo,
        type: 'text',
        text: {
          body: String(message),
        },
      }),
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
