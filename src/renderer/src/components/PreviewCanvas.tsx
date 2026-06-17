import { useEffect, useRef } from 'react'
import type { GridParams } from '../../../shared/types'
import { isEvenlyDivisible } from '../lib/frameDetector'

interface PreviewCanvasProps {
  source: ImageBitmap
  width: number
  height: number
  grid: GridParams
}

const MAX_W = 720

export function PreviewCanvas({ source, width, height, grid }: PreviewCanvasProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fit = Math.min(1, MAX_W / width)
  const displayW = Math.round(width * fit)
  const displayH = Math.round(height * fit)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, displayW, displayH)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(source, 0, 0, displayW, displayH)

    // Grid overlay
    const colW = grid.frameW * fit
    const rowH = grid.frameH * fit
    ctx.strokeStyle = 'rgba(100,108,255,0.9)'
    ctx.lineWidth = 1
    for (let c = 0; c <= grid.cols; c++) {
      const x = Math.round(colW * c) + 0.5
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, displayH)
      ctx.stroke()
    }
    for (let r = 0; r <= grid.rows; r++) {
      const y = Math.round(rowH * r) + 0.5
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(displayW, y)
      ctx.stroke()
    }
  }, [source, displayW, displayH, grid, fit])

  const evenlyDivisible = isEvenlyDivisible(width, grid.cols)

  return (
    <div>
      <canvas ref={canvasRef} width={displayW} height={displayH} style={{ imageRendering: 'pixelated' }} />
      {!evenlyDivisible && (
        <p style={{ color: '#ff9800', fontSize: 13 }}>
          ⚠ 图宽 {width}px 不能被 {grid.cols} 列整除，导出时会裁掉余数像素。
        </p>
      )}
    </div>
  )
}
