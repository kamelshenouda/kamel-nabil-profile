// Phone alert when someone opens or leaves the Alpaca take-home.
// alpaca.kamelnabil.com sends a beacon here; we add the visitor's location
// (from Vercel's geo headers) and push it to the private ntfy topic in
// NTFY_TOPIC. Requests from any other origin are ignored.

const ALLOWED_ORIGIN = 'https://alpaca.kamelnabil.com';
const MAX_BODY = 2000;

function header(req, name) {
  const value = req.headers[name];
  if (!value) return '';
  try { return decodeURIComponent(value); } catch { return value; }
}

function device(ua) {
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown device';
}

function source(referrer) {
  if (!referrer) return 'a direct link (email, chat or typed)';
  try { return new URL(referrer).hostname.replace(/^www\./, ''); } catch { return 'unknown'; }
}

function duration(secs) {
  const s = Math.max(0, Math.round(Number(secs) || 0));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

module.exports = async (req, res) => {
  const topic = process.env.NTFY_TOPIC;
  if (req.method !== 'POST' || req.headers.origin !== ALLOWED_ORIGIN || !topic) {
    return res.status(204).end();
  }

  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  if (raw.length > MAX_BODY) return res.status(204).end();
  let data;
  try { data = JSON.parse(raw); } catch { return res.status(204).end(); }

  const place = [header(req, 'x-vercel-ip-city'), header(req, 'x-vercel-ip-country')]
    .filter(Boolean).join(', ') || 'Unknown location';
  const who = `${place} · ${device(req.headers['user-agent'] || '')}`;

  let title, body, tags;
  if (data.type === 'open') {
    title = 'Alpaca take-home opened';
    body = `${who}\nCame from: ${source(String(data.ref || ''))}`;
    tags = 'eyes';
  } else if (data.type === 'progress') {
    title = 'Alpaca reading update';
    body = `${who}\nTime on page: ${duration(data.secs)}\n` +
      `Sections opened: ${Number(data.sections) || 0}\n` +
      `Furthest: ${String(data.furthest || 'did not open any section').slice(0, 120)}`;
    tags = 'books';
  } else {
    return res.status(204).end();
  }

  try {
    await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: 'POST',
      headers: { Title: title, Tags: tags, Click: ALLOWED_ORIGIN },
      body,
    });
  } catch (err) {
    console.error('ntfy push failed', err);
  }
  return res.status(204).end();
};
