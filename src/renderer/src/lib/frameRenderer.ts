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
 * - Opaque export: transparent source pixels composited over `bgColor` (MP4 has no alpha).
 * - Transparent export: background is left clear so the sprite's original alpha is
 *   preserved in the PNG, then encoded to VP9 + alpha as WebM.
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
    if (!exp.transparent) {
      ctx.fillStyle = exp.bgColor
      ctx.fillRect(0, 0, tw, th)
    }
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
