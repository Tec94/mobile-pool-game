// The waitlist endpoint. POST /api/join { email, name?, ref? } as JSON (the page) or as a plain form post (no script).
// It only stores the row: nothing is emailed until the game is on the App Store.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function join(req, env) {
  const json = (req.headers.get('content-type') || '').includes('json');
  const reply = (ok, status, error) => (json ? Response.json({ ok, error }, { status })
    : Response.redirect(new URL(ok ? '/?joined=1#join' : '/?error=1#join', req.url), 303));
  // Another site's page must not post here in a visitor's name, and one address gets five tries a minute.
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin) return reply(false, 403, 'origin');
  if (!(await env.LIMIT.limit({ key: req.headers.get('cf-connecting-ip') || 'none' })).success) return reply(false, 429, 'slow');
  if (+req.headers.get('content-length') > 4000) return reply(false, 413, 'size');
  const form = json ? await req.json().catch(() => null) : await req.formData().then(Object.fromEntries, () => null);
  if (!form || typeof form !== 'object') return reply(false, 400, 'body');
  const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const email = text(form.email, 255).toLowerCase();
  if (form.website) return reply(true, 200); // the hidden field only a bot fills: say yes, store nothing
  if (email.length > 254 || !EMAIL.test(email)) return reply(false, 400, 'email');
  // Turnstile: the page sends a token only a real browser gets. It never refuses anyone: a failed check is stored with human = 0,
  // a passed one with 1, so a real person whose browser fails the check is still on the list. NULL = not checked
  // (secret unset, or TURNSTILE "off" in wrangler.jsonc vars).
  const check = env.TURNSTILE !== 'off' && env.TURNSTILE_SECRET ? +(await human(form['cf-turnstile-response'], req, env)) : null;
  // A second signup with the same email changes nothing (but a passed check upgrades it) and gets the same answer,
  // so the page never tells who is on the list.
  await env.DB.prepare('INSERT INTO signups (email, name, ref, country, created_at, human) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET human = 1 WHERE excluded.human = 1')
    .bind(email, text(form.name, 60) || null, text(form.ref, 40) || null, req.cf?.country || null, new Date().toISOString(), check).run();
  return reply(true, 200);
}

async function human(token, req, env) {
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  const body = new FormData();
  body.append('secret', env.TURNSTILE_SECRET); body.append('response', token);
  const ip = req.headers.get('cf-connecting-ip'); if (ip) body.append('remoteip', ip);
  try {
    const r = await (await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body })).json();
    return r.success === true;
  } catch { return false; } // Cloudflare's check is down: refuse rather than let bots in
}

// www and the old workers.dev address send pages to the real domain, keeping path and query (so ?ref= still counts).
// Posts are let through so a page opened before the move can still join.
const HOME = 'runout.win';
const MOVED = /^www\.runout\.win$|\.workers\.dev$/;
// Lets runout.win links open the App Clip (team id + clip bundle id). Apple wants JSON with no redirect.
const AASA = { appclips: { apps: ['T753GG3LAJ.com.tec94.pool.Clip'] } };

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const { pathname } = url;
    if (pathname === '/.well-known/apple-app-site-association') return Response.json(AASA);
    if (MOVED.test(url.hostname) && (req.method === 'GET' || req.method === 'HEAD')) return Response.redirect(`https://${HOME}${pathname}${url.search}`, 301);
    if (pathname === '/api/join') return req.method === 'POST' ? join(req, env) : new Response('POST only', { status: 405, headers: { allow: 'POST' } });
    return env.ASSETS.fetch(req);
  },
};
