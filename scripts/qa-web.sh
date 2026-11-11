#!/usr/bin/env bash
# QA only: build the app for the web in a scratch copy (never in the repo) and print the dist path. Serve it with
# `python3 -m http.server -d <dist>` and drive it with scripts/qa-daily.mjs. Usage: scripts/qa-web.sh <scratch-dir>
# The copy swaps expo-file-system (a no-op on web) for localStorage keys 'qa-fs:<name>', so saves can be seeded and read.
set -euo pipefail
repo=$(cd "$(dirname "$0")/.." && pwd) dir=${1:?usage: qa-web.sh <scratch-dir>}
case "$(realpath -m "$dir")/" in "$repo"/*) echo "scratch dir must be outside the repo" >&2; exit 1;; esac
rm -rf "$dir/app"; mkdir -p "$dir/app"
tar -C "$repo" --exclude ./.git --exclude ./dist -cf - . | tar -C "$dir/app" -xf -
cd "$dir/app"
v() { node -p "require('./node_modules/expo/bundledNativeModules.json')['$1']"; }
npm install --no-save --no-audit --no-fund "react-native-web@$(v react-native-web)" "react-dom@$(v react-dom)" "@expo/metro-runtime@$(v @expo/metro-runtime)" >&2
cat > index.ts <<'EOF'
import { registerRootComponent } from 'expo';
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
LoadSkiaWeb({ locateFile: (f: string) => '/' + f }).then(() => registerRootComponent(require('./App').default));
EOF
cat > qa-fs.js <<'EOF'
const k = n => 'qa-fs:' + n;
export const Paths = { document: 'doc' };
export class File {
  constructor(_dir, name) { this.name = name; }
  get exists() { return localStorage.getItem(k(this.name)) != null; }
  textSync() { const t = localStorage.getItem(k(this.name)); if (t == null) throw new Error('no file ' + this.name); return t; }
  writeSync(s) { localStorage.setItem(k(this.name), s); }
  moveSync(to) { localStorage.setItem(k(to.name), this.textSync()); localStorage.removeItem(k(this.name)); }
}
EOF
cat > metro.config.js <<'EOF'
const { getDefaultConfig } = require('expo/metro-config');
const c = getDefaultConfig(__dirname), up = c.resolver.resolveRequest;
c.resolver.resolveRequest = (ctx, name, p) => p === 'web' && name === 'expo-file-system'
  ? { type: 'sourceFile', filePath: __dirname + '/qa-fs.js' } : (up ?? ctx.resolveRequest)(ctx, name, p);
module.exports = c;
EOF
mkdir -p public && cp node_modules/canvaskit-wasm/bin/full/canvaskit.wasm public/
CI=1 npx expo export --platform web >&2
echo "$dir/app/dist"
