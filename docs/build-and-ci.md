# Build and CI

This document covers the npm scripts, the electron-vite build, the two-project
test setup, packaging, continuous integration, and Docker-based development.

## npm scripts

```bash
npm install        # postinstall prepares the native dependencies
npm run dev        # development mode (electron-vite dev)
npm run build      # build main / preload / renderer into out/
npm run preview    # launch the built app (= npm start)
npm run dist       # produce distributables (electron-builder)
npm run typecheck  # tsc --noEmit over both src and electron
npm test           # regression tests (Vitest): core then renderer
npm run install:local  # install into the local environment
```

better-sqlite3 ships prebuilt Node-API binaries. npm 12 still reports a
`node-gyp rebuild` install script for it and warns that it was blocked, so
`allowScripts` in `package.json` denies it explicitly.

`dev`, `preview`, and `start` go through `scripts/run-electron-vite.mjs` rather
than calling `electron-vite` directly. The wrapper strips
`ELECTRON_RUN_AS_NODE` (which the test runner sets) from the environment before
launching, so Electron does not accidentally start in node mode.

## electron-vite config

`electron.vite.config.ts` builds main, preload, and renderer from one config.

- Preload is emitted as **CommonJS** (`.js`); ESM `.mjs` preload can fail to
  load, and `electron/main.ts` resolves the preload, the renderer entry and
  the query worker through `__dirname`, which assumes CJS output.
- TypeScript uses separate tsconfigs for `src` and `electron`, both `strict` with
  `noUnusedLocals` / `noUnusedParameters`.

The personal fork records the build number in `build.buildVersion` in
`package.json`. **Settings → App → About**, the left rail, and the packaged
macOS app all use that number. Increment it before packaging each new build
shared for testing. Keep the sequence going when the release version changes.
Starting an existing bundle keeps its number.

## Testing

Tests run under Vitest (`vitest.config.ts`) as two projects.

### Core project

`npm run test:core` covers the main/core logic (`electron/**/*.test.ts`). Because
the tests exercise the same native dependencies as the app, this **runs Electron as Node**
(`ELECTRON_RUN_AS_NODE=1` plus `--experimental-require-module` to allow
`require()` of ESM). It exercises real SQL against an in-memory SQLite database.
The config carries a plugin that resolves NodeNext-style `.js` import specifiers
to `.ts`.

### Renderer project

`npm run test:renderer` covers the renderer (`src/**/*.test.{ts,tsx}`, jsdom).
With no native dependency it runs under plain Node; it is kept separate because
the jsdom worker does not start under Electron's experimental loader.

## Packaging

`npm run dist` runs `electron-vite build` then `electron-builder`. The builder's
`asarUnpack` includes better-sqlite3 and @zabuton-app/ffmpeg-binaries.
Code that uses ffmpeg paths must apply the
`app.asar` → `app.asar.unpacked` substitution (see
[ffmpeg/ffprobe path resolution](media-pipeline.md#ffmpegffprobe-path-resolution)).

Distribution targets are Linux (AppImage / deb), Windows (nsis / portable), and
macOS (dmg / zip).

Electron 45 packages require macOS 13 (Ventura) or later. The existing
Windows x64 and Linux x64 release targets are supported by Electron 45.
On Linux the bundled FFmpeg 9 binaries require glibc 2.35 or later.
The Node.js version used to run npm and the build scripts is separate from
the Node.js version bundled with Electron.

### macOS code signing

There is no Apple developer certificate, so regular signing / notarization is
skipped (`CSC_IDENTITY_AUTO_DISCOVERY: false` in CI). Skipping alone is not
enough: electron-builder's repackaging invalidates the Electron binaries'
original signatures, and an app with an _invalid_ signature is rejected by
Gatekeeper on Apple silicon as "damaged" with no way to open it. The
`afterPack` hook (`scripts/mac-adhoc-sign.mjs`) therefore ad-hoc signs the
bundle, which restores a valid signature; users then only need the one-time
"Open Anyway" approval for an un-notarized app. If real certificates are
configured later (`CSC_LINK` / `CSC_NAME`), the hook steps aside
automatically.

## CI

GitHub Actions workflows live in `.github/workflows/`:

- `test.yml` runs `npm run typecheck` and `npm test`.
- `build.yml` triggers on `v*` tag pushes and builds a three-way matrix (linux
  x64, win x64, mac arm64), then creates a draft release.

[@zabuton-app/ffmpeg-binaries](https://github.com/zabuton-app/ffmpeg-binaries)
downloads FFmpeg and FFprobe for one architecture and checks each binary
against a pinned SHA-256 checksum. CI pins `npm_config_arch` to the target
architecture. To update the binaries, change the tarball URL in
`dependencies` and `allowScripts`, then refresh the lockfile with npm.
The project's `.npmrc` allows npm 12 to use tarball URLs listed directly
in `package.json`.

## Docker development

Development can also run in Docker (Wayland assumed):

```bash
docker compose up
```

`HOST_MEDIA_DIR` selects the directory to scan, and `RENDER_GID` / `VIDEO_GID`
set the GPU groups via `.env` (`Dockerfile` / `docker-compose.yml`). The dev
container seeds its initial workspace list from `samples/config.json` via
`scripts/seed-sample-config.mjs`; set `MEGURI_SEED_SAMPLE_CONFIG=force` to reset
to the sample state.
