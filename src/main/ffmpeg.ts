import ffmpegStatic from 'ffmpeg-static'

/**
 * Resolves the bundled ffmpeg binary path. ffmpeg-static's default export is the
 * absolute path to the platform binary (or null/undefined if it failed to install).
 */
export function getFfmpegPath(): string {
  const path = ffmpegStatic as unknown as string | null | undefined
  if (!path) {
    throw new Error('ffmpeg-static binary not found. Run `npm install` to fetch it.')
  }
  return path
}
