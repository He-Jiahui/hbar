import { useLayoutEffect, useRef } from 'react'

export interface FilePreviewReadingPosition {
  readonly top: number
  readonly left: number
  readonly segment: number | undefined
}

export function filePreviewReadingOffset(
  saved: FilePreviewReadingPosition | undefined,
  segment: number | undefined,
): { readonly top: number; readonly left: number } {
  return saved && saved.segment === segment ? { top: saved.top, left: saved.left } : { top: 0, left: 0 }
}

/** Ephemeral reader geometry only. The runtime remains the sole owner of documents and selection. */
export function useFilePreviewReadingPosition(
  target: string,
  previewId: string | null,
  mode: string,
  contentAvailable: boolean,
  identities: string,
  segment?: number,
) {
  const reader = useRef<HTMLDivElement>(null)
  const positions = useRef(new Map<string, FilePreviewReadingPosition>())
  useLayoutEffect(() => {
    positions.current.clear()
  }, [target])
  useLayoutEffect(() => {
    const ids = new Set(identities.split('\u0000'))
    for (const key of positions.current.keys())
      if (!ids.has(key.split('\u0000')[0] ?? '')) positions.current.delete(key)
  }, [identities])
  useLayoutEffect(() => {
    const element = reader.current?.querySelector<HTMLElement>(
      '.hbar-file-text-preview, .hbar-app-react-file-editor, .hbar-file-diff-content',
    )
    if (!element || !previewId || !contentAvailable) return
    const key = `${previewId}\u0000${mode}`
    const saved = filePreviewReadingOffset(positions.current.get(key), segment)
    element.scrollTop = saved.top
    element.scrollLeft = saved.left
    // Keep one current segment per UUID/mode, not an unbounded cache of every visited diff page.
    const remember = () => positions.current.set(key, { top: element.scrollTop, left: element.scrollLeft, segment })
    element.addEventListener('scroll', remember)
    // React may already have reused/changed this DOM node when cleanup runs.
    // Only scroll events own measurements; cleanup must not replace saved A with B's reset geometry.
    return () => element.removeEventListener('scroll', remember)
  }, [target, previewId, mode, contentAvailable, segment])
  return reader
}
