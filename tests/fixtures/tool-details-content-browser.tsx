import { createRoot, type Root } from 'react-dom/client'
import { LumenProvider, LumenFrame, DEFAULT_LUMEN_APPEARANCE } from '@lumen/app-ui'
import { SessionToolDetails } from '../../packages/app-react/src/session-tool-details'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import { toolDetailsRow, toolDetailsCommand } from './tool-details-content-data'
import '@lumen/app-ui/styles.css'

export interface ToolDetailsContentInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly length: number
  readonly suffix: string
  readonly kind?: 'command' | 'generic'
  readonly outcome?: 'succeeded' | 'failed' | 'unknown' | 'pending'
  readonly clipboardFailure?: boolean
}
declare global {
  interface Window {
    mountToolDetailsContent(input: ToolDetailsContentInput): void
    toolDetailsContentWrites(): readonly string[]
    repairToolDetailsClipboard(): void
    disposeToolDetailsContent?: () => void
  }
}
let root: Root | undefined
window.mountToolDetailsContent = (input) => {
  window.disposeToolDetailsContent?.()
  const node = document.getElementById('tool-details-content-fixture')
  if (!node) throw new Error('Missing owned tool details fixture')
  const base = getShellCopy(input.locale).session.messageBlocks
  const labels = {
    ...base,
    input: base.input + input.suffix,
    output: base.output + input.suffix,
    errorOutput: base.errorOutput + input.suffix,
    command: base.command + input.suffix,
    originalInput: base.originalInput + input.suffix,
    showFullContent: base.showFullContent + input.suffix,
    showLessContent: base.showLessContent + input.suffix,
    toolResultCopy: {
      ...base.toolResultCopy,
      copy: base.toolResultCopy.copy + input.suffix,
      failed: base.toolResultCopy.failed + input.suffix,
      retry: base.toolResultCopy.retry + input.suffix,
    },
  }
  const row = toolDetailsRow(input.length, input.outcome)
  const writes: string[] = []
  let failed = input.clipboardFailure ?? false
  root = createRoot(node)
  root.render(
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode }}>
      <LumenFrame className="owned-tool-details-pane">
        <SessionToolDetails
          row={row}
          presentation={input.kind === 'generic' ? undefined : { icon: 'terminal', command: toolDetailsCommand }}
          labels={labels}
          sessionId="original-session"
          messageId="original-message"
          clipboard={{
            writeText(text) {
              if (failed) return Promise.reject(new Error('Owned private clipboard failure'))
              writes.push(text)
              return Promise.resolve()
            },
          }}
        />
      </LumenFrame>
    </LumenProvider>,
  )
  window.toolDetailsContentWrites = () => writes
  window.repairToolDetailsClipboard = () => {
    failed = false
  }
  window.disposeToolDetailsContent = () => {
    root?.unmount()
    root = undefined
  }
}
