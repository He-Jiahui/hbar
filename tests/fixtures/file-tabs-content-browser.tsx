import { useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  DEFAULT_LUMEN_APPEARANCE,
  LumenButton,
  LumenContentText,
  LumenFloatingSurface,
  LumenFrame,
  LumenProvider,
  useFloatingTrigger,
} from '@lumen/app-ui'
import { HbarFilePreviewTabs, type HbarFilePreviewItem } from '../../packages/app-react/src/file-preview-tabs'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import '@lumen/app-ui/styles.css'

export interface FileTabsContentInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly items: readonly HbarFilePreviewItem[]
  readonly activeId: string | null
  readonly long?: boolean
}
export interface FileTabsContentEvent {
  readonly kind: 'select' | 'close'
  readonly ids: readonly string[]
}
declare global {
  interface Window {
    mountFileTabsContent(input: FileTabsContentInput): void
    updateFileTabsContent(input: FileTabsContentInput): void
    fileTabsContentEvents(): readonly FileTabsContentEvent[]
  }
}
let root: Root | undefined
const events: FileTabsContentEvent[] = []
function Fixture({ input }: { readonly input: FileTabsContentInput }) {
  const copy = getShellCopy(input.locale)
  const labels = {
    ...copy.files.previews,
    kind: (kind: HbarFilePreviewItem['kind']) => copy.files.previews.kind(kind).repeat(input.long ? 8 : 1),
    action: (scope: Parameters<typeof copy.files.previews.action>[0]) =>
      copy.files.previews.action(scope).repeat(input.long ? 8 : 1),
  }
  const [other, setOther] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const trigger = useFloatingTrigger({ open: other, onOpen: () => setOther(true), onClose: () => setOther(false) })
  return (
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, textSize: 'l', motion: false }}>
      <LumenFrame
        as="main"
        style={{
          display: 'flex',
          flexDirection: 'column',
          minInlineSize: 0,
          minBlockSize: 0,
          blockSize: 'calc(100dvh / 1.25)',
          gap: '1rem',
          padding: '1rem',
          boxSizing: 'border-box',
        }}
      >
        <HbarFilePreviewTabs
          items={input.items}
          activeId={input.activeId}
          labels={labels}
          onSelect={(id) => events.push({ kind: 'select', ids: [id] })}
          onClose={(ids) => events.push({ kind: 'close', ids })}
        />
        <LumenFrame
          role="region"
          aria-label={copy.files.title}
          style={{ flex: '1 1 0', minBlockSize: 0, overflow: 'auto' }}
        >
          <LumenContentText context="reading.paragraph">{copy.files.changes.noDiff}</LumenContentText>
        </LumenFrame>
        <LumenFrame
          role="group"
          aria-label={copy.files.title}
          tabIndex={0}
          style={{ display: 'flex', flex: '0 0 auto', minInlineSize: 0, overflowX: 'auto' }}
        >
          <LumenButton data-tabs-outside>{copy.files.backToFiles}</LumenButton>
          <LumenButton data-tabs-other ref={anchor} {...trigger}>
            {copy.session.tools.more}
          </LumenButton>
        </LumenFrame>
        <LumenFloatingSurface
          open={other}
          onClose={() => setOther(false)}
          anchorRef={anchor}
          responsivePresentation="anchored"
          label={copy.session.tools.more}
          role="dialog"
        >
          <LumenButton>{copy.files.close}</LumenButton>
        </LumenFloatingSurface>
      </LumenFrame>
    </LumenProvider>
  )
}
window.mountFileTabsContent = (input) => {
  root?.unmount()
  events.splice(0)
  const element = document.getElementById('file-tabs-content-fixture')
  if (!element) throw new Error('Missing file tabs fixture mount')
  root = createRoot(element)
  root.render(<Fixture input={input} />)
}
window.updateFileTabsContent = (input) => root?.render(<Fixture input={input} />)
window.fileTabsContentEvents = () => events
