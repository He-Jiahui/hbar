import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { LumenButton, LumenContentText, LumenFrame } from '@lumen/app-ui'
import { applyLumenAppearance, DEFAULT_LUMEN_APPEARANCE, type LumenMode } from '@lumen/app-ui/appearance'
import { HbarPreSessionApprovalPicker } from '@hbar/app-react'
import type { ComposerPermissionChoice, ComposerPlanMode } from '@hbar/app-runtime'
import { getShellCopy, type ShellLocale } from '../../apps/web/src/shell-copy'
import { FloatingSurface, useFloatingTrigger } from '../../packages/app-react/src/floating-surface'
import '@lumen/app-ui/styles.css'

export interface ApprovalFixtureCopy {
  readonly pickerTitleSuffix?: string
  readonly title: string
  readonly other: string
  readonly close: string
  readonly session: string
  readonly error: string
  readonly longSuffix: string
  readonly longActionSuffix: string
  readonly blocked: string
}
export interface ApprovalFixtureInput {
  readonly locale: ShellLocale
  readonly copy: ApprovalFixtureCopy
  readonly choice: ComposerPermissionChoice
  readonly planMode: ComposerPlanMode
  readonly planAvailable: boolean
  readonly planBlocked: boolean
  readonly draftId: string
  readonly mode: LumenMode
  readonly behavior: 'resolve' | 'defer' | 'throw'
}
export type ApprovalFixtureAction =
  | {
      readonly type: 'permission'
      readonly choice: ComposerPermissionChoice
      readonly confirmAllow?: true
      readonly draftId: string
    }
  | { readonly type: 'plan'; readonly mode: ComposerPlanMode; readonly draftId: string }
declare global {
  interface Window {
    renderApprovalFixture: (input: ApprovalFixtureInput) => void
    readApprovalFixtureActions: () => readonly ApprovalFixtureAction[]
    settleApprovalFixture: (result: 'success' | 'failure') => void
    releaseApprovalFixture: () => void
  }
}
const actions: ApprovalFixtureAction[] = []
let pending: { readonly resolve: () => void; readonly reject: (reason: unknown) => void } | null = null
function ApprovalFixture({
  locale,
  copy,
  choice,
  planMode,
  planAvailable,
  planBlocked,
  draftId,
  behavior,
}: ApprovalFixtureInput) {
  const labels = getShellCopy(locale).session.permissionPicker
  const [otherOpen, setOtherOpen] = useState(false)
  const other = useRef<HTMLButtonElement>(null)
  const otherEvents = useFloatingTrigger({
    open: otherOpen,
    onOpen: () => setOtherOpen(true),
    onClose: () => setOtherOpen(false),
  })
  const choose = (action: ApprovalFixtureAction): Promise<void> => {
    actions.push(action)
    if (behavior === 'throw') throw Object.assign(new Error('Owned approval failure'), { code: 'REVISION_CONFLICT' })
    if (behavior === 'defer')
      return new Promise<void>((resolve, reject) => {
        pending = { resolve, reject }
      })
    return Promise.resolve()
  }
  return (
    <LumenFrame className="approval-fixture">
      <LumenFrame className="approval-fixture-main">
        <LumenContentText context="workspace.title">{copy.title}</LumenContentText>
        <LumenButton ref={other} {...otherEvents} aria-expanded={otherOpen} aria-haspopup="dialog">
          {copy.other}
        </LumenButton>
      </LumenFrame>
      <LumenFrame className="approval-fixture-rail">
        <HbarPreSessionApprovalPicker
          choice={choice}
          planMode={planMode}
          planAvailable={planAvailable}
          {...(planBlocked ? { planBlockedReason: copy.blocked } : {})}
          hostDefault="ask"
          sessionLabel={copy.session}
          labels={{
            ...labels,
            title: labels.title + (copy.pickerTitleSuffix ?? ''),
            confirmTitle: labels.confirmTitle + (copy.pickerTitleSuffix ?? ''),
            options: {
              ask: { label: labels.options.ask.label, description: labels.options.ask.description + copy.longSuffix },
              deny: {
                label: labels.options.deny.label,
                description: labels.options.deny.description + copy.longSuffix,
              },
              sandbox: {
                label: labels.options.sandbox.label,
                description: labels.options.sandbox.description + copy.longSuffix,
              },
              allow: {
                label: labels.options.allow.label,
                description: labels.options.allow.description + copy.longSuffix,
              },
              inherit: {
                label: labels.options.inherit.label,
                description: labels.options.inherit.description + copy.longSuffix,
              },
            },
            confirmBody: (session) => labels.confirmBody(session) + copy.longSuffix.repeat(8),
            cancel: labels.cancel + copy.longActionSuffix,
            confirmAllow: labels.confirmAllow + copy.longActionSuffix,
            error: () => copy.error,
          }}
          onChoose={(next, confirmAllow) =>
            choose({ type: 'permission', choice: next, ...(confirmAllow ? { confirmAllow } : {}), draftId })
          }
          onPlanMode={(mode) => choose({ type: 'plan', mode, draftId })}
        />
      </LumenFrame>
      <FloatingSurface open={otherOpen} onClose={() => setOtherOpen(false)} anchorRef={other} label={copy.other}>
        <LumenButton onClick={() => setOtherOpen(false)}>{copy.close}</LumenButton>
      </FloatingSurface>
    </LumenFrame>
  )
}
const element = document.getElementById('pre-session-approval-fixture')
if (!element) throw new Error('Missing approval fixture root')
const root = createRoot(element)
window.renderApprovalFixture = (input) => {
  applyLumenAppearance(document.documentElement, { ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode })
  flushSync(() => root.render(<ApprovalFixture {...input} />))
}
window.readApprovalFixtureActions = () => actions.map((action) => ({ ...action }))
window.settleApprovalFixture = (result) => {
  if (!pending) throw new Error('No pending approval choice')
  const current = pending
  pending = null
  if (result === 'success') current.resolve()
  else current.reject({ code: 'REVISION_CONFLICT' })
}
window.releaseApprovalFixture = () => root.unmount()
