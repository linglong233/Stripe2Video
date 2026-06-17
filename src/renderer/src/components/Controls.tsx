import type { CSSProperties } from 'react'
import type { GridParams, ExportParams, PlayMode } from '../../../shared/types'

interface ControlsProps {
  grid: GridParams
  exportParams: ExportParams
  showRows: boolean
  onGridChange: (g: GridParams) => void
  onExportChange: (e: ExportParams) => void
}

const labelStyle: CSSProperties = { display: 'block', fontSize: 13, marginTop: 12, marginBottom: 4 }
const rowStyle: CSSProperties = { display: 'flex', gap: 12, alignItems: 'center' }

export function Controls({
  grid, exportParams, showRows, onGridChange, onExportChange
}: ControlsProps): JSX.Element {
  const setExp = (patch: Partial<ExportParams>): void =>
    onExportChange({ ...exportParams, ...patch })

  return (
    <div style={{ minWidth: 220 }}>
      <h3 style={{ marginTop: 0 }}>网格</h3>
      <label style={labelStyle}>列数</label>
      <input
        type="number" min={1} value={grid.cols}
        onChange={(e) => onGridChange({ ...grid, cols: Math.max(1, Number(e.target.value)) })}
      />
      {showRows && (
        <>
          <label style={labelStyle}>行数</label>
          <input
            type="number" min={1} value={grid.rows}
            onChange={(e) => onGridChange({ ...grid, rows: Math.max(1, Number(e.target.value)) })}
          />
        </>
      )}

      <h3>导出</h3>
      <label style={labelStyle}>FPS</label>
      <input
        type="number" min={1} max={30} value={exportParams.fps}
        onChange={(e) => setExp({ fps: Math.min(30, Math.max(1, Number(e.target.value))) })}
      />

      <label style={labelStyle}>播放模式</label>
      <div style={rowStyle}>
        {(['once', 'loop', 'duration'] as PlayMode[]).map((m) => (
          <label key={m} style={{ fontSize: 13 }}>
            <input
              type="radio" name="playmode" checked={exportParams.playMode === m}
              onChange={() => setExp({ playMode: m })}
            />{' '}
            {m === 'once' ? '单次' : m === 'loop' ? '循环' : '目标时长'}
          </label>
        ))}
      </div>

      {exportParams.playMode === 'loop' && (
        <>
          <label style={labelStyle}>循环次数</label>
          <input
            type="number" min={1} value={exportParams.loopCount}
            onChange={(e) => setExp({ loopCount: Math.max(1, Number(e.target.value)) })}
          />
        </>
      )}
      {exportParams.playMode === 'duration' && (
        <>
          <label style={labelStyle}>目标时长（秒）</label>
          <input
            type="number" min={0.1} step={0.1} value={exportParams.durationSec}
            onChange={(e) => setExp({ durationSec: Math.max(0.1, Number(e.target.value)) })}
          />
        </>
      )}

      <label style={labelStyle}>缩放</label>
      <select
        value={exportParams.scale}
        onChange={(e) => setExp({ scale: Number(e.target.value) as ExportParams['scale'] })}
      >
        <option value={1}>1×</option>
        <option value={2}>2×</option>
        <option value={4}>4×</option>
      </select>

      <label style={labelStyle}>背景色</label>
      <input
        type="color"
        value={exportParams.bgColor}
        onChange={(e) => setExp({ bgColor: e.target.value })}
      />
    </div>
  )
}
