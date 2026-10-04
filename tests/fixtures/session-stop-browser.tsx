// Actual runtime + React owners, injected public ports only. No Host or Run submission.
import { StrictMode, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import {
  LumenAppShell,
  LumenButton,
  LumenFrame,
  LumenInput,
  LumenProvider,
  LumenText,
  type LumenToolPresentation,
} from '@lumen/app-ui'
import { CommandError } from '@hbar/commands'
import { createAppRuntime, type RunCommandPort, type SessionTimelinePort } from '@hbar/app-runtime'
import type { Run, Session, SessionSnapshot } from '@hbar/contracts'
import { HbarRuntimeProvider, useHbarRuntime, useHbarRuntimeState } from '../../packages/app-react/src/runtime'
import {
  HbarSessionStopNotice,
  HbarSessionStopProvider,
  useSessionStopAction,
} from '../../packages/app-react/src/session-stop'
import { createWebLumenAppearance, DEFAULT_WEB_APPEARANCE_DIMENSIONS } from '../../apps/web/src/appearance'
import { getSessionStopCopy } from '../../apps/web/src/session-stop-copy'
import { resolveShellLocale, type ShellLocale } from '../../apps/web/src/shell-copy'
import '@lumen/app-ui/styles.css'
import '../../apps/web/src/document.css'

const workspace = { id: 'w', path: 'D:/controlled-stop-fixture', name: 'Controlled fixture', createdAt: 1 }
function session(id: string): Session {
  return { id, workspaceId: 'w', title: id, archived: false, parentId: null, createdAt: 1, updatedAt: 1, seq: 0 }
}
function run(sessionId: string, queued = false): Run {
  return {
    id: `${sessionId}-${queued ? 'queued' : 'run'}`,
    sessionId,
    requestId: `${sessionId}-request`,
    input: { text: 'Fixture record, never submitted', images: [], files: [] },
    modelId: 'fixture:model',
    status: queued ? 'queued' : 'running',
    createdAt: queued ? 2 : 1,
    startedAt: queued ? null : 1,
    endedAt: null,
    error: null,
  }
}
function field(input: unknown, key: string): string {
  if (typeof input !== 'object' || input === null || !(key in input)) throw new Error('Missing fixture target')
  const value: unknown = Reflect.get(input, key)
  if (typeof value !== 'string') throw new Error('Invalid fixture target')
  return value
}
interface Call {
  readonly owner: number
  readonly name: string
  readonly operationId: string
}
interface Pending extends Call {
  readonly resolve: (value: unknown) => void
  readonly reject: (reason: unknown) => void
}
const listeners = new Set<() => void>()
const pending: Pending[] = []
let calls: readonly Call[] = []
let effectCounts = { setup: 0, cleanup: 0 }
const callsReader = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  getSnapshot: () => calls,
}
const effectReader = { subscribe: callsReader.subscribe, getSnapshot: () => effectCounts }
const emit = () => listeners.forEach((listener) => listener())
let ownerNumber = 0
let capturedCancel: (() => void) | null = null
const ownedRuntimes: ReturnType<typeof createAppRuntime>[] = []
async function createFixtureRuntime() {
  const owner = ++ownerNumber
  const port: RunCommandPort = {
    execute(name, input) {
      if (name !== 'operation.cancel' && name !== 'operation.get') throw new Error('Unexpected executable command')
      const call = { owner, name, operationId: field(input, 'operationId') }
      calls = [...calls, call]
      emit()
      return new Promise<unknown>((resolve, reject) => pending.push({ ...call, resolve, reject }))
    },
    getReceipt: () => Promise.resolve(null),
  }
  const timeline: SessionTimelinePort = {
    snapshot: (id) =>
      Promise.resolve({
        session: session(id),
        messages: [],
        runs: [run(id, true), run(id)],
        approvals: [],
        userInputs: [],
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
        cursor: 0,
        hasOlder: false,
        streams: [],
      } satisfies SessionSnapshot),
    watch: () => Promise.resolve(() => undefined),
  }
  const runtime = createAppRuntime({
    instanceId: `stop-fixture-${owner}`,
    hostId: 'fixture-host',
    directory: {
      execute(name, input) {
        if (name === 'session.get') return Promise.resolve(session(field(input, 'sessionId')))
        if (name === 'workspace.get') return Promise.resolve(workspace)
        if (name === 'workspace.list') return Promise.resolve({ items: [workspace], nextCursor: null })
        if (name === 'session.list') return Promise.resolve({ items: [session('a'), session('b')], nextCursor: null })
        throw new Error('Unexpected directory command')
      },
    },
    timeline,
    run: port,
    surfaces: { canRender: () => true },
  })
  ownedRuntimes.push(runtime)
  await runtime.ready
  await runtime.view.commands.execute('draft.setText', { sessionId: 'a', text: 'original draft A' })
  await runtime.view.commands.execute('draft.setText', { sessionId: 'b', text: 'original draft B' })
  await runtime.view.commands.execute('app.setSession', { workspaceId: 'w', sessionId: 'a' })
  return runtime
}
function settle(kind: string) {
  const request = pending.shift()
  if (!request) throw new Error('No held fixture request')
  if (kind === 'lost' || kind === 'reject' || kind === 'read-error') {
    request.reject(new CommandError(kind === 'reject' ? 'FORBIDDEN' : 'RESULT_UNKNOWN', 'PRIVATE_STOP_FIXTURE'))
    return
  }
  if (request.name === 'operation.cancel') {
    request.resolve({ operationId: request.operationId, status: kind === 'ack' ? 'cancelRequested' : kind })
    return
  }
  request.resolve({
    operationId: request.operationId,
    sessionId: kind === 'wrong-session' ? 'foreign' : request.operationId.split('-')[0],
    status: kind === 'wrong-session' ? 'cancelled' : kind,
    startedAt: 1,
    endedAt: ['cancelled', 'completed', 'failed', 'interrupted'].includes(kind) ? 2 : null,
    error: null,
  })
}
function copy(locale: ShellLocale) {
  const zh = locale === 'zh-CN'
  return {
    title: zh ? '停止：受控实际 Runtime 夹具' : 'Stop: controlled actual runtime fixture',
    prompt: zh ? '原会话草稿' : 'Original session draft',
    file: zh ? '原文件草稿' : 'Original file draft',
    main: zh ? '会话' : 'Session',
    tool: zh ? '文件工具' : 'Files tool',
    close: zh ? '关闭' : 'Close',
    stop: zh ? '指针停止' : 'Pointer Stop',
    capture: zh ? '保存当前停止回调' : 'Capture current Stop callback',
    old: zh ? '调用保存的停止回调' : 'Invoke captured Stop callback',
    overlay: zh ? '原生覆盖层' : 'Native overlay',
    controls: {
      a: 'A',
      b: 'B',
      reopen: zh ? '关闭重开当前页签' : 'Close and reopen tab',
      owner: zh ? '替换 Runtime' : 'Replace runtime',
      unmount: zh ? '卸载界面' : 'Unmount view',
      mount: zh ? '重新挂载界面' : 'Mount view',
      stale: zh ? '调用卸载前回调' : 'Invoke callback from before unmount',
      offline: zh ? '离线' : 'Offline',
      online: zh ? '在线' : 'Online',
      files: zh ? '打开会话文件工具' : 'Open session Files',
      settings: zh ? '打开设置' : 'Open Settings',
      ack: zh ? '确认已请求' : 'Acknowledge request',
      lost: zh ? '丢失写回复' : 'Lose write reply',
      reject: zh ? '明确拒绝写入' : 'Reject write',
      'read-error': zh ? '读取失败' : 'Fail read',
      'wrong-session': zh ? '读取错误会话' : 'Read wrong session',
      running: zh ? '读取仍运行' : 'Read running',
      cancelled: zh ? '确认已取消' : 'Confirm cancelled',
      completed: zh ? '确认已完成' : 'Confirm completed',
      failed: zh ? '确认运行失败' : 'Confirm run failed',
      interrupted: zh ? '确认已中断' : 'Confirm interrupted',
    },
  }
}
function Body({ locale }: { readonly locale: ShellLocale }) {
  const runtime = useHbarRuntime()
  const navigation = useHbarRuntimeState(runtime.state.navigation)
  const drafts = useHbarRuntimeState(runtime.state.drafts)
  const cancel = useSessionStopAction()
  const labels = copy(locale)
  const id = navigation.sessionId ?? 'a'
  return (
    <LumenFrame className="stop-fixture-body">
      <LumenInput
        data-prompt=""
        aria-label={labels.prompt}
        value={drafts[id]?.text ?? ''}
        onChange={(event) => {
          void runtime.commands
            .execute('draft.setText', { sessionId: id, text: event.currentTarget.value })
            .catch(() => undefined)
        }}
      />
      <LumenButton data-pointer-stop="" onClick={() => cancel?.(`${id}-run`)}>
        {labels.stop}
      </LumenButton>
      <LumenButton
        data-save-pointer=""
        onClick={() => {
          capturedCancel = () => cancel?.(`${id}-run`)
        }}
      >
        {labels.capture}
      </LumenButton>
      <LumenButton data-old-pointer="" onClick={() => capturedCancel?.()}>
        {labels.old}
      </LumenButton>
      <HbarSessionStopNotice region="main" />
    </LumenFrame>
  )
}
function RuntimeView({
  runtime,
  locale,
  connected,
  longLabels,
}: {
  readonly runtime: Awaited<ReturnType<typeof createFixtureRuntime>>
  readonly locale: ShellLocale
  readonly connected: boolean
  readonly longLabels: boolean
}) {
  useEffect(() => {
    effectCounts = { ...effectCounts, setup: effectCounts.setup + 1 }
    emit()
    return () => {
      effectCounts = { ...effectCounts, cleanup: effectCounts.cleanup + 1 }
      emit()
    }
  }, [])
  const mainRef = useRef<HTMLElement>(null)
  const toolRef = useRef<HTMLElement>(null)
  const modal = useRef<HTMLDialogElement>(null)
  const popover = useRef<HTMLDivElement>(null)
  const [toolPresentation, setToolPresentation] = useState<LumenToolPresentation>('none')
  const presentation = useHbarRuntimeState(runtime.view.state.presentation)
  const timeline = useHbarRuntimeState(runtime.view.state.timeline)
  const tabs = useHbarRuntimeState(runtime.view.state.workspaceTabs)
  const actions = useHbarRuntimeState(runtime.view.state.runActions)
  const labels = copy(locale)
  const base = getSessionStopCopy(locale)
  const stopLabels = longLabels ? { ...base, unknown: base.unknown.repeat(5), check: base.check.repeat(8) } : base
  return (
    <HbarSessionStopProvider
      labels={stopLabels}
      connected={connected}
      mainRef={mainRef}
      toolRef={toolRef}
      toolPresentation={toolPresentation}
    >
      <LumenFrame
        data-fixture-ready={timeline.status}
        data-session={timeline.sessionId}
        data-owner={runtime.view.instanceId}
        data-tab={tabs.items.find((tab) => tab.id === tabs.activeId)?.instanceKey ?? ''}
        data-actions={JSON.stringify(actions)}
      />
      <LumenAppShell
        label={labels.main}
        sidebarWidthRem={12}
        sidebarOpen={false}
        closeSidebarLabel={labels.close}
        onCloseSidebar={() => undefined}
        mainRef={mainRef}
        toolRef={toolRef}
        toolLayout={{ mainMinWidthRem: 20, minWidthRem: 20, maxWidthRem: 35 }}
        onToolPresentationChange={setToolPresentation}
        toolLabel={labels.tool}
        tool={
          presentation.toolInstanceId ? (
            <LumenFrame className="stop-fixture-body">
              <HbarSessionStopNotice region="tool" />
              <LumenInput data-file="" aria-label={labels.file} defaultValue="preserved file draft" />
            </LumenFrame>
          ) : null
        }
      >
        <Body locale={locale} />
        <LumenFrame className="stop-fixture-controls">
          <LumenButton data-overlay-open="modal" onClick={() => modal.current?.showModal()}>
            {labels.overlay}
          </LumenButton>
          <LumenButton data-overlay-open="popover" onClick={() => popover.current?.showPopover()}>
            {labels.overlay}
          </LumenButton>
          <details data-overlay-menu="">
            <summary>{labels.overlay}</summary>
            <LumenFrame role="menu">
              <LumenInput data-overlay-input="menu" aria-label={labels.overlay} />
            </LumenFrame>
          </details>
        </LumenFrame>
        <LumenFrame as="dialog" ref={modal} aria-label={labels.overlay}>
          <LumenInput data-overlay-input="modal" aria-label={labels.overlay} />
          <LumenButton data-overlay-close="modal" onClick={() => modal.current?.close()}>
            {labels.close}
          </LumenButton>
        </LumenFrame>
        <LumenFrame ref={popover} popover="auto" aria-label={labels.overlay}>
          <LumenInput data-overlay-input="popover" aria-label={labels.overlay} />
          <LumenButton data-overlay-close="popover" onClick={() => popover.current?.hidePopover()}>
            {labels.close}
          </LumenButton>
        </LumenFrame>
      </LumenAppShell>
    </HbarSessionStopProvider>
  )
}
function Fixture({
  initial,
  locale,
}: {
  readonly initial: Awaited<ReturnType<typeof createFixtureRuntime>>
  readonly locale: ShellLocale
}) {
  const [runtime, setRuntime] = useState(initial)
  const [connected, setConnected] = useState(true)
  const [mounted, setMounted] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const logged = useSyncExternalStore(callsReader.subscribe, callsReader.getSnapshot)
  const effects = useSyncExternalStore(effectReader.subscribe, effectReader.getSnapshot)
  const labels = copy(locale)
  const perform = async (name: string) => {
    if (name === 'a' || name === 'b')
      await runtime.view.commands.execute('app.setSession', { workspaceId: 'w', sessionId: name })
    else if (name === 'reopen') {
      const id = runtime.view.state.navigation.getSnapshot().sessionId
      if (!id) throw new Error('Missing active fixture session')
      await runtime.workspaceTabs.closeCaptured(runtime.workspaceTabs.capture([id]), new AbortController().signal)
      await runtime.view.commands.execute('app.setSession', { workspaceId: 'w', sessionId: id })
    } else if (name === 'owner') {
      const next = await createFixtureRuntime()
      runtime.dispose()
      setRuntime(next)
    } else if (name === 'stale') capturedCancel?.()
    else if (name === 'unmount' || name === 'mount') setMounted(name === 'mount')
    else if (name === 'online' || name === 'offline') setConnected(name === 'online')
    else if (name === 'settings') await runtime.view.commands.execute('app.openSettings', { scope: 'global' })
    else if (name === 'files') {
      const current = runtime.view.state.navigation.getSnapshot()
      const tab = runtime.view.state.workspaceTabs.getSnapshot().items.find((item) => item.id === current.sessionId)
      if (!current.sessionId) throw new Error('Missing fixture session')
      await runtime.view.commands.execute('sessionTools.open', {
        panelId: 'files',
        workspaceId: 'w',
        sessionId: current.sessionId,
        sourceTabInstanceKey: tab?.instanceKey ?? null,
      })
    } else settle(name)
  }
  return (
    <LumenFrame className="stop-fixture">
      <LumenText as="h1">{labels.title}</LumenText>
      <LumenFrame className="stop-fixture-controls">
        {Object.entries(labels.controls).map(([name, label]) => (
          <LumenButton
            size="s"
            key={name}
            data-action={name}
            onClick={() => {
              void perform(name).catch((reason: unknown) =>
                setError(reason instanceof Error ? reason.message : 'Fixture error'),
              )
            }}
          >
            {label}
          </LumenButton>
        ))}
      </LumenFrame>
      <LumenFrame
        data-log={JSON.stringify(logged)}
        data-effect-setup={effects.setup}
        data-effect-cleanup={effects.cleanup}
        data-fixture-error={error ?? ''}
      />
      {mounted && (
        <HbarRuntimeProvider view={runtime.view}>
          <RuntimeView
            runtime={runtime}
            locale={locale}
            connected={connected}
            longLabels={new URL(location.href).searchParams.has('long-labels')}
          />
        </HbarRuntimeProvider>
      )}
    </LumenFrame>
  )
}
const container = document.getElementById('root')
if (!container) throw new Error('Missing Stop fixture root')
const locale = resolveShellLocale(navigator.languages)
document.documentElement.lang = locale
const initial = await createFixtureRuntime()
window.addEventListener(
  'pagehide',
  () => {
    for (const runtime of ownedRuntimes) runtime.dispose()
  },
  { once: true },
)
createRoot(container).render(
  <StrictMode>
    <LumenProvider appearance={createWebLumenAppearance('light', DEFAULT_WEB_APPEARANCE_DIMENSIONS, false)}>
      <Fixture initial={initial} locale={locale} />
    </LumenProvider>
  </StrictMode>,
)
