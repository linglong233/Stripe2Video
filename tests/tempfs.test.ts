import { describe, it, expect } from 'vitest'
import { existsSync } from 'fs'
import { createTempDir, cleanTempDir, writeFrames } from '../src/main/tempfs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('tempfs', () => {
  it('createTempDir returns an existing directory and cleanTempDir removes it', async () => {
    const dir = await createTempDir()
    expect(existsSync(dir)).toBe(true)
    await cleanTempDir(dir)
    expect(existsSync(dir)).toBe(false)
  })

  it('writeFrames writes zero-padded frame_NNNN.png files', async () => {
    const dir = await createTempDir()
    await writeFrames(dir, [Uint8Array.of(1), Uint8Array.of(2), Uint8Array.of(3)])
    expect(existsSync(join(dir, 'frame_0001.png'))).toBe(true)
    expect(existsSync(join(dir, 'frame_0002.png'))).toBe(true)
    expect(existsSync(join(dir, 'frame_0003.png'))).toBe(true)
    expect(existsSync(join(dir, 'frame_0004.png'))).toBe(false)
    await cleanTempDir(dir)
  })

  it('cleanTempDir does not throw on a missing directory', async () => {
    const missing = join(tmpdir(), 'definitely-not-here-' + Date.now())
    await expect(cleanTempDir(missing)).resolves.toBeUndefined()
  })
})
