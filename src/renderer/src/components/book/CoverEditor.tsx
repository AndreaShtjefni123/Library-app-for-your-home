import { useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { ImageIcon, TrashIcon, UploadSimpleIcon } from '@phosphor-icons/react'
import { refreshBooks } from '../../lib/queries'

/** Turns any picture the browser can read (JPEG, PNG, WebP, GIF…) into a JPEG for saving. */
async function toJpeg(blob: Blob): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(blob)
  const max = 1600
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const out = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read that picture'))), 'image/jpeg', 0.9)
  )
  return new Uint8Array(await out.arrayBuffer())
}

interface CoverEditorProps {
  bookId: string
  title: string
  hasCover: boolean
  disabled?: boolean
  children: ReactNode
}

/**
 * Lets you change a book's cover: drop a picture on it, paste one (Ctrl+V), or choose a file.
 * Every change can be undone.
 */
export function CoverEditor({ bookId, title, hasCover, disabled, children }: CoverEditorProps) {
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const undoToast = (message: string): void => {
    toast.success(message, {
      duration: 8000,
      action: {
        label: 'Undo',
        onClick: async () => {
          await window.api.covers.undo(bookId)
          await refreshBooks()
        }
      }
    })
  }

  const applyImage = async (blob: Blob | null | undefined): Promise<void> => {
    if (!blob || !blob.type.startsWith('image/')) {
      toast.error('That isn’t a picture. Use a JPEG, PNG or WebP image.')
      return
    }
    setBusy(true)
    try {
      await window.api.covers.set(bookId, await toJpeg(blob))
      await refreshBooks()
      undoToast(`New cover for “${title}”`)
    } catch (e) {
      toast.error(`Couldn’t use that picture: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  // Ctrl+V anywhere on the book's page pastes a copied picture as the cover.
  useEffect(() => {
    if (disabled) return
    const onPaste = (e: ClipboardEvent): void => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))
      if (!item) return
      e.preventDefault()
      void applyImage(item.getAsFile())
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, disabled])

  const remove = async (): Promise<void> => {
    await window.api.covers.remove(bookId)
    await refreshBooks()
    undoToast('Cover removed')
  }

  return (
    <div
      className="group/cover relative"
      onDragOver={(e) => {
        if (disabled || ![...e.dataTransfer.items].some((i) => i.type.startsWith('image/'))) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        if (!disabled) void applyImage(e.dataTransfer.files[0])
      }}
      data-testid="cover-editor"
    >
      {children}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-[4px] border-2 border-dashed border-accent bg-accent/25 font-medium text-white">
          Drop to use as cover
        </div>
      )}
      {!disabled && (
        <div className="absolute inset-x-2 bottom-2 z-10 flex justify-center gap-2 opacity-0 transition group-hover/cover:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-black/70 px-3 text-[12px] font-medium text-white backdrop-blur hover:bg-black/85"
          >
            {hasCover ? <ImageIcon size={14} /> : <UploadSimpleIcon size={14} />} {hasCover ? 'Change cover' : 'Add cover'}
          </button>
          {hasCover && (
            <button
              type="button"
              onClick={remove}
              aria-label="Remove cover"
              title="Remove cover"
              className="grid size-8 place-items-center rounded-full bg-black/70 text-white backdrop-blur hover:bg-black/85"
            >
              <TrashIcon size={14} />
            </button>
          )}
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Choose a cover picture"
        onChange={(e) => {
          void applyImage(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}
