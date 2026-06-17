import { useEffect, useRef, useState } from 'react'
import type { GridParams, ExportParams } from '../../../shared/types'

interface AnimationPreviewProps {
  source: ImageBitmap
  grid: GridParams
  exp: ExportParams
}

export function AnimationPreview({ source, grid, exp }: AnimationPreviewProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [playing, setPlaying] = useState(true)
  const cycle = grid.cols * grid.rows

  useEffect(() => {
    if (!playing || cycle < 1) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const tw = grid.frameW * exp.scale
    const th = grid.frameH * exp.scale
    canvas.width = tw
    canvas.height = th
    ctx.imageSmoothingEnabled = false

    let i = 0
    const interval = window.setInterval(() => {
      const col = i % grid.cols
      const row = Math.floor(i / grid.cols)
      ctx.fillStyle = exp.bgColor
      ctx.fillRect(0, 0, tw, th)
      ctx.drawImage(
        source,
        col * grid.frameW, row * grid.frameH, grid.frameW, grid.frameH,
        0, 0, tw, th
      )
      i = (i + 1) % cycle
    }, 1000 / exp.fps)

    return () => window.clearInterval(interval)
  }, [source, grid, exp, playing, cycle])

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => setPlaying((p) => !p)}>{playing ? '⏸ 暂停' : '▶ 播放'}</button>
        <span style={{ fontSize: 13, color: '#aaa' }}>动画预览（{exp.fps} FPS）</span>
      </div>
      <canvas ref={canvasRef} style={{ imageRendering: 'pixelated', marginTop: 8, border: '1px solid #333' }} />
    </div>
  )
}
