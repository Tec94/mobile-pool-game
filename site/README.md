# Waitlist site

One page (`public/`) and one endpoint (`worker.js`, `POST /api/join`) on Cloudflare Workers. Signups go to the D1
database `runout-waitlist`, table `signups` (`schema.sql`). Nothing is emailed.

```bash
npm install
npm run dev      # local page and a local database (first: npx wrangler d1 execute runout-waitlist --local --file schema.sql)
npm run deploy   # builds public/app.js from src/app.js and the game's engine, then deploys
npm run export   # every signup as JSON; or Cloudflare dashboard > D1 > runout-waitlist > signups > Export
```

The tables on the page run `src/physics/engine.ts` of the game. The three starting shots are in `src/presets.mjs`;
`npm test` at the repo root checks that each still pots its ball.
