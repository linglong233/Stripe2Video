import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

/** Create a unique temp directory for one export job. */
export async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'stripe2video-'))
}

/** Remove a temp directory recursively; never throws. */
export async function cleanTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true })
}

/** Write PNG frame buffers as frame_0001.png, frame_0002.png, ... */
export async function writeFrames(dir: string, frames: Uint8Array[]): Promise<void> {
  for (let i = 0; i < frames.length; i++) {
    const name = `frame_${String(i + 1).padStart(4, '0')}.png`
    await writeFile(join(dir, name), frames[i])
  }
}
