# Pool

Expo (SDK 58) + React Native Skia + TypeScript. The physics engine is `src/physics/engine.ts`, a pure TS port of the
lab engine with its checks in `src/physics/engine.test.mjs` (`npm test`). `App.tsx` is a smoke-test table: pull back
anywhere to aim and shoot, tap Rack to reset.

```
npm install
npm test           # physics checks (about 30 s)
npm run typecheck
```

## Getting it on your iPhone from Windows

xtool cannot build a React Native app itself: it only builds Swift packages. What it can do is sign any `.ipa` with your
Apple ID and install it over USB. So GitHub's macOS runner builds an unsigned `.ipa`, and xtool signs and installs it.

### One-time setup

**iPhone**
1. Settings > Privacy & Security > Developer Mode: turn it on and restart. (The switch only appears after the first
   install attempt on some iOS versions; if it isn't there, do the install below, then come back.)

**Windows** (PowerShell as administrator)
1. `wsl --install -d Ubuntu` and restart if asked.
2. `winget install usbipd` (USB passthrough to WSL).
3. `winget install GitHub.cli`, then `gh auth login`.

**WSL** (open Ubuntu)
1. `sudo apt-get update && sudo apt-get install -y usbmuxd unzip`
2. Install xtool:
   ```
   curl -fL "https://github.com/xtool-org/xtool/releases/latest/download/xtool-$(uname -m).AppImage" -o xtool
   chmod +x xtool && sudo mv xtool /usr/local/bin/
   ```
   If it says FUSE is missing: `sudo apt-get install -y libfuse2`.
3. `xtool auth login`, pick **1: Password** (works with a free Apple ID), and enter your Apple ID, password and 2FA
   code. You do not need Swift or `Xcode.xip`: those are only for building Swift apps with xtool.

### Each time you install

1. Build: GitHub > Actions > **iOS build** > Run workflow > Release (about 15 to 25 min). Or from a terminal:
   `gh workflow run ios.yml -f configuration=Release`
2. Plug the iPhone in by USB, unlock it, and tap **Trust** if asked.
3. Attach it to WSL (PowerShell as administrator):
   ```
   usbipd list                          # find the BUSID of "Apple Mobile Device"
   usbipd bind --busid <BUSID>          # first time only
   usbipd attach --wsl --busid <BUSID>
   ```
4. In WSL:
   ```
   sudo usbmuxd                         # once per WSL start
   xtool devices                        # your iPhone should be listed
   gh run download -n Pool-Release-ipa -R <you>/<repo>
   xtool install Pool.ipa
   ```
5. First install only: iPhone Settings > General > VPN & Device Management > your Apple ID > Trust.

### Fast loop for code changes (Debug build)

Rebuilding the app for every change is slow. Build once with **Debug** instead of Release and install it the same
way. That app is a dev client: on Windows run `npm start` in this folder, keep the phone on the same Wi-Fi, open Pool on
the phone and pick your PC's server. JS and TS changes then reload live. Only rebuild when a native package changes.

### Limits of a free Apple ID

- The app stops opening after **7 days**. Run `xtool install Pool.ipa` again (same file is fine) to renew it.
- At most 3 sideloaded apps at once, and 10 new app IDs per week.
- A paid developer account ($99/yr) lifts these and is needed for TestFlight and the App Store anyway.

GitHub minutes: macOS builds are free on a public repo. On a private repo the free 2,000 minutes count 10x on macOS,
so about 200 macOS minutes, roughly 8 to 12 builds a month.
