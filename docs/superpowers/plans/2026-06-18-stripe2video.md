# Stripe2Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Electron desktop GUI that converts a sprite sheet into an MP4 video, with live grid-overlay preview and one-click export.

**Architecture:** Electron two-process app. The **renderer** (React + TS) loads the image, runs pure frame-detection/sequencing logic, draws frames to `OffscreenCanvas` as PNG buffers, and drives the UI. The **main** process owns the `ffmpeg` encoding pipeline (PNG sequence → MP4) and file dialogs. They communicate via `contextBridge` IPC. Core logic (`detectGrid`, `computeFrameOrder`) is pure and unit-tested; the encoder is integration-tested with `pngjs`-generated frames.

**Tech Stack:** Electron, electron-vite, React 18, TypeScript, fluent-ffmpeg, ffmpeg-static, vitest, electron-builder.

**Spec:** `docs/superpowers/specs/2026-06-18-stripe2video-design.md`

---

## File Structure

```
D:\Project\Stripe2Video\
├── package.json
├── electron.vite.config.ts          # electron-vite config (main/preload/renderer)
├── tsconfig.json / tsconfig.node.json / tsconfig.web.json
├── vitest.config.ts                 # node-env test config
├── electron-builder.yml             # packaging config (Phase: packaging)
├── .gitignore                       # (exists)
├── src/
│   ├── shared/
│   │   └── types.ts                 # GridParams, ExportParams, PlayMode, EncodeRequest
│   ├── main/
│   │   ├── index.ts                 # app entry, BrowserWindow creation
│   │   ├── ipc.ts                   # IPC handlers (encode:video, dialog:save)
│   │   ├── encoder.ts               # encodeVideo(): PNG buffers → ffmpeg → MP4
│   │   ├── ffmpeg.ts                # getFfmpegPath() wrapper
│   │   └── tempfs.ts                # createTempDir / cleanTempDir / writeFrames
│   ├── preload/
│   │   ├── index.ts                 # contextBridge: exposes window.api
│   │   └── index.d.ts              # type declarations for window.api
│   └── renderer/
│       ├── index.html
│       └── src/
│           ├── main.tsx             # React entry
│           ├── App.tsx              # top-level state + layout
│           ├── App.css              # layout styles
│           ├── lib/
│           │   ├── frameDetector.ts # detectGrid(): pure
│           │   ├── frameOrder.ts    # computeFrameOrder(): pure
│           │   └── frameRenderer.ts # renderFrames(): canvas glue
│           └── components/
│               ├── Dropzone.tsx
│               ├── PreviewCanvas.tsx
│               ├── AnimationPreview.tsx
│               ├── Controls.tsx
│               └── ExportBar.tsx
├── tests/
│   ├── frameDetector.test.ts
│   ├── frameOrder.test.ts
│   ├── tempfs.test.ts
│   └── encoder.test.ts
```

**Design notes for isolation:**
- Pure logic (`frameDetector`, `frameOrder`) is split from canvas glue (`frameRenderer`) so the sequencing math is unit-testable in Node without a canvas.
- `encoder.ts` accepts already-rendered PNG `Uint8Array[]`, decoupling it from the DOM and making it integration-testable with `pngjs` fixtures.
- `GridParams` already carries `rows` (locked to `1` in Phase A), so Phase B is an extension, not a refactor.

---

## Task 1: Scaffold the electron-vite project

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`, `vitest.config.ts`
- Create: `src/main/index.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`, `src/renderer/index.html`, `src/renderer/src/main.tsx`
- Create: `tests/.gitkeep`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "stripe2video",
  "version": "0.1.0",
  "description": "Convert sprite sheets to MP4 video",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "build:win": "electron-vite build && electron-builder --win"
  },
  "dependencies": {
    "fluent-ffmpeg": "^2.1.3",
    "ffmpeg-static": "^5.2.0"
  },
  "devDependencies": {
    "@types/fluent-ffmpeg": "^2.1.27",
    "@types/pngjs": "^6.0.5",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "electron": "^31.0.0",
    "electron-builder": "^24.13.3",
    "electron-vite": "^2.3.0",
    "pngjs": "^7.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `electron.vite.config.ts`**

```ts
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts') } } }
  },
  renderer: {
    root: 'src/renderer',
    build: { rollupOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html') } } },
    plugins: [react()]
  }
})
```

- [ ] **Step 3: Create `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`**

`tsconfig.json`:
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

`tsconfig.node.json` (main + preload + tests):
```json
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["src/main/**/*", "src/preload/**/*", "src/shared/**/*", "tests/**/*", "electron.vite.config.ts", "vitest.config.ts"]
}
```

`tsconfig.web.json` (renderer):
```json
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src/renderer/src/**/*", "src/shared/**/*"]
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
})
```

- [ ] **Step 5: Create minimal `src/main/index.ts`**

```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'path'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

void app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 6: Create `src/preload/index.ts` and `src/preload/index.d.ts`**

`src/preload/index.ts`:
```ts
// Populated in Task 10. Placeholder keeps the build green during scaffolding.
export {}
```

`src/preload/index.d.ts`:
```ts
// Populated in Task 10.
export {}
```

- [ ] **Step 7: Create `src/renderer/index.html` and `src/renderer/src/main.tsx`**

`src/renderer/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Stripe2Video</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/renderer/src/main.tsx`:
```tsx
import React from 'react'
import { createRoot } from 'react-dom/client'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h1>Stripe2Video</h1>
      <p>Scaffold OK</p>
    </div>
  </React.StrictMode>
)
```

- [ ] **Step 8: Create `tests/.gitkeep`**

```
(empty file)
```

- [ ] **Step 9: Install dependencies**

Run:
```bash
npm install
```
Expected: installs Electron, React, ffmpeg-static, fluent-ffmpeg, vitest, pngjs, etc. `ffmpeg-static` will download a platform binary.

- [ ] **Step 10: Verify the dev server launches a window**

Run:
```bash
npm run dev
```
Expected: an Electron window opens showing "Stripe2Video / Scaffold OK". Close the window to stop.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: scaffold electron-vite + react + ts project"
```

---

## Task 2: Shared types

**Files:**
- Create: `src/shared/types.ts`
- Test: `tests/types.test.ts`

- [ ] **Step 1: Write a compile-time type test**

Create `tests/types.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import type { GridParams, ExportParams, PlayMode } from '../src/shared/types'

describe('shared types', () => {
  it('GridParams accepts a horizontal-strip shape', () => {
    const g: GridParams = { cols: 8, rows: 1, frameW: 256, frameH: 256 }
    expect(g.cols).toBe(8)
  })

  it('ExportParams accepts a loop export with all fields', () => {
    const e: ExportParams = {
      fps: 12,
      playMode: 'loop',
      loopCount: 3,
      durationSec: 0,
      scale: 1,
      bgColor: '#000000'
    }
    const m: PlayMode = e.playMode
    expect(m).toBe('loop')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails (module not found)**

Run:
```bash
npx vitest run tests/types.test.ts
```
Expected: FAIL — `Cannot find module '../src/shared/types'`.

- [ ] **Step 3: Create `src/shared/types.ts`**

```ts
export interface GridParams {
  /** Number of columns in the sprite sheet. */
  cols: number
  /** Number of rows. Phase A locks this to 1; Phase B unlocks it. */
  rows: number
  /** Width of a single frame in source pixels. */
  frameW: number
  /** Height of a single frame in source pixels. */
  frameH: number
}

export type PlayMode = 'once' | 'loop' | 'duration'

export interface ExportParams {
  /** Frames per second of the output video. 1–30. */
  fps: number
  /** How the source cycle maps to output frames. */
  playMode: PlayMode
  /** Used when playMode === 'loop'. Number of times to repeat the cycle. */
  loopCount: number
  /** Used when playMode === 'duration'. Target output length in seconds. */
  durationSec: number
  /** Integer upscaling factor. */
  scale: 1 | 2 | 4
  /** Background color (hex) composited behind transparent pixels. */
  bgColor: string
}

/** Payload sent from renderer to main for encoding. */
export interface EncodeRequest {
  fps: number
  outPath: string
}

/** A single frame as a PNG-encoded buffer. */
export type PngFrame = Uint8Array
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npx vitest run tests/types.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts tests/types.test.ts
git commit -m "feat(shared): add GridParams, ExportParams, and encoding types"
```

---

## Task 3: Frame detector (Phase A — horizontal strip)

**Files:**
- Create: `src/renderer/src/lib/frameDetector.ts`
- Test: `tests/frameDetector.test.ts`

The detector is a pure function: given source pixel dimensions, propose `cols`/`rows`/`frameW`/`frameH`. Phase A always returns `rows = 1`.

- [ ] **Step 1: Write failing tests**

Create `tests/frameDetector.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { detectGrid, isEvenlyDivisible } from '../src/renderer/src/lib/frameDetector'

describe('detectGrid (horizontal strip)', () => {
  it('guesses 8 columns for a 2048x256 strip', () => {
    expect(detectGrid(2048, 256)).toEqual({
      cols: 8, rows: 1, frameW: 256, frameH: 256
    })
  })

  it('guesses 8 columns for a 1024x128 strip', () => {
    expect(detectGrid(1024, 128)).toEqual({
      cols: 8, rows: 1, frameW: 128, frameH: 128
    })
  })

  it('falls back to a single frame for a square image', () => {
    expect(detectGrid(512, 512)).toEqual({
      cols: 1, rows: 1, frameW: 512, frameH: 512
    })
  })

  it('clamps to at least 1 column', () => {
    expect(detectGrid(64, 256).cols).toBe(1)
  })
})

describe('isEvenlyDivisible', () => {
  it('returns true when width divides cleanly by cols', () => {
    expect(isEvenlyDivisible(2048, 8)).toBe(true)
  })
  it('returns false otherwise', () => {
    expect(isEvenlyDivisible(2050, 8)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npx vitest run tests/frameDetector.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/renderer/src/lib/frameDetector.ts`**

```ts
import type { GridParams } from '../../../shared/types'

/**
 * Propose a grid for a horizontal sprite strip.
 * Heuristic: a single-row strip's frame is square-ish, so cols ≈ width / height.
 */
export function detectGrid(imageW: number, imageH: number): GridParams {
  const cols = Math.max(1, Math.round(imageW / imageH))
  return {
    cols,
    rows: 1,
    frameW: Math.floor(imageW / cols),
    frameH: imageH
  }
}

/** True when every column has the same integer pixel width. */
export function isEvenlyDivisible(imageW: number, cols: number): boolean {
  return cols > 0 && imageW % cols === 0
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npx vitest run tests/frameDetector.test.ts
```
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/lib/frameDetector.ts tests/frameDetector.test.ts
git commit -m "feat(frameDetector): auto-guess horizontal-strip grid"
```

---

## Task 4: Frame order (pure sequencing logic)

**Files:**
- Create: `src/renderer/src/lib/frameOrder.ts`
- Test: `tests/frameOrder.test.ts`

Given the grid (source has `cols*rows` frames, row-major) and export params, produce the ordered list of **source frame indices** to emit. This encodes `once` / `loop` / `duration` and is fully unit-testable.

- [ ] **Step 1: Write failing tests**

Create `tests/frameOrder.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { computeFrameOrder } from '../src/renderer/src/lib/frameOrder'
import type { GridParams, ExportParams } from '../src/shared/types'

const grid8: GridParams = { cols: 8, rows: 1, frameW: 256, frameH: 256 }
const base = (over: Partial<ExportParams>): ExportParams => ({
  fps: 12, playMode: 'once', loopCount: 3, durationSec: 0, scale: 1, bgColor: '#000000', ...over
})

describe('computeFrameOrder', () => {
  it('once: emits one full cycle', () => {
    expect(computeFrameOrder(grid8, base({ playMode: 'once' }))).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  it('loop: repeats the cycle loopCount times', () => {
    const order = computeFrameOrder(grid8, base({ playMode: 'loop', loopCount: 2 }))
    expect(order).toHaveLength(16)
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7])
  })

  it('duration: cycles source frames to fill T*fps slots', () => {
    const order = computeFrameOrder(grid8, base({ playMode: 'duration', durationSec: 1, fps: 10 }))
    expect(order).toHaveLength(10)
    expect(order[8]).toBe(0) // wraps around the 8-frame cycle
    expect(order[9]).toBe(1)
  })

  it('loop: clamps loopCount to at least 1', () => {
    expect(computeFrameOrder(grid8, base({ playMode: 'loop', loopCount: 0 }))).toHaveLength(8)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npx vitest run tests/frameOrder.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/renderer/src/lib/frameOrder.ts`**

```ts
import type { GridParams, ExportParams } from '../../../shared/types'

/**
 * Returns the ordered list of source-frame indices to render.
 * Source frames are indexed row-major: index = row*cols + col.
 */
export function computeFrameOrder(grid: GridParams, exp: ExportParams): number[] {
  const cycle = grid.cols * grid.rows
  if (cycle < 1) return []

  switch (exp.playMode) {
    case 'once':
      return range(cycle)
    case 'loop': {
      const repeats = Math.max(1, Math.floor(exp.loopCount))
      const out: number[] = []
      for (let r = 0; r < repeats; r++) out.push(...range(cycle))
      return out
    }
    case 'duration': {
      const total = Math.max(1, Math.round(exp.durationSec * exp.fps))
      const out: number[] = []
      for (let i = 0; i < total; i++) out.push(i % cycle)
      return out
    }
  }
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npx vitest run tests/frameOrder.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/lib/frameOrder.ts tests/frameOrder.test.ts
git commit -m "feat(frameOrder): pure once/loop/duration sequencing"
```

---

## Task 5: ffmpeg path wrapper

**Files:**
- Create: `src/main/ffmpeg.ts`
- Test: `tests/ffmpeg.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/ffmpeg.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { getFfmpegPath } from '../src/main/ffmpeg'

describe('getFfmpegPath', () => {
  it('returns a non-empty path string', () => {
    const p = getFfmpegPath()
    expect(typeof p).toBe('string')
    expect(p.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npx vitest run tests/ffmpeg.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/main/ffmpeg.ts`**

```ts
import ffmpegStatic from 'ffmpeg-static'

/**
 * Resolves the bundled ffmpeg binary path. ffmpeg-static's default export is the
 * absolute path to the platform binary (or null/undefined if it failed to install).
 */
export function getFfmpegPath(): string {
  const path = ffmpegStatic as unknown as string | null | undefined
  if (!path) {
    throw new Error('ffmpeg-static binary not found. Run `npm install` to fetch it.')
  }
  return path
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npx vitest run tests/ffmpeg.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/ffmpeg.ts tests/ffmpeg.test.ts
git commit -m "feat(main): add ffmpeg-static path wrapper"
```

---

## Task 6: Temp filesystem helpers

**Files:**
- Create: `src/main/tempfs.ts`
- Test: `tests/tempfs.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/tempfs.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { existsSync } from 'fs'
import { createTempDir, cleanTempDir, writeFrames } from '../src/main/tempfs'
import { join } from 'path'

describe('tempfs', () => {
  it('createTempDir returns an existing directory and cleanTempDir removes it', async () => {
    const dir = await createTempDir()
    expect(existsSync(dir)).toBe(true)
    await cleanTempDir(dir)
    expect(existsSync(dir)).toBe(false)
  })

  it('writeFrames writes zero-padded frame_NNNN.png files', async () => {
    const dir = await createTempDir()
    await writeFrames(dir, [Uint8Array.of(1), Uint8Array.of(2), Uint8Array.of(3)])
    expect(existsSync(join(dir, 'frame_0001.png'))).toBe(true)
    expect(existsSync(join(dir, 'frame_0002.png'))).toBe(true)
    expect(existsSync(join(dir, 'frame_0003.png'))).toBe(true)
    expect(existsSync(join(dir, 'frame_0004.png'))).toBe(false)
    await cleanTempDir(dir)
  })

  it('cleanTempDir does not throw on a missing directory', async () => {
    await expect(cleanTempDir(join(dir_for_nonexistent()))).resolves.toBeUndefined()
  })
})

function dir_for_nonexistent(): string {
  return join(__dirname, 'definitely-not-here-' + Date.now())
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npx vitest run tests/tempfs.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/main/tempfs.ts`**

```ts
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

/** Create a unique temp directory for one export job. */
export async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'stripe2video-'))
}

/** Remove a temp directory recursively; never throws. */
export async function cleanTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true })
}

/** Write PNG frame buffers as frame_0001.png, frame_0002.png, ... */
export async function writeFrames(dir: string, frames: Uint8Array[]): Promise<void> {
  for (let i = 0; i < frames.length; i++) {
    const name = `frame_${String(i + 1).padStart(4, '0')}.png`
    await writeFile(join(dir, name), frames[i])
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npx vitest run tests/tempfs.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/tempfs.ts tests/tempfs.test.ts
git commit -m "feat(main): add temp dir and frame-writing helpers"
```

---

## Task 7: Encoder (integration test with real ffmpeg)

**Files:**
- Create: `src/main/encoder.ts`
- Test: `tests/encoder.test.ts`

The encoder takes PNG `Uint8Array[]` + `{ fps, outPath }`, writes them to a temp dir, runs ffmpeg, and returns the output path. Progress is reported via a callback.

- [ ] **Step 1: Write failing integration test**

Create `tests/encoder.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { existsSync, statSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { PNG } from 'pngjs'
import { encodeVideo } from '../src/main/encoder'

function solidPng(w: number, h: number, rgb: [number, number, number]): Uint8Array {
  const png = new PNG({ width: w, height: h })
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = rgb[0]
    png.data[i + 1] = rgb[1]
    png.data[i + 2] = rgb[2]
    png.data[i + 3] = 255
  }
  return PNG.sync.write(png) as unknown as Uint8Array
}

describe('encodeVideo (integration)', () => {
  it('produces a non-empty MP4 from PNG frames', async () => {
    const frames = [solidPng(8, 8, [255, 0, 0]), solidPng(8, 8, [0, 255, 0])]
    const outPath = join(tmpdir(), `stripe2video-test-${Date.now()}.mp4`)

    const result = await encodeVideo(frames, { fps: 2, outPath })

    expect(result).toBe(outPath)
    expect(existsSync(outPath)).toBe(true)
    expect(statSync(outPath).size).toBeGreaterThan(0)
  }, 30000)

  it('reports progress between 0 and 100', async () => {
    const frames = Array.from({ length: 4 }, (_, i) => solidPng(4, 4, [i * 60, 0, 0]))
    const outPath = join(tmpdir(), `stripe2video-prog-${Date.now()}.mp4`)
    const seen: number[] = []

    await encodeVideo(frames, { fps: 4, outPath, onProgress: (p) => seen.push(p) })

    expect(seen.length).toBeGreaterThan(0)
    expect(Math.max(...seen)).toBeLessThanOrEqual(100)
  }, 30000)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npx vitest run tests/encoder.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/main/encoder.ts`**

```ts
import ffmpeg from 'fluent-ffmpeg'
import { join } from 'path'
import { getFfmpegPath } from './ffmpeg'
import { createTempDir, cleanTempDir, writeFrames } from './tempfs'

ffmpeg.setFfmpegPath(getFfmpegPath())

export interface EncodeOptions {
  fps: number
  outPath: string
  onProgress?: (percent: number) => void
}

/**
 * Encode an ordered list of PNG buffers into an MP4 (H.264 / yuv420p).
 * Frames are written to a temp dir as frame_0001.png ... and fed to ffmpeg.
 * The temp dir is always cleaned up.
 */
export function encodeVideo(frames: Uint8Array[], opts: EncodeOptions): Promise<string> {
  return new Promise<string>(async (resolve, reject) => {
    const dir = await createTempDir()
    try {
      await writeFrames(dir, frames)

      const cmd = ffmpeg()
        .input(join(dir, 'frame_%04d.png'))
        .inputOptions(['-start_number 1', `-framerate ${opts.fps}`])
        .outputOptions(['-c:v libx264', '-pix_fmt yuv420p'])
        .on('progress', (p: { percent?: number }) => {
          if (typeof p.percent === 'number') opts.onProgress?.(p.percent)
        })
        .on('error', (err: Error) => reject(err))
        .on('end', () => resolve(opts.outPath))

      cmd.save(opts.outPath)
    } catch (err) {
      await cleanTempDir(dir)
      reject(err)
    }

    // Cleanup hook: ffmpeg 'end'/'error' have fired by the time the promise
    // settles, so we attach a finalizer via the promise chain below.
    void (await cleanTempDir(dir)).catch(() => undefined)
  }).then(async (result) => {
    // Best-effort cleanup is already triggered above on error; on success the
    // temp dir is left until here.
    return result
  })
}
```

> **Note:** The cleanup-via-await above is intentionally defensive. If you find it leaves the temp dir behind on success, refactor so the `ffmpeg().on('end'/'error')` handler triggers `cleanTempDir(dir)` and *then* resolves/rejects. A cleaner version is:

Replace the whole `encodeVideo` body with this final version:

```ts
export function encodeVideo(frames: Uint8Array[], opts: EncodeOptions): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let tempDir = ''
    createTempDir()
      .then((dir) => {
        tempDir = dir
        return writeFrames(dir, frames)
      })
      .then(() => {
        const cmd = ffmpeg()
          .input(join(tempDir, 'frame_%04d.png'))
          .inputOptions(['-start_number 1', `-framerate ${opts.fps}`])
          .outputOptions(['-c:v libx264', '-pix_fmt yuv420p'])
          .on('progress', (p: { percent?: number }) => {
            if (typeof p.percent === 'number') opts.onProgress?.(p.percent)
          })
          .on('end', () => {
            void cleanTempDir(tempDir).finally(() => resolve(opts.outPath))
          })
          .on('error', (err: Error) => {
            void cleanTempDir(tempDir).finally(() => reject(err))
          })
        cmd.save(opts.outPath)
      })
      .catch((err) => reject(err))
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npx vitest run tests/encoder.test.ts
```
Expected: PASS (2 tests). The test may take a few seconds while ffmpeg encodes.

- [ ] **Step 5: Commit**

```bash
git add src/main/encoder.ts tests/encoder.test.ts
git commit -m "feat(main): PNG-sequence to MP4 encoder via fluent-ffmpeg"
```

---

## Task 8: Frame renderer (canvas glue)

**Files:**
- Create: `src/renderer/src/lib/frameRenderer.ts`

This module draws each source frame (per `computeFrameOrder`) onto an `OffscreenCanvas` at the target scale with the background composited, and returns PNG buffers. It is canvas glue built on the already-tested `computeFrameOrder`; verification is manual (Task 16 end-to-end).

- [ ] **Step 1: Implement `src/renderer/src/lib/frameRenderer.ts`**

```ts
import type { GridParams, ExportParams, PngFrame } from '../../../shared/types'
import { computeFrameOrder } from './frameOrder'

export interface RenderResult {
  frames: PngFrame[]
  width: number
  height: number
}

/**
 * Render the ordered output frames as PNG buffers.
 * - Nearest-neighbor scaling (imageSmoothingEnabled = false) keeps pixels crisp.
 * - Transparent source pixels are composited over `bgColor` (MP4 has no alpha).
 */
export async function renderFrames(
  source: ImageBitmap,
  grid: GridParams,
  exp: ExportParams
): Promise<RenderResult> {
  const order = computeFrameOrder(grid, exp)
  const tw = grid.frameW * exp.scale
  const th = grid.frameH * exp.scale
  const frames: PngFrame[] = []

  for (const index of order) {
    const col = index % grid.cols
    const row = Math.floor(index / grid.cols)

    const canvas = new OffscreenCanvas(tw, th)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Failed to get 2D context for OffscreenCanvas')

    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = exp.bgColor
    ctx.fillRect(0, 0, tw, th)
    ctx.drawImage(
      source,
      col * grid.frameW, row * grid.frameH, grid.frameW, grid.frameH,
      0, 0, tw, th
    )

    const blob = await canvas.convertToBlob({ type: 'image/png' })
    frames.push(new Uint8Array(await blob.arrayBuffer()))
  }

  return { frames, width: tw, height: th }
}
```

- [ ] **Step 2: Verify it type-checks**

Run:
```bash
npx tsc --noEmit -p tsconfig.web.json
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/lib/frameRenderer.ts
git commit -m "feat(renderer): render ordered frames to PNG via OffscreenCanvas"
```

---

## Task 9: IPC layer (preload + main handlers)

**Files:**
- Modify: `src/preload/index.ts`, `src/preload/index.d.ts`
- Modify: `src/main/index.ts` (import IPC registration)
- Create: `src/main/ipc.ts`

The preload exposes `window.api`: `pickSavePath()`, `encodeVideo(frames, req, onProgress)`. Main registers matching handlers.

- [ ] **Step 1: Implement `src/preload/index.ts`**

```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { EncodeRequest, PngFrame } from '../shared/types'

const api = {
  /** Show a save dialog and return the chosen path (or null if cancelled). */
  pickSavePath: (): Promise<string | null> => ipcRenderer.invoke('dialog:save'),

  /**
   * Encode frames to MP4. Resolves with the output path on success.
   * onProgress receives a 0–100 percent value.
   */
  encodeVideo: (
    frames: PngFrame[],
    req: EncodeRequest,
    onProgress?: (percent: number) => void
  ): Promise<string> => {
    const listener = (_e: unknown, percent: number): void => onProgress?.(percent)
    if (onProgress) ipcRenderer.on('encode:progress', listener)
    return ipcRenderer.invoke('encode:video', frames, req).then((result: string) => {
      if (onProgress) ipcRenderer.removeListener('encode:progress', listener)
      return result
    })
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
```

- [ ] **Step 2: Implement `src/preload/index.d.ts`**

```ts
import type { Api } from './index'

declare global {
  interface Window {
    api: Api
  }
}

export {}
```

- [ ] **Step 3: Implement `src/main/ipc.ts`**

```ts
import { ipcMain, dialog, BrowserWindow } from 'electron'
import { encodeVideo } from './encoder'
import type { EncodeRequest } from '../shared/types'

export function registerIpcHandlers(): void {
  ipcMain.handle('dialog:save', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await (win
      ? dialog.showSaveDialog(win, {
          title: 'Export MP4',
          defaultPath: 'stripe2video.mp4',
          filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
        })
      : dialog.showSaveDialog({
          title: 'Export MP4',
          defaultPath: 'stripe2video.mp4',
          filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
        }))
    return result.canceled ? null : result.filePath
  })

  ipcMain.handle('encode:video', async (event, frames: Uint8Array[], req: EncodeRequest) => {
    return encodeVideo(frames, {
      fps: req.fps,
      outPath: req.outPath,
      onProgress: (percent) => {
        event.sender.send('encode:progress', percent)
      }
    })
  })
}
```

- [ ] **Step 4: Register handlers in `src/main/index.ts`**

Add the import and a call inside `app.whenReady().then(...)`. Replace the `createWindow`-only block:

```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

void app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 5: Verify the build compiles**

Run:
```bash
npm run build
```
Expected: main, preload, and renderer all build without errors.

- [ ] **Step 6: Commit**

```bash
git add src/preload/index.ts src/preload/index.d.ts src/main/ipc.ts src/main/index.ts
git commit -m "feat(ipc): expose encode + save-dialog API via contextBridge"
```

---

## Task 10: Dropzone component

**Files:**
- Create: `src/renderer/src/components/Dropzone.tsx`

- [ ] **Step 1: Implement `src/renderer/src/components/Dropzone.tsx`**

```tsx
import { useCallback, useRef, useState } from 'react'

interface DropzoneProps {
  onImage: (bitmap: ImageBitmap, width: number, height: number, fileName: string) => void
}

export function Dropzone({ onImage }: DropzoneProps): JSX.Element {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) return
      const bitmap = await createImageBitmap(file)
      onImage(bitmap, bitmap.width, bitmap.height, file.name)
    },
    [onImage]
  )

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files[0]
        if (file) void load(file)
      }}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragging ? '#646cff' : '#888'}`,
        borderRadius: 8,
        padding: 16,
        textAlign: 'center',
        cursor: 'pointer',
        background: dragging ? '#1a1a2e' : 'transparent'
      }}
    >
      拖入精灵图，或点击选择（PNG / JPG / WebP）
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void load(file)
        }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/Dropzone.tsx
git commit -m "feat(ui): add Dropzone component"
```

---

## Task 11: PreviewCanvas (grid overlay)

**Files:**
- Create: `src/renderer/src/components/PreviewCanvas.tsx`

Draws the source bitmap scaled to fit, with a grid overlay drawn from `GridParams`. Warns when the source width isn't evenly divisible.

- [ ] **Step 1: Implement `src/renderer/src/components/PreviewCanvas.tsx`**

```tsx
import { useEffect, useRef } from 'react'
import type { GridParams } from '../../../shared/types'
import { isEvenlyDivisible } from '../lib/frameDetector'

interface PreviewCanvasProps {
  source: ImageBitmap
  width: number
  height: number
  grid: GridParams
}

const MAX_W = 720

export function PreviewCanvas({ source, width, height, grid }: PreviewCanvasProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fit = Math.min(1, MAX_W / width)
  const displayW = Math.round(width * fit)
  const displayH = Math.round(height * fit)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, displayW, displayH)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(source, 0, 0, displayW, displayH)

    // Grid overlay
    const colW = (grid.frameW * fit)
    const rowH = (grid.frameH * fit)
    ctx.strokeStyle = 'rgba(100,108,255,0.9)'
    ctx.lineWidth = 1
    for (let c = 0; c <= grid.cols; c++) {
      const x = Math.round(colW * c) + 0.5
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, displayH)
      ctx.stroke()
    }
    for (let r = 0; r <= grid.rows; r++) {
      const y = Math.round(rowH * r) + 0.5
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(displayW, y)
      ctx.stroke()
    }
  }, [source, displayW, displayH, grid, fit])

  const evenlyDivisible = isEvenlyDivisible(width, grid.cols)

  return (
    <div>
      <canvas ref={canvasRef} width={displayW} height={displayH} style={{ imageRendering: 'pixelated' }} />
      {!evenlyDivisible && (
        <p style={{ color: '#ff9800', fontSize: 13 }}>
          ⚠ 图宽 {width}px 不能被 {grid.cols} 列整除，导出时会裁掉余数像素。
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/PreviewCanvas.tsx
git commit -m "feat(ui): add PreviewCanvas with adjustable grid overlay"
```

---

## Task 12: AnimationPreview

**Files:**
- Create: `src/renderer/src/components/AnimationPreview.tsx`

Plays the sliced frames at the current FPS so the user can confirm the animation before exporting.

- [ ] **Step 1: Implement `src/renderer/src/components/AnimationPreview.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import type { GridParams, ExportParams } from '../../../shared/types'

interface AnimationPreviewProps {
  source: ImageBitmap
  grid: GridParams
  exp: ExportParams
}

export function AnimationPreview({ source, grid, exp }: AnimationPreviewProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [playing, setPlaying] = useState(true)
  const cycle = grid.cols * grid.rows

  useEffect(() => {
    if (!playing || cycle < 1) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const tw = grid.frameW * exp.scale
    const th = grid.frameH * exp.scale
    canvas.width = tw
    canvas.height = th
    ctx.imageSmoothingEnabled = false

    let i = 0
    const interval = window.setInterval(() => {
      const col = i % grid.cols
      const row = Math.floor(i / grid.cols)
      ctx.fillStyle = exp.bgColor
      ctx.fillRect(0, 0, tw, th)
      ctx.drawImage(
        source,
        col * grid.frameW, row * grid.frameH, grid.frameW, grid.frameH,
        0, 0, tw, th
      )
      i = (i + 1) % cycle
    }, 1000 / exp.fps)

    return () => window.clearInterval(interval)
  }, [source, grid, exp, playing, cycle])

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => setPlaying((p) => !p)}>{playing ? '⏸ 暂停' : '▶ 播放'}</button>
        <span style={{ fontSize: 13, color: '#aaa' }}>动画预览（{exp.fps} FPS）</span>
      </div>
      <canvas ref={canvasRef} style={{ imageRendering: 'pixelated', marginTop: 8, border: '1px solid #333' }} />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/AnimationPreview.tsx
git commit -m "feat(ui): add AnimationPreview player"
```

---

## Task 13: Controls panel

**Files:**
- Create: `src/renderer/src/components/Controls.tsx`

- [ ] **Step 1: Implement `src/renderer/src/components/Controls.tsx`**

```tsx
import type { GridParams, ExportParams, PlayMode } from '../../../shared/types'

interface ControlsProps {
  grid: GridParams
  exportParams: ExportParams
  showRows: boolean
  onGridChange: (g: GridParams) => void
  onExportChange: (e: ExportParams) => void
}

const label: React.CSSProperties = { display: 'block', fontSize: 13, marginTop: 12, marginBottom: 4 }
const row: React.CSSProperties = { display: 'flex', gap: 12, alignItems: 'center' }

export function Controls({
  grid, exportParams, showRows, onGridChange, onExportChange
}: ControlsProps): JSX.Element {
  const setExp = (patch: Partial<ExportParams>): void =>
    onExportChange({ ...exportParams, ...patch })

  return (
    <div style={{ minWidth: 220 }}>
      <h3 style={{ marginTop: 0 }}>网格</h3>
      <label style={label}>列数</label>
      <input
        type="number" min={1} value={grid.cols}
        onChange={(e) => onGridChange({ ...grid, cols: Math.max(1, Number(e.target.value)) })}
      />
      {showRows && (
        <>
          <label style={label}>行数</label>
          <input
            type="number" min={1} value={grid.rows}
            onChange={(e) => onGridChange({ ...grid, rows: Math.max(1, Number(e.target.value)) })}
          />
        </>
      )}

      <h3>导出</h3>
      <label style={label}>FPS</label>
      <input
        type="number" min={1} max={30} value={exportParams.fps}
        onChange={(e) => setExp({ fps: Math.min(30, Math.max(1, Number(e.target.value))) })}
      />

      <label style={label}>播放模式</label>
      <div style={row}>
        {(['once', 'loop', 'duration'] as PlayMode[]).map((m) => (
          <label key={m} style={{ fontSize: 13 }}>
            <input
              type="radio" name="playmode" checked={exportParams.playMode === m}
              onChange={() => setExp({ playMode: m })}
            />{' '}
            {m === 'once' ? '单次' : m === 'loop' ? '循环' : '目标时长'}
          </label>
        ))}
      </div>

      {exportParams.playMode === 'loop' && (
        <>
          <label style={label}>循环次数</label>
          <input
            type="number" min={1} value={exportParams.loopCount}
            onChange={(e) => setExp({ loopCount: Math.max(1, Number(e.target.value)) })}
          />
        </>
      )}
      {exportParams.playMode === 'duration' && (
        <>
          <label style={label}>目标时长（秒）</label>
          <input
            type="number" min={0.1} step={0.1} value={exportParams.durationSec}
            onChange={(e) => setExp({ durationSec: Math.max(0.1, Number(e.target.value)) })}
          />
        </>
      )}

      <label style={label}>缩放</label>
      <select
        value={exportParams.scale}
        onChange={(e) => setExp({ scale: Number(e.target.value) as ExportParams['scale'] })}
      >
        <option value={1}>1×</option>
        <option value={2}>2×</option>
        <option value={4}>4×</option>
      </select>

      <label style={label}>背景色</label>
      <input
        type="color"
        value={exportParams.bgColor}
        onChange={(e) => setExp({ bgColor: e.target.value })}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/Controls.tsx
git commit -m "feat(ui): add Controls panel for grid + export params"
```

---

## Task 14: ExportBar

**Files:**
- Create: `src/renderer/src/components/ExportBar.tsx`

- [ ] **Step 1: Implement `src/renderer/src/components/ExportBar.tsx`**

```tsx
import type { GridParams, ExportParams } from '../../../shared/types'
import { renderFrames } from '../lib/frameRenderer'

interface ExportBarProps {
  source: ImageBitmap
  grid: GridParams
  exportParams: ExportParams
  disabled: boolean
}

export function ExportBar({ source, grid, exportParams, disabled }: ExportBarProps): JSX.Element {
  let progress = 0
  let label = '导出 MP4'

  // Progress/label are driven imperatively below; keep simple refs via closure.
  const handleExport = async (): Promise<void> => {
    const outPath = await window.api.pickSavePath()
    if (!outPath) return

    const button = document.getElementById('export-btn') as HTMLButtonElement | null
    const bar = document.getElementById('export-progress') as HTMLDivElement | null
    const setText = (t: string): void => { if (button) button.textContent = t }
    const setProg = (p: number): void => { if (bar) bar.style.width = `${p}%` }

    try {
      setText('渲染帧中…')
      setProg(0)
      const { frames } = await renderFrames(source, grid, exportParams)

      setText('编码中…')
      await window.api.encodeVideo(
        frames,
        { fps: exportParams.fps, outPath },
        (p) => setProg(Math.min(100, Math.max(0, p)))
      )
      setText('导出 MP4')
      setProg(100)
      alert(`导出成功：${outPath}`)
    } catch (err) {
      setText('导出 MP4')
      setProg(0)
      alert(`导出失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <button id="export-btn" disabled={disabled} onClick={() => void handleExport()}>
        {label}
      </button>
      <div style={{ width: '100%', height: 8, background: '#333', borderRadius: 4, marginTop: 8, overflow: 'hidden' }}>
        <div id="export-progress" style={{ width: `${progress}%`, height: '100%', background: '#646cff', transition: 'width 0.2s' }} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/ExportBar.tsx
git commit -m "feat(ui): add ExportBar with progress"
```

---

## Task 15: App composition (Phase A end-to-end)

**Files:**
- Create: `src/renderer/src/App.tsx`, `src/renderer/src/App.css`
- Modify: `src/renderer/src/main.tsx`

- [ ] **Step 1: Implement `src/renderer/src/App.tsx`**

```tsx
import { useCallback, useMemo, useState } from 'react'
import type { GridParams, ExportParams } from '../../shared/types'
import { detectGrid } from './lib/frameDetector'
import { Dropzone } from './components/Dropzone'
import { PreviewCanvas } from './components/PreviewCanvas'
import { AnimationPreview } from './components/AnimationPreview'
import { Controls } from './components/Controls'
import { ExportBar } from './components/ExportBar'
import './App.css'

interface LoadedImage {
  bitmap: ImageBitmap
  width: number
  height: number
  name: string
}

const defaultExport: ExportParams = {
  fps: 12,
  playMode: 'loop',
  loopCount: 3,
  durationSec: 1,
  scale: 1,
  bgColor: '#000000'
}

export default function App(): JSX.Element {
  const [image, setImage] = useState<LoadedImage | null>(null)
  const [grid, setGrid] = useState<GridParams | null>(null)
  const [exportParams, setExportParams] = useState<ExportParams>(defaultExport)

  const onImage = useCallback((bitmap: ImageBitmap, width: number, height: number, name: string) => {
    setImage({ bitmap, width, height, name })
    setGrid(detectGrid(width, height))
  }, [])

  const ready = useMemo(() => image !== null && grid !== null && grid.cols * grid.rows >= 1, [image, grid])

  return (
    <div className="app">
      <header className="header">
        <h1>Stripe2Video</h1>
        <Dropzone onImage={onImage} />
      </header>

      {ready && image && grid && (
        <main className="main">
          <section className="preview">
            <PreviewCanvas source={image.bitmap} width={image.width} height={image.height} grid={grid} />
            <AnimationPreview source={image.bitmap} grid={grid} exp={exportParams} />
          </section>
          <aside className="sidebar">
            <Controls
              grid={grid}
              exportParams={exportParams}
              showRows={false}
              onGridChange={setGrid}
              onExportChange={setExportParams}
            />
            <ExportBar
              source={image.bitmap}
              grid={grid}
              exportParams={exportParams}
              disabled={!ready}
            />
          </aside>
        </main>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Implement `src/renderer/src/App.css`**

```css
:root { color-scheme: dark; }
body { margin: 0; background: #0f0f17; color: #e6e6e6; font-family: system-ui, sans-serif; }
.app { padding: 16px; }
.header h1 { margin: 0 0 12px; font-size: 20px; }
.main { display: flex; gap: 16px; margin-top: 16px; align-items: flex-start; }
.preview { flex: 1; min-width: 0; }
.sidebar { width: 260px; flex-shrink: 0; padding: 12px; border: 1px solid #2a2a3a; border-radius: 8px; }
input[type="number"], select { background: #1a1a2e; color: #e6e6e6; border: 1px solid #333; border-radius: 4px; padding: 4px 6px; }
button { background: #646cff; color: white; border: none; border-radius: 6px; padding: 8px 14px; cursor: pointer; font-size: 14px; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
```

- [ ] **Step 3: Wire `App` into `src/renderer/src/main.tsx`**

```tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 4: Manual end-to-end verification**

Run:
```bash
npm run dev
```
Verify in the window:
1. Drop a horizontal sprite strip (e.g. `下劈.png`) in.
2. The grid overlay appears; columns auto-guessed.
3. Adjust column count — overlay updates live.
4. Animation preview plays the sliced frames.
5. Click "导出 MP4", pick a path, wait — an MP4 is produced that plays the animation looped 3×.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/App.css src/renderer/src/main.tsx
git commit -m "feat(ui): compose App and wire Phase A end-to-end"
```

---

## Task 16: Phase B — grid detection (multi-row)

**Files:**
- Modify: `src/renderer/src/lib/frameDetector.ts`
- Test: `tests/frameDetector.test.ts`

Extend `detectGrid` with an optional `allowGrid` flag. When true and the image is taller than one frame, it also proposes `rows`.

- [ ] **Step 1: Add failing tests**

Append to `tests/frameDetector.test.ts`:
```ts
import { detectGrid as detectGrid2 } from '../src/renderer/src/lib/frameDetector'

describe('detectGrid (grid)', () => {
  it('detects rows for a multi-row sheet with square cells', () => {
    // 1024x512 with ~128px frames => 8 cols x 4 rows
    expect(detectGrid2(1024, 512, { allowGrid: true })).toEqual({
      cols: 8, rows: 4, frameW: 128, frameH: 128
    })
  })

  it('still returns rows=1 when allowGrid is false', () => {
    expect(detectGrid2(1024, 512)).toEqual({
      cols: 2, rows: 1, frameW: 512, frameH: 512
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npx vitest run tests/frameDetector.test.ts
```
Expected: FAIL — `detectGrid` doesn't accept a second argument / returns wrong rows.

- [ ] **Step 3: Update `src/renderer/src/lib/frameDetector.ts`**

```ts
import type { GridParams } from '../../../shared/types'

export interface DetectOptions {
  /** When true, also guess rows for a multi-row sheet. Default false (horizontal strip). */
  allowGrid?: boolean
}

export function detectGrid(imageW: number, imageH: number, options: DetectOptions = {}): GridParams {
  const cols = Math.max(1, Math.round(imageW / imageH))
  const frameW = Math.floor(imageW / cols)

  if (!options.allowGrid) {
    return { cols, rows: 1, frameW, frameH: imageH }
  }

  // Keep cells square-ish: rows ≈ height / frameW.
  const rows = Math.max(1, Math.round(imageH / frameW))
  return { cols, rows, frameW, frameH: Math.floor(imageH / rows) }
}

export function isEvenlyDivisible(imageW: number, cols: number): boolean {
  return cols > 0 && imageW % cols === 0
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npx vitest run tests/frameDetector.test.ts
```
Expected: PASS (all, including new grid tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/lib/frameDetector.ts tests/frameDetector.test.ts
git commit -m "feat(frameDetector): support multi-row grid detection"
```

---

## Task 17: Phase B — rows control in the UI

**Files:**
- Modify: `src/renderer/src/App.tsx`

Re-detect with `allowGrid: true` when the user can edit rows, and show the rows control.

- [ ] **Step 1: Update `src/renderer/src/App.tsx`**

Change the `onImage` callback to detect a grid, and flip `showRows` to `true`:

```tsx
  const onImage = useCallback((bitmap: ImageBitmap, width: number, height: number, name: string) => {
    setImage({ bitmap, width, height, name })
    setGrid(detectGrid(width, height, { allowGrid: true }))
  }, [])
```

And in the JSX, change `showRows={false}` to `showRows={true}`:
```tsx
            <Controls
              grid={grid}
              exportParams={exportParams}
              showRows={true}
              onGridChange={setGrid}
              onExportChange={setExportParams}
            />
```

- [ ] **Step 2: Manual verification**

Run:
```bash
npm run dev
```
Verify: dropping a multi-row sprite sheet guesses both rows and columns; the rows input is visible and editable; animation preview and export still work.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat(ui): enable rows control for grid sprite sheets"
```

---

## Task 18: Packaging (electron-builder)

**Files:**
- Create: `electron-builder.yml`
- Verify `build:win` script (already in `package.json`).

- [ ] **Step 1: Create `electron-builder.yml`**

```yaml
appId: com.stripe2video.app
productName: Stripe2Video
directories:
  output: dist
  buildResources: build
files:
  - out/**/*
  - package.json
# ffmpeg-static ships a platform binary resolved at runtime from node_modules,
# so it must be packaged. electron-builder includes dependencies by default.
win:
  target: nsis
```

- [ ] **Step 2: Verify a production build + package**

Run:
```bash
npm run build:win
```
Expected: produces an installer under `dist/` (e.g. `Stripe2Video Setup 0.1.0.exe`). Note: the first run downloads/uses the packaged ffmpeg binary.

- [ ] **Step 3: Commit**

```bash
git add electron-builder.yml
git commit -m "build: add electron-builder packaging config for Windows"
```

---

## Self-Review (completed)

**1. Spec coverage**
- Sprite sheet → MP4, horizontal first then grid → Tasks 1–15 (Phase A), 16–17 (Phase B). ✓
- Auto-guess + manual + live grid preview → Tasks 3, 11, 13. ✓
- Animation preview → Task 12. ✓
- Export params (FPS, once/loop/duration, scale, bg) → Tasks 4, 13, 14. ✓
- H.264/yuv420p MP4 → Task 7 encoder. ✓
- Two-process architecture + IPC → Tasks 5–9. ✓
- Module isolation (pure vs glue) → Tasks 3/4 (pure), 8 (glue). ✓
- Error handling (non-divisible warning, empty-grid disable) → Tasks 11, 15. ✓
- Testing strategy (unit for pure, integration for encoder) → Tasks 2–7. ✓
- Tech stack & scaffolding → Task 1. ✓
- Assumptions (defaults in `defaultExport`) → Task 15. ✓
- Git management → every task commits. ✓
- Packaging → Task 18. ✓

**2. Placeholder scan** — no TBD/TODO/“add error handling” steps remain. The Task 7 encoder has a single definitive implementation (the final version replaces the draft).

**3. Type consistency** — `GridParams {cols, rows, frameW, frameH}`, `ExportParams {fps, playMode, loopCount, durationSec, scale, bgColor}`, `PngFrame = Uint8Array`, `EncodeRequest {fps, outPath}` are used consistently across types, detector, order, renderer, IPC, encoder, and UI. `renderFrames` returns `{frames, width, height}` and `ExportBar` destructures `{frames}`. ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-18-stripe2video.md`.
