// The waitlist endpoint. POST /api/join { email, name?, ref? } as JSON (the page) or as a plain form post (no script).
// It only stores the row: nothing is emailed until the game is on the App Store.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function join(req, env) {
  const json = (req.headers.get('content-type') || '').includes('json');
  const reply = (ok, status, error) => (json ? Response.json({ ok, error }, { status })
    : Response.redirect(new URL(ok ? '/?joined=1#join' : '/?error=1#join', req.url), 303));
  if (+req.headers.get('content-length') > 4000) return reply(false, 413, 'size');
  const form = json ? await req.json().catch(() => null) : await req.formData().then(Object.fromEntries, () => null);
  if (!form || typeof form !== 'object') return reply(false, 400, 'body');
  const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const email = text(form.email, 255).toLowerCase();
  if (form.website) return reply(true, 200); // the hidden field only a bot fills: say yes, store nothing
  if (email.length > 254 || !EMAIL.test(email)) return reply(false, 400, 'email');
  // A second signup with the same email changes nothing and gets the same answer, so the page never tells who is on the list.
  await env.DB.prepare('INSERT INTO signups (email, name, ref, country, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(email) DO NOTHING')
    .bind(email, text(form.name, 60) || null, text(form.ref, 40) || null, req.cf?.country || null, new Date().toISOString()).run();
  return reply(true, 200);
  // shortcut: no rate limit, so a script can fill the table with made-up addresses; add Turnstile or a rate limit rule if junk shows up.
}

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);
    if (pathname === '/api/join') return req.method === 'POST' ? join(req, env) : new Response('POST only', { status: 405, headers: { allow: 'POST' } });
    return env.ASSETS.fetch(req);
  },
};
