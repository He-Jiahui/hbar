import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { LumenButton, LumenContentText, LumenFrame } from '@lumen/app-ui'
import { applyLumenAppearance, DEFAULT_LUMEN_APPEARANCE, type LumenMode } from '@lumen/app-ui/appearance'
import { HbarPreSessionChoicePicker, type HbarPreSessionChoice, type HbarPreSessionChoiceLabels } from '@hbar/app-react'
import { FloatingSurface, useFloatingTrigger } from '../../packages/app-react/src/floating-surface'
import '@lumen/app-ui/styles.css'

export interface ChoiceFixtureCopy {
  readonly title: string
  readonly trigger: string
  readonly search: string
  readonly clearSearch: string
  readonly empty: string
  readonly noMatches: string
  readonly more: string
  readonly close: string
  readonly error: string
  readonly other: string
}
export interface ChoiceFixtureInput {
  readonly copy: ChoiceFixtureCopy
  readonly choices: readonly HbarPreSessionChoice[]
  readonly selectedId: string | null
  readonly mode: LumenMode
  readonly presentation: 'native' | 'web'
  readonly placement: 'composer' | 'dialog'
  readonly behavior: 'resolve' | 'defer' | 'throw'
  readonly hasMore?: boolean
  readonly openRequest?: number
}
interface ChoiceFixtureEvents {
  readonly chosen: readonly string[]
  readonly more: number
}
declare global {
  interface Window {
    renderChoiceFixture: (input: ChoiceFixtureInput) => void
    readChoiceFixtureEvents: () => ChoiceFixtureEvents
    settleChoiceFixture: (result: 'success' | 'failure') => void
    releaseChoiceFixture: () => void
  }
}
const chosen: string[] = []
let more = 0
let pending: { readonly resolve: () => void; readonly reject: (reason: unknown) => void } | null = null
function ChoiceFixture({
  copy,
  choices,
  selectedId,
  presentation,
  placement,
  behavior,
  hasMore,
  openRequest,
}: ChoiceFixtureInput) {
  const [otherOpen, setOtherOpen] = useState(false)
  const other = useRef<HTMLButtonElement>(null)
  const otherEvents = useFloatingTrigger({
    open: otherOpen,
    onOpen: () => setOtherOpen(true),
    onClose: () => setOtherOpen(false),
  })
  const labels: HbarPreSessionChoiceLabels = {
    title: copy.title,
    trigger: (selected) => `${copy.trigger}: ${selected ?? copy.empty}`,
    search: copy.search,
    clearSearch: copy.clearSearch,
    empty: copy.empty,
    noMatches: copy.noMatches,
    more: (remaining) => `${copy.more}: ${remaining ?? copy.more}`,
    close: copy.close,
    error: () => copy.error,
  }
  return (
    <LumenFrame className="choice-fixture">
      <LumenFrame className="choice-fixture-main">
        <LumenContentText context="workspace.title">{copy.title}</LumenContentText>
        <LumenButton ref={other} {...otherEvents} aria-haspopup="dialog" aria-expanded={otherOpen}>
          {copy.other}
        </LumenButton>
      </LumenFrame>
      <LumenFrame className="choice-fixture-rail">
        <HbarPreSessionChoicePicker
          placement={placement}
          menuPresentation={presentation}
          labels={labels}
          items={choices}
          selectedId={selectedId}
          hasMore={hasMore ?? false}
          openRequest={openRequest ?? 0}
          onMore={() => {
            more += 1
          }}
          onChoose={(id) => {
            chosen.push(id)
            if (behavior === 'throw') throw { code: 'CATALOG_CHANGED' }
            if (behavior === 'defer')
              return new Promise<void>((resolve, reject) => {
                pending = { resolve, reject }
              })
            return undefined
          }}
        />
      </LumenFrame>
      <FloatingSurface open={otherOpen} onClose={() => setOtherOpen(false)} anchorRef={other} label={copy.other}>
        <LumenButton onClick={() => setOtherOpen(false)}>{copy.close}</LumenButton>
      </FloatingSurface>
    </LumenFrame>
  )
}
const element = document.getElementById('pre-session-choice-fixture')
if (!element) throw new Error('Missing choice fixture root')
const root = createRoot(element)
window.renderChoiceFixture = (input) => {
  applyLumenAppearance(document.documentElement, { ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode })
  flushSync(() => root.render(<ChoiceFixture {...input} />))
}
window.readChoiceFixtureEvents = () => ({ chosen: [...chosen], more })
window.settleChoiceFixture = (result) => {
  if (!pending) throw new Error('No pending choice')
  const current = pending
  pending = null
  if (result === 'success') current.resolve()
  else current.reject({ code: 'CATALOG_CHANGED' })
}
window.releaseChoiceFixture = () => root.unmount()
