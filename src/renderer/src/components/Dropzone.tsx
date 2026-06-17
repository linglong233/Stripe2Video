import { useCallback, useRef, useState } from 'react'

interface DropzoneProps {
  onImage: (bitmap: ImageBitmap, width: number, height: number, fileName: string) => void
}

export function Dropzone({ onImage }: DropzoneProps): JSX.Element {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) return
      const bitmap = await createImageBitmap(file)
      onImage(bitmap, bitmap.width, bitmap.height, file.name)
    },
    [onImage]
  )

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files[0]
        if (file) void load(file)
      }}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragging ? '#646cff' : '#888'}`,
        borderRadius: 8,
        padding: 16,
        textAlign: 'center',
        cursor: 'pointer',
        background: dragging ? '#1a1a2e' : 'transparent'
      }}
    >
      拖入精灵图，或点击选择（PNG / JPG / WebP）
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void load(file)
        }}
      />
    </div>
  )
}
