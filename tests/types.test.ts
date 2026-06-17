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
