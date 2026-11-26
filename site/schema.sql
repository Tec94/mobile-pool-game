-- The waitlist. email is stored in lower case and is the key, so a second signup with it changes nothing.
-- human = Turnstile result: 1 passed, 0 failed (still stored, never refused), NULL not checked.
-- ref = where the visitor came from (?ref= or ?utm_source= on the page link), country = Cloudflare's guess.
CREATE TABLE IF NOT EXISTS signups (email TEXT PRIMARY KEY, name TEXT, ref TEXT, country TEXT, created_at TEXT NOT NULL, human INTEGER);
-- Added 2026-11-26 to the live DB (run before deploying the worker that writes it):
-- ALTER TABLE signups ADD COLUMN human INTEGER;
