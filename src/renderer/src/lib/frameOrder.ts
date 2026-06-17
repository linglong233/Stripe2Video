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
