import type { GridParams, ExportParams } from '../../../shared/types'
import { renderFrames } from '../lib/frameRenderer'

interface ExportBarProps {
  source: ImageBitmap
  grid: GridParams
  exportParams: ExportParams
  disabled: boolean
}

export function ExportBar({ source, grid, exportParams, disabled }: ExportBarProps): JSX.Element {
  const format = exportParams.transparent ? 'webm' : 'mp4'
  const label = `导出 ${format.toUpperCase()}`

  const handleExport = async (): Promise<void> => {
    const outPath = await window.api.pickSavePath(format)
    if (!outPath) return

    const button = document.getElementById('export-btn') as HTMLButtonElement | null
    const bar = document.getElementById('export-progress') as HTMLDivElement | null
    const setText = (t: string): void => { if (button) button.textContent = t }
    const setProg = (p: number): void => { if (bar) bar.style.width = `${p}%` }

    try {
      setText('渲染帧中…')
      setProg(0)
      const { frames } = await renderFrames(source, grid, exportParams)

      setText(exportParams.transparent ? '编码中…（VP9 较慢）' : '编码中…')
      await window.api.encodeVideo(
        frames,
        { fps: exportParams.fps, outPath, transparent: exportParams.transparent },
        (p) => setProg(Math.min(100, Math.max(0, p)))
      )
      setText(label)
      setProg(100)
      alert(`导出成功：${outPath}`)
    } catch (err) {
      setText(label)
      setProg(0)
      alert(`导出失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <button id="export-btn" disabled={disabled} onClick={() => void handleExport()}>
        {label}
      </button>
      <div style={{ width: '100%', height: 8, background: '#333', borderRadius: 4, marginTop: 8, overflow: 'hidden' }}>
        <div id="export-progress" style={{ width: '0%', height: '100%', background: '#646cff', transition: 'width 0.2s' }} />
      </div>
    </div>
  )
}
