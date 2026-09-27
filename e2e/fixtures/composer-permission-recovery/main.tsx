import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { DEFAULT_LUMEN_APPEARANCE, LumenButton, LumenFrame, LumenProvider, LumenText } from '@lumen/app-ui'
import '@lumen/app-ui/styles.css'
import { HbarComposerPermissionPicker } from '../../../packages/app-react/src/composer-permission-picker'
import { getShellCopy } from '../../../apps/web/src/shell-copy'

type Locale = 'en-US' | 'zh-CN'
interface FixtureCopy {
  readonly notice: string
  readonly session: string
  readonly draft: string
  readonly outside: string
}
const fixtureCopy: Readonly<Record<Locale, FixtureCopy>> = {
  'en-US': {
    notice:
      'Actual permission picker in StrictMode. Controlled Goal cancellation; no Host, provider or business network.',
    session: 'Original session A',
    draft: 'Original unsent text and attachment stay unchanged.',
    outside: 'Independent fixture control',
  },
  'zh-CN': {
    notice: 'StrictMode 中的实际审批菜单。Goal 取消为受控回调；不连接 Host、模型或业务网络。',
    session: '原会话 A',
    draft: '原未发送文字与附件保持不变。',
    outside: '独立夹具控件',
  },
}
const locale: Locale = new URL(location.href).searchParams.get('locale') === 'zh-CN' ? 'zh-CN' : 'en-US'
const copy = fixtureCopy[locale]
const labels = getShellCopy(locale).session.permissionPicker
const state = createStore(() => ({ prepared: true, pending: false, revision: 7 }))
let settlePending: (() => void) | null = null
let cancelCalls = 0
let modeWrites = 0
let selectionWrites = 0
let refreshReads = 0
let strictSetups = 0
let strictCleanups = 0
const targets: { sessionId: string; expectedRevision: number }[] = []

export interface PermissionRecoverySnapshot {
  readonly prepared: boolean
  readonly pending: boolean
  readonly revision: number
  readonly cancelCalls: number
  readonly modeWrites: number
  readonly selectionWrites: number
  readonly refreshReads: number
  readonly strictSetups: number
  readonly strictCleanups: number
  readonly targets: readonly { readonly sessionId: string; readonly expectedRevision: number }[]
  readonly draft: string
  readonly attachmentId: string
  readonly focus: {
    readonly tag: string | null
    readonly label: string | null
    readonly choice: string | null
    readonly role: string | null
    readonly className: string | null
    readonly scrollHeight: number
    readonly clientHeight: number
    readonly trigger: boolean
    readonly close: boolean
    readonly insidePopover: boolean
    readonly popoverOpen: boolean
  }
}

const snapshot = (): PermissionRecoverySnapshot => {
  const active = document.activeElement
  const popup = document.querySelector('.hbar-composer-permission-popover')
  return {
    ...state.getState(),
    cancelCalls,
    modeWrites,
    selectionWrites,
    refreshReads,
    strictSetups,
    strictCleanups,
    targets: [...targets],
    draft: copy.draft,
    attachmentId: 'confirmed-local-attachment',
    focus: {
      tag: active?.tagName ?? null,
      label: active?.getAttribute('aria-label') ?? null,
      choice: active?.getAttribute('data-choice') ?? null,
      role: active?.getAttribute('role') ?? null,
      className: active?.getAttribute('class') ?? null,
      scrollHeight: active?.scrollHeight ?? 0,
      clientHeight: active?.clientHeight ?? 0,
      trigger: active?.classList.contains('hbar-composer-permission-trigger') ?? false,
      close: active?.getAttribute('aria-label') === labels.close,
      insidePopover: Boolean(active && popup?.contains(active)),
      popoverOpen: popup?.matches(':popover-open') ?? false,
    },
  }
}

const cancel = async (target: { readonly sessionId: string; readonly expectedRevision: number }) => {
  if (settlePending || state.getState().pending) throw new Error('Duplicate controlled cancellation')
  if (target.sessionId !== 'session-a' || target.expectedRevision !== state.getState().revision)
    throw new Error('Captured fixture target changed')
  cancelCalls++
  targets.push(target)
  state.setState({ pending: true })
  await new Promise<void>((resolve) => {
    settlePending = resolve
  })
  state.setState((current) => ({ prepared: false, pending: false, revision: current.revision + 1 }))
}

function Fixture() {
  const current = useStore(state)
  useEffect(() => {
    strictSetups++
    return () => {
      strictCleanups++
    }
  }, [])
  return (
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: 'light', motion: false }}>
      <LumenFrame as="main" className="permission-recovery-fixture">
        <LumenText as="p">{copy.notice}</LumenText>
        <LumenButton data-testid="outside-control">{copy.outside}</LumenButton>
        <LumenFrame className="permission-recovery-composer">
          <LumenText as="p">{copy.draft}</LumenText>
          <HbarComposerPermissionPicker
            sessionId="session-a"
            sessionLabel={copy.session}
            entry={{
              sessionId: 'session-a',
              choice: 'inherit',
              revision: 3,
              status: 'idle',
              locked: false,
              error: null,
            }}
            hostDefault={{ status: 'ready', mode: 'ask', error: null }}
            defaultAvailable
            connected
            disabled={false}
            canPrepare
            labels={labels}
            onRefresh={async () => {
              refreshReads++
            }}
            onSelect={async () => {
              selectionWrites++
            }}
            plan={{
              entry: { sessionId: 'session-a', mode: 'default', status: 'ready', revision: 9, error: null },
              disabled: current.prepared,
              ...(current.prepared ? { goalPreparation: { revision: current.revision, onCancel: cancel } } : {}),
              onSetMode: async () => {
                modeWrites++
              },
              onSelectOrdinary: async () => {
                modeWrites++
                selectionWrites++
              },
              onRefresh: async () => {
                refreshReads++
              },
              onReconcile: async () => {
                refreshReads++
              },
            }}
          />
        </LumenFrame>
      </LumenFrame>
    </LumenProvider>
  )
}

declare global {
  interface Window {
    composerPermissionRecovery: {
      snapshot(): PermissionRecoverySnapshot
      settle(): void
    }
  }
}
window.composerPermissionRecovery = {
  snapshot,
  settle() {
    if (!settlePending) throw new Error('No controlled cancellation is pending')
    const resolve = settlePending
    settlePending = null
    resolve()
  },
}
document.documentElement.lang = locale
const container = document.getElementById('root')
if (!container) throw new Error('Missing permission recovery fixture root')
createRoot(container).render(
  <StrictMode>
    <Fixture />
  </StrictMode>,
)
