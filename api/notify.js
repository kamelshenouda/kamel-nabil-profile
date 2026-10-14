// Phone alerts for visits to Kamel's sites. Each site loads /notify.js, which
// beacons here when someone opens a site and again with a reading summary when
// they leave. We add the visitor's location (Vercel geo headers) and push it to
// the private ntfy topic in NTFY_TOPIC. Origins not listed in SITES are ignored.

const SITES = {
  'https://kamelnabil.com': 'Portfolio',
  'https://alpaca.kamelnabil.com': 'Alpaca take-home',
  'https://azad.kamelnabil.com': 'AZAD',
  'https://sabah.kamelnabil.com': 'Sabah menu',
  'https://providence.kamelnabil.com': 'Providence',
};
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

const text = (value, max) => String(value || '').slice(0, max);

module.exports = async (req, res) => {
  const topic = process.env.NTFY_TOPIC;
  const origin = req.headers.origin;
  const site = SITES[origin];
  if (req.method !== 'POST' || !site || !topic) return res.status(204).end();

  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  if (raw.length > MAX_BODY) return res.status(204).end();
  let data;
  try { data = JSON.parse(raw); } catch { return res.status(204).end(); }

  const place = [header(req, 'x-vercel-ip-city'), header(req, 'x-vercel-ip-country')]
    .filter(Boolean).join(', ') || 'Unknown location';
  const lines = [`${place} · ${device(req.headers['user-agent'] || '')}`];

  let title, tags;
  if (data.type === 'open') {
    title = `${site} opened`;
    tags = 'eyes';
    if (data.page) lines.push(`Page: ${text(data.page, 80)}`);
    lines.push(`Came from: ${source(text(data.ref, 300))}`);
  } else if (data.type === 'progress') {
    title = `${site} visit update`;
    tags = 'books';
    lines.push(`Time on site: ${duration(data.secs)}`);
    const pageCount = Number(data.pageCount) || 0;
    if (pageCount > 1 && Array.isArray(data.pages)) {
      lines.push(`Pages viewed: ${pageCount} (${data.pages.map((p) => text(p, 40)).join(' → ')})`);
    }
    const sections = Number(data.sections) || 0;
    if (sections || data.furthest) {
      lines.push(`Sections opened: ${sections}`);
      lines.push(`Furthest: ${text(data.furthest, 120) || 'none'}`);
    }
  } else {
    return res.status(204).end();
  }

  try {
    await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: 'POST',
      headers: { Title: title, Tags: tags, Click: origin },
      body: lines.join('\n'),
    });
  } catch (err) {
    console.error('ntfy push failed', err);
  }
  return res.status(204).end();
};
