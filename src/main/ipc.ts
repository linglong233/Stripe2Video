import { ipcMain, dialog, BrowserWindow } from 'electron'
import { encodeVideo } from './encoder'
import { writeFrames } from './tempfs'
import type { EncodeRequest } from '../shared/types'

export function registerIpcHandlers(): void {
  ipcMain.handle('dialog:save', async (_event, format: 'mp4' | 'webm') => {
    const win = BrowserWindow.getFocusedWindow()
    const ext = format === 'webm' ? 'webm' : 'mp4'
    const opts = {
      title: format === 'webm' ? 'Export WebM (transparent)' : 'Export MP4',
      defaultPath: `stripe2video.${ext}`,
      filters: [{ name: format === 'webm' ? 'WebM Video' : 'MP4 Video', extensions: [ext] }]
    }
    const result = win
      ? await dialog.showSaveDialog(win, opts)
      : await dialog.showSaveDialog(opts)
    return result.canceled ? null : result.filePath
  })

  ipcMain.handle('dialog:pickDir', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

  ipcMain.handle('export:pngSequence', async (_event, frames: Uint8Array[], dir: string) => {
    await writeFrames(dir, frames)
    return dir
  })

  ipcMain.handle('encode:video', async (event, frames: Uint8Array[], req: EncodeRequest) => {
    return encodeVideo(frames, {
      fps: req.fps,
      outPath: req.outPath,
      transparent: req.transparent,
      onProgress: (percent) => {
        event.sender.send('encode:progress', percent)
      }
    })
  })
}
