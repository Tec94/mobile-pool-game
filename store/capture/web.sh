#!/usr/bin/env bash
# Build the web copy for the store captures: scripts/qa-web.sh, plus two changes to the COPY only (never the repo):
# - App.tsx exposes the match (table, aim, tip, paint) on globalThis.__g so a script can lay out balls and aim.
# - react-native-safe-area-context reads the safe area from ?ins=top,right,bottom,left (an iPhone's 62/34 pt).
# Usage: store/capture/web.sh <scratch-dir>; serve <scratch-dir>/app/dist on port 8765.
set -euo pipefail
dir=${1:?usage: web.sh <scratch-dir>}; here=$(cd "$(dirname "$0")" && pwd)
"$here/../../scripts/qa-web.sh" "$dir" >/dev/null
cd "$dir/app"
python3 - <<'PY'
s = open('App.tsx').read()
a = "  const tip = useRef(tipStore()).current, [sheet, setSheet] = useState(false), [tools, setTools] = useState(false);\n"
assert a in s, 'App.tsx changed: move the hook'
open('App.tsx', 'w').write(s.replace(a, a + "  (globalThis as any).__g = { table, shot, tip, dirty, view, lay, redraw, setSheet, get paint() { return paint; } };\n"))
m = open('metro.config.js').read()
m = m.replace("c.resolver.resolveRequest = (ctx, name, p) => p === 'web' && name === 'expo-file-system'",
  "c.resolver.resolveRequest = (ctx, name, p) => p === 'web' && name === 'react-native-safe-area-context' && !ctx.originModulePath.endsWith('sa-shim.js') ? { type: 'sourceFile', filePath: __dirname + '/sa-shim.js' } : p === 'web' && name === 'expo-file-system'")
open('metro.config.js', 'w').write(m)
PY
cat > sa-shim.js <<JS
export * from '$(node -p "require.resolve('react-native-safe-area-context')")';
const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('ins') : null;
const [top, right, bottom, left] = (q || '0,0,0,0').split(',').map(Number);
export const useSafeAreaInsets = () => ({ top, right, bottom, left });
JS
rm -rf dist; CI=1 npx expo export --platform web >&2
echo "$dir/app/dist"
