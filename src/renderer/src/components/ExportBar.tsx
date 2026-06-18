import type { GridParams, ExportParams } from '../../../shared/types'
import { renderFrames } from '../lib/frameRenderer'

interface ExportBarProps {
  source: ImageBitmap
  grid: GridParams
  exportParams: ExportParams
  disabled: boolean
}

export function ExportBar({ source, grid, exportParams, disabled }: ExportBarProps): JSX.Element {
  const format = exportParams.format
  const label = format === 'mp4' ? '导出 MP4' : format === 'webm' ? '导出 WEBM' : '导出 PNG 序列'

  const handleExport = async (): Promise<void> => {
    const button = document.getElementById('export-btn') as HTMLButtonElement | null
    const bar = document.getElementById('export-progress') as HTMLDivElement | null
    const setText = (t: string): void => { if (button) button.textContent = t }
    const setProg = (p: number): void => { if (bar) bar.style.width = `${p}%` }

    // 1. Pick destination first so we cancel early if the user backs out.
    let outPath: string | null = null
    let outDir: string | null = null
    if (format === 'png') {
      outDir = await window.api.pickDirectory()
      if (!outDir) return
    } else {
      outPath = await window.api.pickSavePath(format)
      if (!outPath) return
    }

    try {
      setText('渲染帧中…')
      setProg(0)
      const { frames } = await renderFrames(source, grid, exportParams)

      if (format === 'png' && outDir) {
        setText('写入 PNG…')
        const dir = await window.api.exportPngSequence(frames, outDir)
        setProg(100)
        alert(`导出成功：${dir}（共 ${frames.length} 帧 PNG）`)
      } else if (outPath) {
        setText(format === 'webm' ? '编码中…（VP9 较慢）' : '编码中…')
        await window.api.encodeVideo(
          frames,
          { fps: exportParams.fps, outPath, transparent: format === 'webm' },
          (p) => setProg(Math.min(100, Math.max(0, p)))
        )
        setProg(100)
        alert(`导出成功：${outPath}`)
      }
    } catch (err) {
      alert(`导出失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setText(label)
      setProg(0)
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
