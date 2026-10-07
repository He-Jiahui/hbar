import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import {
  LumenButton,
  LumenContentText,
  LumenFrame,
  LumenPromptComposer,
  type LumenPromptComposerProps,
} from '@lumen/app-ui'
import { applyLumenAppearance, DEFAULT_LUMEN_APPEARANCE, type LumenMode } from '@lumen/app-ui/appearance'
import '@lumen/app-ui/styles.css'

export interface ComposerControlFlowInput {
  readonly labels: Omit<LumenPromptComposerProps['labels'], 'removeAttachment'> & { readonly removeAttachment: string }
  readonly copy: { readonly title: string; readonly control: string; readonly draft: string }
  readonly axis: 'row' | 'column'
  readonly count: number
  readonly mode: LumenMode
}
declare global {
  interface Window {
    renderComposerControlFlow: (input: ComposerControlFlowInput) => void
    releaseComposerControlFlow: () => void
    readComposerControlFlowActions: () => {
      readonly selected: readonly number[]
      readonly submitted: readonly string[]
    }
  }
}
const selected: number[] = []
const submitted: string[] = []
function ComposerControlFlow({ copy, labels, axis, count }: ComposerControlFlowInput) {
  const [draft, setDraft] = useState(copy.draft)
  return (
    <LumenFrame className="composer-control-flow-fixture" data-axis={axis}>
      <LumenFrame className="composer-control-flow-heading">
        <LumenContentText context="workspace.title">{copy.title}</LumenContentText>
      </LumenFrame>
      <LumenPromptComposer
        labels={{ ...labels, removeAttachment: () => labels.removeAttachment }}
        value={draft}
        attachments={[]}
        submitting={false}
        uploading={false}
        canSubmit
        canStop={false}
        onChange={setDraft}
        onSubmit={() => {
          submitted.push(draft)
        }}
        onStop={() => {}}
        onRemoveAttachment={() => {}}
        controls={Array.from({ length: count }, (_, index) => (
          <LumenButton
            key={index}
            type="button"
            variant="text"
            indicator="none"
            onClick={() => {
              selected.push(index)
            }}
          >
            <LumenContentText context="control.label">{copy.control + index}</LumenContentText>
          </LumenButton>
        ))}
      />
    </LumenFrame>
  )
}
const element = document.getElementById('composer-control-flow-fixture')
if (!element) throw new Error('Missing composer control flow fixture root')
const root = createRoot(element)
window.renderComposerControlFlow = (input) => {
  applyLumenAppearance(document.documentElement, { ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode })
  flushSync(() => root.render(<ComposerControlFlow {...input} />))
}
window.readComposerControlFlowActions = () => ({ selected: [...selected], submitted: [...submitted] })
window.releaseComposerControlFlow = () => root.unmount()
