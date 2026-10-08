import { useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  DEFAULT_LUMEN_APPEARANCE,
  LumenButton,
  LumenFloatingSurface,
  LumenFrame,
  LumenProvider,
  useFloatingTrigger,
} from '@lumen/app-ui'
import type { FileComposerContextSelection } from '@hbar/app-runtime'
import { HbarFileSourceSurface } from '../../packages/app-react/src/file-context-surfaces'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import '@lumen/app-ui/styles.css'

export interface FileContextContentInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly sourceId: string
  readonly value: string
  readonly disabled?: boolean
  readonly hashed?: boolean
  readonly long?: boolean
}
export interface FileContextContentTarget {
  readonly sourceId: string
  readonly selection: FileComposerContextSelection
}
declare global {
  interface Window {
    mountFileContextContent(input: FileContextContentInput): void
    updateFileContextContent(input: FileContextContentInput): void
    fileContextContentTargets(): readonly FileContextContentTarget[]
    resolveFileContextContent(added: boolean): void
  }
}
let root: Root | undefined
const targets: FileContextContentTarget[] = []
const pending: ((added: boolean) => void)[] = []
function Fixture({ input }: { readonly input: FileContextContentInput }) {
  const copy = getShellCopy(input.locale)
  const labels = {
    ...copy.files.context,
    commentTitle: copy.files.context.commentTitle.repeat(input.long ? 10 : 1),
    addComment: copy.files.context.addComment.repeat(input.long ? 8 : 1),
    cancel: copy.files.context.cancel.repeat(input.long ? 8 : 1),
    addSelection: copy.files.context.addSelection.repeat(input.long ? 8 : 1),
    previousLines: copy.files.context.previousLines.repeat(input.long ? 8 : 1),
    nextLines: copy.files.context.nextLines.repeat(input.long ? 8 : 1),
    linePage: (from: number, to: number, total: number) =>
      copy.files.context.linePage(from, to, total).repeat(input.long ? 8 : 1),
    range: (start: number, end: number, side?: 'old' | 'new') =>
      copy.files.context.range(start, end, side).repeat(input.long ? 16 : 1),
  }
  const [other, setOther] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const otherEvents = useFloatingTrigger({ open: other, onOpen: () => setOther(true), onClose: () => setOther(false) })
  return (
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, textSize: 'l', motion: false }}>
      <LumenFrame
        as="main"
        style={{
          display: 'flex',
          flexDirection: 'column',
          blockSize: 'calc(100dvh / 1.25)',
          padding: '1rem',
          boxSizing: 'border-box',
          minInlineSize: 0,
          gap: '1rem',
        }}
      >
        <LumenFrame
          style={{ display: 'flex', minInlineSize: 0, overflowX: 'auto', flex: '0 0 auto' }}
          role="group"
          aria-label={copy.files.context.commentTitle}
          tabIndex={0}
        >
          <LumenButton data-context-outside>{copy.files.backToFiles}</LumenButton>
          <LumenButton data-context-other ref={anchor} {...otherEvents}>
            {copy.session.tools.more}
          </LumenButton>
        </LumenFrame>
        <HbarFileSourceSurface
          key={input.sourceId}
          path={input.sourceId}
          value={input.value}
          sha256={input.hashed === false ? null : 'a'.repeat(64)}
          previewLabel={copy.files.textPreview(input.sourceId)}
          labels={labels}
          disabled={Boolean(input.disabled)}
          onAdd={(selection) => {
            targets.push({ sourceId: input.sourceId, selection })
            return new Promise<boolean>((resolve) => pending.push(resolve))
          }}
        />
        <LumenFloatingSurface
          open={other}
          onClose={() => setOther(false)}
          anchorRef={anchor}
          responsivePresentation="anchored"
          label={copy.session.tools.more}
          role="dialog"
        >
          <LumenButton>{copy.files.backToFiles}</LumenButton>
        </LumenFloatingSurface>
      </LumenFrame>
    </LumenProvider>
  )
}
window.mountFileContextContent = (input) => {
  root?.unmount()
  targets.splice(0)
  pending.splice(0)
  const element = document.getElementById('file-context-content-fixture')
  if (!element) throw new Error('Missing file context fixture mount')
  root = createRoot(element)
  root.render(<Fixture input={input} />)
}
window.updateFileContextContent = (input) => root?.render(<Fixture input={input} />)
window.fileContextContentTargets = () => targets
window.resolveFileContextContent = (added) => {
  const resolve = pending.shift()
  if (!resolve) throw new Error('No pending original file context')
  resolve(added)
}
