import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { LumenButton, LumenContentText, LumenFrame } from '@lumen/app-ui'
import { applyLumenAppearance, DEFAULT_LUMEN_APPEARANCE, type LumenMode } from '@lumen/app-ui/appearance'
import { HbarPreSessionThinkingPicker } from '@hbar/app-react'
import type { ModelDescriptor } from '@hbar/contracts/commands/models'
import { getShellCopy, type ShellLocale } from '../../apps/web/src/shell-copy'
import { FloatingSurface, useFloatingTrigger } from '../../packages/app-react/src/floating-surface'
import '@lumen/app-ui/styles.css'

type ThinkingLevel = ModelDescriptor['thinkingLevels'][number]
export interface ThinkingFixtureCopy {
  readonly title: string
  readonly other: string
  readonly close: string
  readonly error: string
  readonly longSuffix: string
}
export interface ThinkingFixtureInput {
  readonly locale: ShellLocale
  readonly copy: ThinkingFixtureCopy
  readonly model: ModelDescriptor | null
  readonly level: ThinkingLevel | null
  readonly mode: LumenMode
  readonly behavior: 'resolve' | 'defer' | 'throw'
}
interface ThinkingFixtureAction {
  readonly level: ThinkingLevel
  readonly modelId: string
}
declare global {
  interface Window {
    renderThinkingFixture: (input: ThinkingFixtureInput) => void
    readThinkingFixtureActions: () => readonly ThinkingFixtureAction[]
    settleThinkingFixture: (result: 'success' | 'failure') => void
    releaseThinkingFixture: () => void
  }
}
const actions: ThinkingFixtureAction[] = []
let pending: { readonly resolve: () => void; readonly reject: (reason: unknown) => void } | null = null
function ThinkingFixture({ locale, copy, model, level, behavior }: ThinkingFixtureInput) {
  const labels = getShellCopy(locale).session.modelPicker
  const [otherOpen, setOtherOpen] = useState(false)
  const other = useRef<HTMLButtonElement>(null)
  const otherEvents = useFloatingTrigger({
    open: otherOpen,
    onOpen: () => setOtherOpen(true),
    onClose: () => setOtherOpen(false),
  })
  return (
    <LumenFrame className="thinking-fixture">
      <LumenFrame className="thinking-fixture-main">
        <LumenContentText context="workspace.title">{copy.title}</LumenContentText>
        <LumenButton ref={other} {...otherEvents} aria-expanded={otherOpen} aria-haspopup="dialog">
          {copy.other}
        </LumenButton>
      </LumenFrame>
      <LumenFrame className="thinking-fixture-rail">
        <HbarPreSessionThinkingPicker
          model={model}
          level={level}
          labels={{
            thinking: labels.thinking,
            thinkingTrigger: labels.thinkingTrigger,
            thinkingLevel: (value) => `${labels.thinkingLevel(value)}${copy.longSuffix}`,
            error: () => copy.error,
          }}
          onChoose={(next, modelId) => {
            actions.push({ level: next, modelId })
            if (behavior === 'throw') throw Object.assign(new Error('Owned choice failure'), { code: 'MODEL_CHANGED' })
            if (behavior === 'defer')
              return new Promise<void>((resolve, reject) => {
                pending = { resolve, reject }
              })
            return Promise.resolve()
          }}
        />
      </LumenFrame>
      <FloatingSurface open={otherOpen} onClose={() => setOtherOpen(false)} anchorRef={other} label={copy.other}>
        <LumenButton onClick={() => setOtherOpen(false)}>{copy.close}</LumenButton>
      </FloatingSurface>
    </LumenFrame>
  )
}
const element = document.getElementById('pre-session-thinking-fixture')
if (!element) throw new Error('Missing thinking fixture root')
const root = createRoot(element)
window.renderThinkingFixture = (input) => {
  applyLumenAppearance(document.documentElement, { ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode })
  flushSync(() => root.render(<ThinkingFixture {...input} />))
}
window.readThinkingFixtureActions = () => actions.map((action) => ({ ...action }))
window.settleThinkingFixture = (result) => {
  if (!pending) throw new Error('No pending thinking choice')
  const current = pending
  pending = null
  if (result === 'success') current.resolve()
  else current.reject({ code: 'MODEL_CHANGED' })
}
window.releaseThinkingFixture = () => root.unmount()
