-- The waitlist. email is stored in lower case and is the key, so a second signup with it changes nothing.
-- ref = where the visitor came from (?ref= or ?utm_source= on the page link), country = Cloudflare's guess.
CREATE TABLE IF NOT EXISTS signups (email TEXT PRIMARY KEY, name TEXT, ref TEXT, country TEXT, created_at TEXT NOT NULL);
