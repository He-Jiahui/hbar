import { createStore } from 'zustand/vanilla'
import type { HbarAppUiCodeReferenceContent } from 'hbar-app-ui/catalog'
import { uniqueHbarAppUiCodeFiles } from 'hbar-app-ui/catalog'

type CodeFile = HbarAppUiCodeReferenceContent['files'][number]
interface CodeEditorState {
  readonly files: readonly CodeFile[]
  readonly activeFileId: string | undefined
  readonly cursor: Readonly<{ line: number; column: number }>
  readonly reset: (content: HbarAppUiCodeReferenceContent | undefined) => void
  readonly selectFile: (fileId: string) => void
  readonly closeFile: (fileId: string) => void
  readonly selectLine: (fileId: string, line: number, column: number) => void
}

function projection(content: HbarAppUiCodeReferenceContent | undefined) {
  const files = uniqueHbarAppUiCodeFiles(content?.files ?? [])
  return {
    files,
    activeFileId: files.some((file) => file.id === content?.activeFileId) ? content?.activeFileId : files[0]?.id,
    cursor: content?.cursor ?? { line: 1, column: 0 },
  }
}

/** Source closes active files, selects the first remaining file, and keeps the last tab open. */
export function createCodeEditorPreviewStore(content: HbarAppUiCodeReferenceContent | undefined) {
  return createStore<CodeEditorState>((set) => ({
    ...projection(content),
    reset: (next) => set(projection(next)),
    selectFile: (fileId) =>
      set((state) => (state.files.some((file) => file.id === fileId) ? { activeFileId: fileId } : {})),
    closeFile: (fileId) =>
      set((state) => {
        if (state.files.length <= 1 || !state.files.some((file) => file.id === fileId)) return {}
        const files = state.files.filter((file) => file.id !== fileId)
        return { files, activeFileId: state.activeFileId === fileId ? files[0]?.id : state.activeFileId }
      }),
    selectLine: (fileId, line, column) =>
      set((state) => {
        const file = state.files.find((item) => item.id === fileId)
        const sourceLine = file?.source.split('\n')[line - 1]
        if (state.activeFileId !== fileId || sourceLine === undefined) return {}
        return { cursor: { line, column: Math.max(0, Math.min(sourceLine.length, column)) } }
      }),
  }))
}
