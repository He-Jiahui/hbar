import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { DEFAULT_LUMEN_APPEARANCE, LumenContentText, LumenFrame, LumenInput, LumenProvider } from '@lumen/app-ui'
import '@lumen/app-ui/styles.css'
import {
  HbarComposerPermissionPicker,
  type ComposerPermissionSelection,
  type HbarComposerPermissionPickerProps,
} from '../../packages/app-react/src/composer-permission-picker'
import { getShellCopy, type ShellLocale } from '../../apps/web/src/shell-copy'

type Behavior = 'immediate' | 'deferred' | 'fail'
export interface SessionPermissionFixtureInput {
  readonly locale: ShellLocale
  readonly mode: 'light' | 'dark'
  readonly sessionId: string
  readonly sessionLabel: string
  readonly entry: HbarComposerPermissionPickerProps['entry']
  readonly hostDefault: HbarComposerPermissionPickerProps['hostDefault']
  readonly connected: boolean
  readonly disabled: boolean
  readonly runActive?: boolean
  readonly canPrepare?: boolean
  readonly plan:
    | {
        readonly entry: NonNullable<HbarComposerPermissionPickerProps['plan']>['entry']
        readonly disabled?: boolean
        readonly goalRevision?: number | null
      }
    | undefined
  readonly behavior?: {
    readonly approval?: Behavior
    readonly mode?: Behavior
    readonly read?: Behavior
    readonly goal?: Behavior
  }
  readonly readResult?: {
    readonly entry?: HbarComposerPermissionPickerProps['entry']
    readonly planEntry?: NonNullable<HbarComposerPermissionPickerProps['plan']>['entry']
    readonly hostDefault?: HbarComposerPermissionPickerProps['hostDefault']
  }
  readonly copy: {
    readonly outside: string
    readonly draft: string
    readonly attachment: string
    readonly title?: string
    readonly confirmTitle?: string
    readonly confirmBody?: string
    readonly cancel?: string
    readonly confirmAllow?: string
    readonly goalCancel?: string
    readonly optionSuffix?: string
  }
}

type FixtureCall =
  | { readonly kind: 'approval'; readonly target: ComposerPermissionSelection; readonly modeRevision?: number }
  | { readonly kind: 'mode'; readonly sessionId: string; readonly mode: 'default' | 'plan'; readonly revision: number }
  | {
      readonly kind: 'read'
      readonly sessionId: string
      readonly owner: 'approval' | 'plan'
      readonly reconcile: boolean
    }
  | { readonly kind: 'goal'; readonly target: { readonly sessionId: string; readonly expectedRevision: number } }

const calls: FixtureCall[] = []
let pending: { readonly resolve: () => void; readonly reject: (reason: unknown) => void } | null = null
let root: Root | null = null
let fixtureState: ReturnType<typeof createFixtureState> | null = null

function createFixtureState(input: SessionPermissionFixtureInput) {
  return createStore(() => ({ input, draft: input.copy.draft }))
}
async function perform(behavior: Behavior | undefined): Promise<void> {
  if (behavior === 'fail') throw Object.assign(new Error('Controlled fixture failure'), { code: 'EXECUTION_FAILED' })
  if (behavior === 'deferred') {
    if (pending) throw new Error('A second fixture command began while the first was pending')
    await new Promise<void>((resolve, reject) => {
      pending = { resolve, reject }
    })
  }
}

function Fixture({ state }: { readonly state: ReturnType<typeof createFixtureState> }) {
  const { input, draft } = useStore(state)
  const base = getShellCopy(input.locale).session.permissionPicker
  const labels = {
    ...base,
    title: input.copy.title ?? base.title,
    confirmTitle: input.copy.confirmTitle ?? base.confirmTitle,
    confirmBody: (sessionLabel: string) => input.copy.confirmBody ?? base.confirmBody(sessionLabel),
    cancel: input.copy.cancel ?? base.cancel,
    confirmAllow: input.copy.confirmAllow ?? base.confirmAllow,
    plan: { ...base.plan, cancelGoalPreparation: input.copy.goalCancel ?? base.plan.cancelGoalPreparation },
    options: {
      ask: { ...base.options.ask, description: base.options.ask.description + (input.copy.optionSuffix ?? '') },
      deny: { ...base.options.deny, description: base.options.deny.description + (input.copy.optionSuffix ?? '') },
      sandbox: {
        ...base.options.sandbox,
        description: base.options.sandbox.description + (input.copy.optionSuffix ?? ''),
      },
      allow: { ...base.options.allow, description: base.options.allow.description + (input.copy.optionSuffix ?? '') },
      inherit: {
        ...base.options.inherit,
        description: base.options.inherit.description + (input.copy.optionSuffix ?? ''),
      },
    },
  }
  const read = async (owner: 'approval' | 'plan', reconcile: boolean) => {
    calls.push({ kind: 'read', sessionId: input.sessionId, owner, reconcile })
    await perform(input.behavior?.read)
    state.setState((current) => {
      if (current.input.sessionId !== input.sessionId || !input.readResult) return current
      return {
        input: {
          ...current.input,
          entry: input.readResult.entry ?? current.input.entry,
          hostDefault: input.readResult.hostDefault ?? current.input.hostDefault,
          ...(current.input.plan && input.readResult.planEntry
            ? { plan: { ...current.input.plan, entry: input.readResult.planEntry } }
            : {}),
        },
      }
    })
  }
  const select = async (target: ComposerPermissionSelection, modeRevision?: number) => {
    calls.push({ kind: 'approval', target, ...(modeRevision === undefined ? {} : { modeRevision }) })
    await perform(input.behavior?.approval)
  }
  const plan = input.plan
  return (
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, motion: false }}>
      <LumenFrame as="main" className="session-permission-fixture">
        <LumenFrame className="session-permission-fixture-main">
          <LumenInput
            aria-label={input.copy.outside}
            value={draft}
            onChange={(event) => state.setState({ draft: event.currentTarget.value })}
          />
          <LumenContentText context="metadata" data-testid="fixture-attachment">
            {input.copy.attachment}
          </LumenContentText>
        </LumenFrame>
        <LumenFrame className="session-permission-fixture-rail">
          <HbarComposerPermissionPicker
            sessionId={input.sessionId}
            sessionLabel={input.sessionLabel}
            entry={input.entry}
            hostDefault={input.hostDefault}
            connected={input.connected}
            disabled={input.disabled}
            runActive={input.runActive ?? false}
            canPrepare={input.canPrepare ?? true}
            defaultAvailable={false}
            labels={labels}
            onRefresh={() => read('approval', false)}
            onReconcile={() => read('approval', true)}
            onSelect={select}
            {...(plan
              ? {
                  plan: {
                    entry: plan.entry,
                    disabled: plan.disabled ?? false,
                    ...(typeof plan.goalRevision === 'number'
                      ? {
                          goalPreparation: {
                            revision: plan.goalRevision,
                            onCancel: async (target: {
                              readonly sessionId: string
                              readonly expectedRevision: number
                            }) => {
                              calls.push({ kind: 'goal', target })
                              await perform(input.behavior?.goal)
                              state.setState((current) => {
                                if (current.input.sessionId !== target.sessionId || !current.input.plan) return current
                                return {
                                  input: {
                                    ...current.input,
                                    plan: { ...current.input.plan, goalRevision: null, disabled: false },
                                  },
                                }
                              })
                            },
                          },
                        }
                      : {}),
                    onSetMode: async (mode: 'default' | 'plan', revision: number) => {
                      calls.push({ kind: 'mode', sessionId: input.sessionId, mode, revision })
                      await perform(input.behavior?.mode)
                    },
                    onSelectOrdinary: select,
                    onRefresh: () => read('plan', false),
                    onReconcile: () => read('plan', true),
                  },
                }
              : {})}
          />
        </LumenFrame>
      </LumenFrame>
    </LumenProvider>
  )
}

declare global {
  interface Window {
    mountSessionPermissionFixture(input: SessionPermissionFixtureInput): void
    updateSessionPermissionFixture(input: Partial<SessionPermissionFixtureInput>): void
    sessionPermissionCalls(): readonly FixtureCall[]
    settleSessionPermissionFixture(outcome: 'resolve' | 'reject'): void
    releaseSessionPermissionFixture(): void
  }
}
window.mountSessionPermissionFixture = (input) => {
  const container = document.getElementById('session-permission-fixture')
  if (!container) throw new Error('Missing permission fixture root')
  root?.unmount()
  calls.length = 0
  pending = null
  fixtureState = createFixtureState(input)
  root = createRoot(container)
  root.render(
    <StrictMode>
      <Fixture state={fixtureState} />
    </StrictMode>,
  )
}
window.updateSessionPermissionFixture = (input) => {
  fixtureState?.setState((current) => ({ input: { ...current.input, ...input } }))
}
window.sessionPermissionCalls = () => [...calls]
window.settleSessionPermissionFixture = (outcome) => {
  if (!pending) throw new Error('No fixture command is pending')
  const current = pending
  pending = null
  if (outcome === 'reject')
    current.reject(Object.assign(new Error('Controlled fixture failure'), { code: 'EXECUTION_FAILED' }))
  else current.resolve()
}
window.releaseSessionPermissionFixture = () => {
  root?.unmount()
  root = null
  fixtureState = null
}
