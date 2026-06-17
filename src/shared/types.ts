export interface GridParams {
  /** Number of columns in the sprite sheet. */
  cols: number
  /** Number of rows. Phase A locks this to 1; Phase B unlocks it. */
  rows: number
  /** Width of a single frame in source pixels. */
  frameW: number
  /** Height of a single frame in source pixels. */
  frameH: number
}

export type PlayMode = 'once' | 'loop' | 'duration'

export interface ExportParams {
  /** Frames per second of the output video. 1–30. */
  fps: number
  /** How the source cycle maps to output frames. */
  playMode: PlayMode
  /** Used when playMode === 'loop'. Number of times to repeat the cycle. */
  loopCount: number
  /** Used when playMode === 'duration'. Target output length in seconds. */
  durationSec: number
  /** Integer upscaling factor. */
  scale: 1 | 2 | 4
  /** Background color (hex) composited behind transparent pixels. */
  bgColor: string
}

/** Payload sent from renderer to main for encoding. */
export interface EncodeRequest {
  fps: number
  outPath: string
}

/** A single frame as a PNG-encoded buffer. */
export type PngFrame = Uint8Array

/**
 * The API surface exposed to the renderer via contextBridge (window.api).
 * Defined in shared so both the preload (implementation) and the renderer
 * (consumer) share one contract without the renderer depending on Electron.
 */
export interface Stripe2VideoApi {
  /** Show a save dialog and return the chosen path (or null if cancelled). */
  pickSavePath: () => Promise<string | null>
  /**
   * Encode frames to MP4. Resolves with the output path on success.
   * onProgress receives a 0–100 percent value.
   */
  encodeVideo: (
    frames: PngFrame[],
    req: EncodeRequest,
    onProgress?: (percent: number) => void
  ) => Promise<string>
}
