import { ipcMain, dialog, BrowserWindow } from 'electron'
import { encodeVideo } from './encoder'
import type { EncodeRequest } from '../shared/types'

export function registerIpcHandlers(): void {
  ipcMain.handle('dialog:save', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const opts = {
      title: 'Export MP4',
      defaultPath: 'stripe2video.mp4',
      filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
    }
    const result = win
      ? await dialog.showSaveDialog(win, opts)
      : await dialog.showSaveDialog(opts)
    return result.canceled ? null : result.filePath
  })

  ipcMain.handle('encode:video', async (event, frames: Uint8Array[], req: EncodeRequest) => {
    return encodeVideo(frames, {
      fps: req.fps,
      outPath: req.outPath,
      onProgress: (percent) => {
        event.sender.send('encode:progress', percent)
      }
    })
  })
}
