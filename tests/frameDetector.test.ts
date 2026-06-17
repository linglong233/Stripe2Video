import { describe, it, expect } from 'vitest'
import { detectGrid, isEvenlyDivisible } from '../src/renderer/src/lib/frameDetector'

describe('detectGrid (horizontal strip)', () => {
  it('guesses 8 columns for a 2048x256 strip', () => {
    expect(detectGrid(2048, 256)).toEqual({
      cols: 8, rows: 1, frameW: 256, frameH: 256
    })
  })

  it('guesses 8 columns for a 1024x128 strip', () => {
    expect(detectGrid(1024, 128)).toEqual({
      cols: 8, rows: 1, frameW: 128, frameH: 128
    })
  })

  it('falls back to a single frame for a square image', () => {
    expect(detectGrid(512, 512)).toEqual({
      cols: 1, rows: 1, frameW: 512, frameH: 512
    })
  })

  it('clamps to at least 1 column', () => {
    expect(detectGrid(64, 256).cols).toBe(1)
  })
})

describe('isEvenlyDivisible', () => {
  it('returns true when width divides cleanly by cols', () => {
    expect(isEvenlyDivisible(2048, 8)).toBe(true)
  })
  it('returns false otherwise', () => {
    expect(isEvenlyDivisible(2050, 8)).toBe(false)
  })
})
