# Pool

Expo (SDK 58) + React Native Skia + TypeScript. The physics engine is `src/physics/engine.ts`, a pure TS port of the
lab engine with its checks in `src/physics/engine.test.mjs` (`npm test`). `App.tsx` is a smoke-test table: pull back
anywhere to aim and shoot, tap Rack to reset, Demo to see a spin, jump or massé shot, Felt to change the cloth.

```
npm install
npm test           # physics checks (about 30 s)
npm run typecheck
npm run frames -- out   # review pictures without a phone, see below
```

`npm run frames` draws the table, the balls in motion, the aim line and both whole screens to PNG files with the app's
own drawing code (`src/render`), at the pixel size of an iPhone 15. It also redraws the app icon and launch mark in
`assets/` from the same ball code, so they change only when the ball design does. The buttons are React Native views
and are not in these pictures.

## Getting it on your iPhone from Windows

xtool cannot build a React Native app itself: it only builds Swift packages. What it can do is sign any `.ipa` with your
Apple developer account and install it over USB. So GitHub's macOS runner builds an unsigned `.ipa`, and xtool signs and installs it.

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
3. `xtool auth login`. Either mode works with the paid account: **0: API Key** (create one at App Store Connect >
   Users and Access > Integrations > App Store Connect API, role Developer, and give xtool the key ID, issuer ID and
   `.p8` file; uses only official APIs) or **1: Password** (Apple ID, password, 2FA code). You do not need Swift or
   `Xcode.xip`: those are only for building Swift apps with xtool.

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
   gh run download -n Pool-Release-ipa -R Tec94/mobile-pool-game
   xtool install Pool.ipa
   ```
5. If iOS says "Untrusted Developer": Settings > General > VPN & Device Management > your Apple ID > Trust.

### Fast loop for code changes (Debug build)

Rebuilding the app for every change is slow. Build once with **Debug** instead of Release and install it the same
way. That app is a dev client: on Windows run `npm start` in this folder, keep the phone on the same Wi-Fi, open Pool on
the phone and pick your PC's server. JS and TS changes then reload live. Only rebuild when a native package changes.

### Signing

xtool signs with a development certificate from your paid account, so the install lasts as long as the profile (a
year) instead of the 7 days a free Apple ID gets. TestFlight and App Store builds need distribution signing on the Mac
runner instead; that is a later step.

GitHub minutes: macOS builds are free on a public repo. On a private repo the free 2,000 minutes count 10x on macOS,
so about 200 macOS minutes, roughly 8 to 12 builds a month.
