import { describe, it, expect } from 'vitest'
import { getFfmpegPath } from '../src/main/ffmpeg'

describe('getFfmpegPath', () => {
  it('returns a non-empty path string', () => {
    const p = getFfmpegPath()
    expect(typeof p).toBe('string')
    expect(p.length).toBeGreaterThan(0)
  })
})
