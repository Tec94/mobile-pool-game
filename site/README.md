# Waitlist site

One page (`public/`) and one endpoint (`worker.js`, `POST /api/join`) on Cloudflare Workers. Signups go to the D1
database `runout-waitlist`, table `signups` (`schema.sql`). Nothing is emailed.

```bash
npm ci --prefix ..   # the game's packages: the page and the free match (/play) are built from them
npm install
npm run dev      # local page and a local database (first: npx wrangler d1 execute runout-waitlist --local --file schema.sql)
npm run deploy   # builds public/app.js from src/app.js and the game's engine, and public/play (the free match), then deploys
npm run export   # every signup as JSON; or Cloudflare dashboard > D1 > runout-waitlist > signups > Export
```

The tables on the page run `src/physics/engine.ts` of the game. The three starting shots are in `src/presets.mjs`;
`npm test` at the repo root checks that each still pots its ball.

`/play` is one free 8-ball match against the AI: the App Clip's match, built for the web by `scripts/demo-web.mjs`
(`npm run demo` at the repo root) with React Native for the web and Skia's CanvasKit. Its bundle leaves out every menu
(`demo/`); its own headers are in `public/_headers`.
