// Focus follows scroll on a hand that runs off the screen. The scroll's progress picks the card, not the card under the
// middle, so the row stays full at both ends. max = the last scroll offset, n = the cards.

// The card in focus at scroll offset x; -1 while the row cannot scroll (or is not laid out yet).
export function focusAt(x: number, max: number, n: number) {
  'worklet';
  return max > 0 ? Math.min(n - 1, Math.max(0, Math.round((x / max) * (n - 1)))) : -1;
}

// The offset that focuses card i: the snap points, and where a tap scrolls.
export const offsetOf = (i: number, max: number, n: number) => (n > 1 ? (i * max) / (n - 1) : 0);
