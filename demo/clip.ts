// src/clip.ts for the web demo: always the App Clip's one quick match. Until the game is on the App Store, the full
// game is the waitlist; ref=play counts the signups that came from the demo.
export const CLIP = true;
export const fullGame = () => { window.location.href = '/?ref=play'; };
export const CLIP_TIER = 3; // the web demo's opponent: Shark (Jack 2026-11-24)
