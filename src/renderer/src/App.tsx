import { useCallback, useMemo, useState } from 'react'
import type { GridParams, ExportParams } from '../../shared/types'
import { detectGrid } from './lib/frameDetector'
import { Dropzone } from './components/Dropzone'
import { PreviewCanvas } from './components/PreviewCanvas'
import { AnimationPreview } from './components/AnimationPreview'
import { Controls } from './components/Controls'
import { ExportBar } from './components/ExportBar'
import './App.css'

interface LoadedImage {
  bitmap: ImageBitmap
  width: number
  height: number
  name: string
}

const defaultExport: ExportParams = {
  fps: 12,
  playMode: 'loop',
  loopCount: 3,
  durationSec: 1,
  scale: 1,
  bgColor: '#000000'
}

export default function App(): JSX.Element {
  const [image, setImage] = useState<LoadedImage | null>(null)
  const [grid, setGrid] = useState<GridParams | null>(null)
  const [exportParams, setExportParams] = useState<ExportParams>(defaultExport)

  const onImage = useCallback((bitmap: ImageBitmap, width: number, height: number, name: string) => {
    setImage({ bitmap, width, height, name })
    setGrid(detectGrid(width, height, { allowGrid: true }))
  }, [])

  const ready = useMemo(() => image !== null && grid !== null && grid.cols * grid.rows >= 1, [image, grid])

  return (
    <div className="app">
      <header className="header">
        <h1>Stripe2Video</h1>
        <Dropzone onImage={onImage} />
      </header>

      {ready && image && grid && (
        <main className="main">
          <section className="preview">
            <PreviewCanvas source={image.bitmap} width={image.width} height={image.height} grid={grid} />
            <AnimationPreview source={image.bitmap} grid={grid} exp={exportParams} />
          </section>
          <aside className="sidebar">
            <Controls
              grid={grid}
              exportParams={exportParams}
              showRows={true}
              onGridChange={setGrid}
              onExportChange={setExportParams}
            />
            <ExportBar
              source={image.bitmap}
              grid={grid}
              exportParams={exportParams}
              disabled={!ready}
            />
          </aside>
        </main>
      )}
    </div>
  )
}
