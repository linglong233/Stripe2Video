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

  it('reports progress between 0 and 100 on a longer clip', async () => {
    // 60 frames @ 10 fps = 6s clip, so ffmpeg reliably emits progress events.
    const frames = Array.from({ length: 60 }, (_, i) => solidPng(4, 4, [(i * 4) % 255, 0, 0]))
    const outPath = join(tmpdir(), `stripe2video-prog-${Date.now()}.mp4`)
    const seen: number[] = []

    await encodeVideo(frames, { fps: 10, outPath, onProgress: (p) => seen.push(p) })

    expect(seen.length).toBeGreaterThan(0)
    expect(Math.max(...seen)).toBeLessThanOrEqual(100)
  }, 30000)
})
