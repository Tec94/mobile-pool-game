import { chromium, open, PROFILE, SETTINGS } from './lib.mjs';
import { readFileSync } from 'node:fs';
const b = await chromium.launch();
const files = { 'profile.json': PROFILE, 'settings.json': { ...SETTINGS, tier: 5 }, 'tournament.json': JSON.parse(readFileSync('run.json','utf8')), 'scenarios.json': JSON.parse(readFileSync('stars.json','utf8')), 'learn.json': ['aim', 'power', 'follow', 'draw', 'stun', 'side', 'bank', 'kick'] };
for (const [size, w, h] of [['69', 440, 956], ['63', 402, 874]])
  for (const [name, tile] of [['home', null], ['tour', 'Tournament'], ['learn', 'Learn'], ['cues', 'Cues']]) {
    const p = await open(b, w, h, files, 3);
    if (tile) { await p.getByText(tile, { exact: false }).first().click(); await p.waitForTimeout(1500); }
    if (name === 'home') { await p.getByText('Tournament').first().click(); await p.waitForTimeout(1200); await p.getByRole('button', { name: /back/i }).first().click(); await p.waitForTimeout(1200);
      await p.mouse.move(w / 2, h * 0.75); await p.mouse.wheel(0, size === '69' ? 80 : 120); await p.waitForTimeout(800); } // scroll so the bottom tiles show whole
    if (name === 'cues') { await p.getByText('Daybreak').first().click(); await p.waitForTimeout(800); } // an owned cue not in use: its panel shows Use
    await p.screenshot({ path: `raw/${size}/${name}.png` }); await p.close();
  }
await b.close();
