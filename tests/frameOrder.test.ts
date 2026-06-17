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
