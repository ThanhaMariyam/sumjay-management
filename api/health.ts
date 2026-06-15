type VercelResponse = {
  status: (statusCode: number) => VercelResponse;
  json: (body: unknown) => void;
};

export default function handler(_req: unknown, res: VercelResponse) {
  res.status(200).json({ ok: true, service: 'whatsapp-api' });
}
