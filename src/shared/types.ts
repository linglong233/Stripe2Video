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
