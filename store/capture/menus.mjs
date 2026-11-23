import { chromium, open, PROFILE, SETTINGS } from './lib.mjs';
import { readFileSync } from 'node:fs';
const b = await chromium.launch();
const files = { 'profile.json': PROFILE, 'settings.json': { ...SETTINGS, tier: 5 }, 'tournament.json': JSON.parse(readFileSync('run.json','utf8')), 'scenarios.json': JSON.parse(readFileSync('stars.json','utf8')), 'learn.json': ['aim', 'power', 'follow', 'draw', 'stun', 'side', 'bank', 'kick'] };
for (const [size, w, h] of [['69', 440, 956], ['63', 402, 874]])
  for (const [name, tile] of [['home', null], ['tour', 'Tournament'], ['learn', 'Learn'], ['cues', 'Cues']]) {
    const p = await open(b, w, h, files, 3);
    if (tile) { await p.getByText(tile, { exact: false }).first().click(); await p.waitForTimeout(1500); }
    if (name === 'home') { await p.getByText('Tournament').first().click(); await p.waitForTimeout(1200); await p.getByRole('button', { name: /back/i }).first().click(); await p.waitForTimeout(1200); }
    await p.screenshot({ path: `raw/${size}/${name}.png` }); await p.close();
  }
await b.close();
