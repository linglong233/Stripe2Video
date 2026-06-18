import { describe, it, expect } from 'vitest'
import { existsSync, statSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { spawnSync } from 'child_process'
import { PNG } from 'pngjs'
import { encodeVideo } from '../src/main/encoder'
import { getFfmpegPath } from '../src/main/ffmpeg'

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

/** PNG with a left half fully transparent, right half opaque red (exercises alpha). */
function pngWithAlpha(w: number, h: number): Uint8Array {
  const png = new PNG({ width: w, height: h })
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (w * y + x) << 2
      png.data[i] = 255
      png.data[i + 1] = 0
      png.data[i + 2] = 0
      png.data[i + 3] = x < w / 2 ? 0 : 255
    }
  }
  return PNG.sync.write(png) as unknown as Uint8Array
}

/** Run `ffmpeg -i <out>` and return combined stdout+stderr (stream info is on stderr). */
function probeVideo(outPath: string): string {
  const r = spawnSync(getFfmpegPath(), ['-i', outPath], { encoding: 'utf8' })
  return `${r.stderr ?? ''}${r.stdout ?? ''}`
}

/**
 * Decode one frame of a transparent WebM back to an RGBA PNG and return the
 * average alpha of its left half (source-transparent) vs right half (source-opaque).
 *
 * NOTE: ffmpeg's *native* VP9 decoder cannot read VP9 alpha — only the libvpx
 * decoder can. So we force `-c:v libvpx-vp9` for decode. (Browsers use their own
 * alpha-capable VP9 decoders, so a webm that decodes transparent here is also
 * transparent in browsers.)
 */
function decodedAlphaRegions(outPath: string): { left: number; right: number } {
  const dec = join(tmpdir(), `s2v-dec-${Date.now()}.png`)
  spawnSync(getFfmpegPath(), ['-y', '-c:v', 'libvpx-vp9', '-i', outPath, '-vframes', '1', '-pix_fmt', 'rgba', dec])
  const img = PNG.sync.read(readFileSync(dec))
  const w = img.width
  const h = img.height
  let l = 0, r = 0, lc = 0, rc = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (w * y + x) << 2
      if (x < w / 2) { l += img.data[i + 3]; lc++ } else { r += img.data[i + 3]; rc++ }
    }
  }
  return { left: l / lc, right: r / rc }
}

describe('encodeVideo (integration)', () => {
  it('produces a non-empty MP4 (H.264 / yuv420p) from PNG frames', async () => {
    const frames = [solidPng(8, 8, [255, 0, 0]), solidPng(8, 8, [0, 255, 0])]
    const outPath = join(tmpdir(), `stripe2video-test-${Date.now()}.mp4`)

    const result = await encodeVideo(frames, { fps: 2, outPath, transparent: false })

    expect(result).toBe(outPath)
    expect(existsSync(outPath)).toBe(true)
    expect(statSync(outPath).size).toBeGreaterThan(0)
    const info = probeVideo(outPath)
    expect(info).toContain('h264')
    expect(info).toContain('yuv420p')
  }, 30000)

  it('reports progress between 0 and 100 on a longer clip', async () => {
    // 60 frames @ 10 fps = 6s clip, so ffmpeg reliably emits progress events.
    const frames = Array.from({ length: 60 }, (_, i) => solidPng(4, 4, [(i * 4) % 255, 0, 0]))
    const outPath = join(tmpdir(), `stripe2video-prog-${Date.now()}.mp4`)
    const seen: number[] = []

    await encodeVideo(frames, { fps: 10, outPath, transparent: false, onProgress: (p) => seen.push(p) })

    expect(seen.length).toBeGreaterThan(0)
    expect(Math.max(...seen)).toBeLessThanOrEqual(100)
  }, 30000)

  it('produces a transparent WebM whose alpha survives an encode+decode round-trip', async () => {
    const frames = [pngWithAlpha(16, 16), pngWithAlpha(16, 16)]
    const outPath = join(tmpdir(), `stripe2video-transparent-${Date.now()}.webm`)

    const result = await encodeVideo(frames, { fps: 2, outPath, transparent: true })

    expect(result).toBe(outPath)
    expect(existsSync(outPath)).toBe(true)
    expect(statSync(outPath).size).toBeGreaterThan(0)
    expect(probeVideo(outPath)).toContain('vp9')

    // Gold-standard transparency check: decode back with libvpx and verify the
    // source-transparent region is still transparent and the opaque region opaque.
    const regions = decodedAlphaRegions(outPath)
    expect(regions.left).toBeLessThan(10) // left half was transparent
    expect(regions.right).toBeGreaterThan(245) // right half was opaque
  }, 60000)
})
