export interface GridParams {
  /** Number of columns in the sprite sheet. */
  cols: number
  /** Number of rows. */
  rows: number
  /** Width of a single frame in source pixels. */
  frameW: number
  /** Height of a single frame in source pixels. */
  frameH: number
}

export type PlayMode = 'once' | 'loop' | 'duration'

export type ExportFormat = 'mp4' | 'webm' | 'png'

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
  /** Background color (hex) composited behind transparent pixels (MP4 only). */
  bgColor: string
  /** Output format. webm and png preserve transparency; mp4 composites bgColor. */
  format: ExportFormat
}

/** Payload sent from renderer to main for video encoding (mp4/webm). */
export interface EncodeRequest {
  fps: number
  outPath: string
  transparent: boolean
}

/** A single frame as a PNG-encoded buffer. */
export type PngFrame = Uint8Array

/**
 * The API surface exposed to the renderer via contextBridge (window.api).
 * Defined in shared so both the preload (implementation) and the renderer
 * (consumer) share one contract without the renderer depending on Electron.
 */
export interface Stripe2VideoApi {
  /** Show a file save dialog for the given video format and return the path (or null). */
  pickSavePath: (format: 'mp4' | 'webm') => Promise<string | null>
  /** Show a directory picker and return the chosen folder (or null). Used for PNG sequence. */
  pickDirectory: () => Promise<string | null>
  /** Write an ordered list of PNG frames as frame_0001.png ... into the given directory. */
  exportPngSequence: (frames: PngFrame[], dir: string) => Promise<string>
  /** Encode frames to MP4 or WebM. Resolves with the output path on success. */
  encodeVideo: (
    frames: PngFrame[],
    req: EncodeRequest,
    onProgress?: (percent: number) => void
  ) => Promise<string>
}
