// Server-side proxy for the Autosweep quick balance check.
// The Basic auth key is read from the AUTOSWEEP_BASIC_AUTH env var, so it never reaches the browser.
// Target URL is configurable via AUTOSWEEP_QUICKBALANCE_URL (defaults to the candidate endpoint
// found in the Autosweep app bundle; confirm it before relying on it).

const DEFAULT_URL = 'https://autosweeprfidapps.com/api/v2/mobileapp/';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = process.env.AUTOSWEEP_BASIC_AUTH;
  if (!auth) {
    return res.status(500).json({ error: 'Server is not configured (missing AUTOSWEEP_BASIC_AUTH)' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const plate = String(body.plate ?? '').trim();
  const account = String(body.account ?? '').trim();
  if (!plate && !account) {
    return res.status(400).json({ error: 'Provide a plate or an account number' });
  }

  const url = process.env.AUTOSWEEP_QUICKBALANCE_URL || DEFAULT_URL;

  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ plate, account }),
      signal: AbortSignal.timeout(30000),
    });

    const text = await upstream.text();
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    return res.status(upstream.status).send(text);
  } catch (err) {
    const cause = err && err.cause;
    return res.status(502).json({
      error: 'Upstream request failed',
      detail: String(err && err.message),
      cause: cause ? { code: cause.code, message: cause.message } : undefined,
      target: url,
    });
  }
}
