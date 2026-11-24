// Metro for the web demo (scripts/demo-web.mjs copies this to the build copy's root): src/clip and expo-file-system
// are swapped for the demo's own, and the parts of the game the demo never opens are left out of the bundle.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const c = getDefaultConfig(__dirname), up = c.resolver.resolveRequest;
const SWAP = { 'expo-file-system': 'demo/fs.js' };
const SWAP_SRC = { 'src/clip': 'demo/clip.ts', 'src/ui/Menus': 'demo/menus.ts' };
c.resolver.resolveRequest = (ctx, name, p) => {
  if (SWAP[name]) return { type: 'sourceFile', filePath: path.join(__dirname, SWAP[name]) };
  const r = (up ?? ctx.resolveRequest)(ctx, name, p);
  const rel = r.type === 'sourceFile' && path.relative(__dirname, r.filePath).replace(/\\/g, '/').replace(/\.tsx?$/, '');
  return rel && SWAP_SRC[rel] ? { type: 'sourceFile', filePath: path.join(__dirname, SWAP_SRC[rel]) } : r;
};
module.exports = c;
