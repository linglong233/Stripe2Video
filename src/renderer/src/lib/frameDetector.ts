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
