// What the player earns. Pass and play pays a flat amount for each finished match, whoever wins (progression design:
// 40 XP and 20 coins).
export interface Pay { xp: number; coins: number }
export const PASS_PLAY: Pay = { xp: 40, coins: 20 };
// shortcut: nothing is kept yet; the progression work adds the pay to the save here.
export function award(_pay: Pay) {}
