import type { GridParams } from '../../../shared/types'

export interface DetectOptions {
  /** When true, also guess rows for a multi-row sheet. Default false (horizontal strip). */
  allowGrid?: boolean
}

/** Build grid params by dividing image dimensions into cols × rows cells. */
export function makeGrid(imageW: number, imageH: number, cols: number, rows: number): GridParams {
  return {
    cols,
    rows,
    frameW: Math.floor(imageW / cols),
    frameH: Math.floor(imageH / rows)
  }
}

/**
 * Propose a grid for a sprite sheet.
 * Heuristic: assume square-ish frames, so cols ≈ width / height (exact for a
 * single-row strip). With allowGrid, also guess rows ≈ height / frameWidth.
 * Detection is only a starting point — the user fine-tunes against the preview.
 */
export function detectGrid(imageW: number, imageH: number, options: DetectOptions = {}): GridParams {
  const cols = Math.max(1, Math.round(imageW / imageH))
  if (!options.allowGrid) {
    return makeGrid(imageW, imageH, cols, 1)
  }
  const frameW = Math.floor(imageW / cols)
  const rows = Math.max(1, Math.round(imageH / frameW))
  return makeGrid(imageW, imageH, cols, rows)
}

/** True when every column has the same integer pixel width. */
export function isEvenlyDivisible(imageW: number, cols: number): boolean {
  return cols > 0 && imageW % cols === 0
}
