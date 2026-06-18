import ffmpeg from 'fluent-ffmpeg'
import { join } from 'path'
import { getFfmpegPath } from './ffmpeg'
import { createTempDir, cleanTempDir, writeFrames } from './tempfs'

ffmpeg.setFfmpegPath(getFfmpegPath())

export interface EncodeOptions {
  fps: number
  outPath: string
  /** When true, encode a transparent WebM (VP9 + yuva420p); otherwise an MP4 (H.264 / yuv420p). */
  transparent: boolean
  onProgress?: (percent: number) => void
}

interface FfmpegProgress {
  percent?: number
  timemark?: string
}

/** Parse a fluent-ffmpeg timemark ("HH:MM:SS.ss" or "MM:SS.ss") into seconds. */
function parseTimemark(t?: string): number {
  if (!t) return 0
  const parts = t.split(':').map(Number)
  if (parts.some((n) => !Number.isFinite(n))) return 0
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0] ?? 0
}

/** Output options for each mode. Transparent keeps PNG alpha via VP9 + yuva420p. */
function outputOptions(transparent: boolean): string[] {
  return transparent
    ? ['-c:v libvpx-vp9', '-pix_fmt yuva420p', '-b:v 0', '-crf 30', '-auto-alt-ref 0']
    : ['-c:v libx264', '-pix_fmt yuv420p']
}

/**
 * Encode an ordered list of PNG buffers into a video.
 * - transparent=false → MP4 (H.264 / yuv420p), transparent pixels composited over bg upstream.
 * - transparent=true  → WebM (VP9 / yuva420p), PNG alpha preserved.
 * Frames are written to a temp dir as frame_0001.png ... and fed to ffmpeg.
 *
 * Progress note: fluent-ffmpeg reports `percent: NaN` for image-sequence inputs
 * (no known source duration), so we derive percent from the timemark instead.
 */
export function encodeVideo(frames: Uint8Array[], opts: EncodeOptions): Promise<string> {
  const totalDuration = frames.length / opts.fps
  return new Promise<string>((resolve, reject) => {
    let tempDir = ''
    createTempDir()
      .then((dir) => {
        tempDir = dir
        return writeFrames(dir, frames)
      })
      .then(() => {
        const cmd = ffmpeg()
          .input(join(tempDir, 'frame_%04d.png'))
          .inputOptions(['-start_number 1', `-framerate ${opts.fps}`])
          .outputOptions(outputOptions(opts.transparent))
          .on('progress', (p: FfmpegProgress) => {
            let percent = p.percent
            if (typeof percent !== 'number' || !Number.isFinite(percent)) {
              percent = (parseTimemark(p.timemark) / totalDuration) * 100
            }
            if (Number.isFinite(percent)) {
              opts.onProgress?.(Math.min(100, Math.max(0, percent)))
            }
          })
          .on('end', () => {
            void cleanTempDir(tempDir).finally(() => resolve(opts.outPath))
          })
          .on('error', (err: Error) => {
            void cleanTempDir(tempDir).finally(() => reject(err))
          })
        cmd.save(opts.outPath)
      })
      .catch((err) => reject(err))
  })
}
