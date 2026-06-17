import type { GridParams } from '../../../shared/types'

export interface DetectOptions {
  /** When true, also guess rows for a multi-row sheet. Default false (horizontal strip). */
  allowGrid?: boolean
}

/**
 * Propose a grid for a sprite sheet.
 * Heuristic: assume square-ish frames, so cols ≈ width / height (this is exact
 * for a single-row strip where each frame is height-tall). When `allowGrid` is
 * set, also guess rows ≈ height / frameWidth. Auto-detection is only a starting
 * point — grid rows are fundamentally ambiguous from dimensions alone, so the
 * UI lets the user fine-tune against the live preview.
 */
export function detectGrid(imageW: number, imageH: number, options: DetectOptions = {}): GridParams {
  const cols = Math.max(1, Math.round(imageW / imageH))
  const frameW = Math.floor(imageW / cols)

  if (!options.allowGrid) {
    return { cols, rows: 1, frameW, frameH: imageH }
  }

  const rows = Math.max(1, Math.round(imageH / frameW))
  return { cols, rows, frameW, frameH: Math.floor(imageH / rows) }
}

/** True when every column has the same integer pixel width. */
export function isEvenlyDivisible(imageW: number, cols: number): boolean {
  return cols > 0 && imageW % cols === 0
}
