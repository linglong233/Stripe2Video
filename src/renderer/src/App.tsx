import { useCallback, useMemo, useState } from 'react'
import type { GridParams, ExportParams } from '../../shared/types'
import { detectGrid, makeGrid } from './lib/frameDetector'
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

  // cols/rows are user inputs; frameW/frameH are always re-derived from the
  // real image dimensions so the grid never goes stale on manual edits.
  const onColsChange = useCallback((cols: number) => {
    setGrid((prev) => (prev && image ? makeGrid(image.width, image.height, cols, prev.rows) : prev))
  }, [image])

  const onRowsChange = useCallback((rows: number) => {
    setGrid((prev) => (prev && image ? makeGrid(image.width, image.height, prev.cols, rows) : prev))
  }, [image])

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
              onColsChange={onColsChange}
              onRowsChange={onRowsChange}
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
