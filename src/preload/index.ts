import { contextBridge, ipcRenderer } from 'electron'
import type { Stripe2VideoApi } from '../shared/types'

const api: Stripe2VideoApi = {
  pickSavePath: (format) => ipcRenderer.invoke('dialog:save', format),

  encodeVideo: (frames, req, onProgress) => {
    const listener = (_e: unknown, percent: number): void => onProgress?.(percent)
    if (onProgress) ipcRenderer.on('encode:progress', listener)
    return ipcRenderer.invoke('encode:video', frames, req).then((result: string) => {
      if (onProgress) ipcRenderer.removeListener('encode:progress', listener)
      return result
    })
  }
}

contextBridge.exposeInMainWorld('api', api)
