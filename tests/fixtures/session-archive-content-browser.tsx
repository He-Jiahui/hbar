import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createAppRuntime, type SessionArchiveBatchTarget, type SessionArchiveState } from '@hbar/app-runtime'
import { CommandError, type CommandExecutor } from '@hbar/commands'
import { directoryCommands, navigationCommands } from '@hbar/contracts/commands'
import type { Session } from '@hbar/contracts/directory'
import { HbarRuntimeProvider } from '@hbar/app-react'
import {
  ArchivedSessions,
  SessionArchiveBatchPanel,
  SessionArchiveFeedback,
  SessionArchiveRecovery,
} from '../../packages/app-react/src/session-archive'
import { LumenButton, LumenFrame, LumenProvider, DEFAULT_LUMEN_APPEARANCE } from '@lumen/app-ui'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import '@lumen/app-ui/styles.css'

export interface SessionArchiveContentInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly suffix: string
  readonly count: number
  readonly view: 'list' | 'batch' | 'selection' | 'feedback'
  readonly state: 'ready' | 'read-error' | 'duplicate' | 'oversize' | 'unknown' | 'failure' | 'pending' | 'offline'
}
declare global {
  interface Window {
    mountSessionArchiveContent(input: SessionArchiveContentInput): Promise<void>
    releaseSessionArchiveContent(): void
    repairSessionArchiveContent(): void
    reverseSessionArchiveContent(): Promise<void>
    sessionArchiveContentState(): {
      readonly calls: readonly { readonly name: string; readonly input: unknown }[]
      readonly state: Readonly<SessionArchiveState>
    }
    sessionArchiveContentBounds(): Readonly<Record<string, boolean>>
  }
}
window.mountSessionArchiveContent = async (input) => {
  const element = document.getElementById('session-archive-content-fixture')
  if (!element) throw new Error('Missing archive content fixture root')
  const workspace = {
    id: 'owned-workspace',
    name: '原始工程 Original project '.repeat(5).trim(),
    path: 'D:/owned-archive',
    createdAt: 1,
  }
  const other = { ...workspace, id: 'other-workspace', name: '另一个工程 Other project' }
  let sessions: Session[] = Array.from({ length: input.count }, (_, index) =>
    directoryCommands['session.get'].output.parse({
      id: `original-${String(index).padStart(3, '0')}`,
      workspaceId: input.view === 'batch' && index % 2 ? other.id : workspace.id,
      title: `原始会话 ${index} Complete original session title `.repeat(3).trim(),
      archived: input.view === 'list',
      parentId: null,
      seq: 1,
      createdAt: 100 + index,
      updatedAt: 200 + index,
    }),
  ).filter((session): session is Session => session !== null)
  let failed = false
  let releaseRead = () => {}
  const calls: { name: string; input: unknown }[] = []
  const directory: CommandExecutor = {
    async execute(name, value) {
      calls.push({ name, input: value })
      if (name === 'workspace.get') {
        const target = directoryCommands[name].input.parse(value)
        return [workspace, other].find((item) => item.id === target.workspaceId) ?? null
      }
      if (name === 'session.get') {
        const target = directoryCommands[name].input.parse(value)
        return sessions.find((item) => item.id === target.sessionId) ?? null
      }
      if (name === 'session.list') {
        const target = directoryCommands[name].input.parse(value)
        if (input.state === 'read-error' && failed) throw new CommandError('DISCONNECTED', 'Owned page read failed')
        const eligible = sessions.filter(
          (item) => item.workspaceId === target.workspaceId && (target.includeArchived || !item.archived),
        )
        const offset = target.after ? eligible.findIndex((item) => item.id === target.after) + 1 : 0
        const items = eligible.slice(offset, offset + target.limit)
        if (input.state === 'duplicate' && failed && items[0]) items.push(items[0])
        if (input.state === 'oversize' && failed && eligible[100]) items.push(eligible[100])
        return { items, nextCursor: offset + target.limit < eligible.length ? (items.at(-1)?.id ?? null) : null }
      }
      throw new Error(`Unexpected archive read ${name}`)
    },
  }
  const runtime = createAppRuntime({
    instanceId: 'owned-archive-content',
    hostId: 'owned-host',
    directory,
    workspaces: {
      async execute(name, value) {
        calls.push({ name, input: value })
        if (name !== 'session.archive') throw new Error(`Unexpected archive write ${name}`)
        const target = navigationCommands['app.archiveSession'].input.parse(value)
        const original = sessions.find((item) => item.id === target.sessionId)
        if (!original) throw new Error('A foreign archive target was written')
        if (input.state === 'failure' && failed) throw new CommandError('BUSY', 'Owned mutation rejected')
        if (input.state === 'pending' && failed)
          await new Promise<void>((resolve) => {
            releaseRead = resolve
          })
        const updated = {
          ...original,
          archived: target.archived,
          seq: original.seq + 1,
          updatedAt: original.updatedAt + 1,
        }
        sessions = sessions.map((item) => (item.id === original.id ? updated : item))
        if (input.state === 'unknown' && failed) throw new CommandError('CONNECTION_CLOSED', 'Owned write reply lost')
        return updated
      },
    },
  })
  await runtime.ready
  await runtime.view.commands.execute('workspace.get', { workspaceId: workspace.id })
  await runtime.view.commands.execute('workspace.get', { workspaceId: other.id })
  for (const session of sessions.slice(0, 100))
    await runtime.view.commands.execute('session.get', { sessionId: session.id })
  const targets: SessionArchiveBatchTarget[] = sessions
    .slice(0, 100)
    .map((item) => ({ workspaceId: item.workspaceId, sessionId: item.id, title: item.title }))
  if (input.view === 'list') {
    await runtime.view.commands.execute('archivedSessions.open', { workspaceId: workspace.id })
    failed = true
    if (input.state === 'read-error' || input.state === 'duplicate' || input.state === 'oversize') {
      const list = runtime.view.state.sessionArchive.getSnapshot().list
      await runtime.view.commands
        .execute('archivedSessions.load', { workspaceId: workspace.id, revision: list.revision, direction: 'first' })
        .catch(() => {})
    }
  } else if (input.view === 'batch' && targets.length) {
    await runtime.view.commands.execute('sessionArchiveBatch.begin', {
      targets: targets.map(({ workspaceId, sessionId }) => ({ workspaceId, sessionId })),
    })
    failed = true
  } else if (input.view === 'feedback' && targets[0]) {
    await runtime.view.commands.execute('sessionArchive.begin', {
      workspaceId: targets[0].workspaceId,
      sessionId: targets[0].sessionId,
    })
    failed = true
  }
  const base = getShellCopy(input.locale).shell
  const batchLabels = {
    ...base.archiveBatch,
    selectionTitle: base.archiveBatch.selectionTitle + input.suffix,
    previewTitle: (count: number) => base.archiveBatch.previewTitle(count) + input.suffix,
    pending: base.archiveBatch.pending + input.suffix,
    confirm: base.archiveBatch.confirm + input.suffix,
    cancel: base.archiveBatch.cancel + input.suffix,
    clearSelection: base.archiveBatch.clearSelection + input.suffix,
    exitSelection: base.archiveBatch.exitSelection + input.suffix,
    archiveSelected: base.archiveBatch.archiveSelected + input.suffix,
    reconcile: base.archiveBatch.reconcile + input.suffix,
    continue: base.archiveBatch.continue + input.suffix,
    dismiss: base.archiveBatch.dismiss + input.suffix,
  }
  const labels = {
    ...base.archive,
    listTitle: (name: string) => base.archive.listTitle(name) + input.suffix,
    confirmTitle: (title: string) => base.archive.confirmTitle(title) + input.suffix,
    restoreTitle: (title: string) => base.archive.restoreTitle(title) + input.suffix,
    close: base.archive.close + input.suffix,
    confirm: base.archive.confirm + input.suffix,
    cancel: base.archive.cancel + input.suffix,
    restore: base.archive.restore + input.suffix,
    nextPage: base.archive.nextPage + input.suffix,
    firstPage: base.archive.firstPage + input.suffix,
    dismiss: base.archive.dismiss + input.suffix,
    reconcile: base.archive.reconcile + input.suffix,
    page: (number: number) => base.archive.page(number) + input.suffix,
  }
  function Fixture() {
    const toolbar = useRef<HTMLButtonElement>(null)
    const [selected, setSelected] = useState(targets)
    const [selecting, setSelecting] = useState(input.view === 'selection' || input.view === 'batch')
    return (
      <HbarRuntimeProvider view={runtime.view}>
        <LumenFrame className="archive-fixture-toolbar" role="group" aria-label={batchLabels.enter} tabIndex={0}>
          <LumenButton ref={toolbar} onClick={() => setSelecting(true)}>
            {batchLabels.enter}
          </LumenButton>
        </LumenFrame>
        {input.view === 'list' ? (
          <>
            <ArchivedSessions
              getCloseFocusTarget={() => toolbar.current}
              workspaceId={workspace.id}
              workspaceName={workspace.name}
              labels={labels}
              connected={input.state !== 'offline'}
            />
            <SessionArchiveRecovery
              labels={labels}
              connected={input.state !== 'offline'}
              inlineSessionIds={new Set()}
            />
          </>
        ) : input.view === 'feedback' ? (
          <SessionArchiveFeedback labels={labels} connected={input.state !== 'offline'} focusCancel />
        ) : (
          <SessionArchiveBatchPanel
            labels={batchLabels}
            connected={input.state !== 'offline'}
            selecting={selecting}
            selectedTargets={selected}
            toolbarRef={toolbar}
            onClearSelection={() => setSelected([])}
            onExitSelection={() => setSelecting(false)}
            onBatchStarted={() => setSelecting(false)}
            onBatchCancelled={() => setSelecting(true)}
            onBatchDismissed={() => {
              setSelecting(false)
              setSelected([])
            }}
          />
        )}
      </HbarRuntimeProvider>
    )
  }
  const root = createRoot(element)
  root.render(
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, motion: false }}>
      <Fixture />
    </LumenProvider>,
  )
  window.releaseSessionArchiveContent = () => {
    releaseRead()
    root.unmount()
    runtime.dispose()
  }
  window.repairSessionArchiveContent = () => {
    failed = false
    releaseRead()
  }
  window.reverseSessionArchiveContent = async () => {
    sessions = [...sessions].reverse()
    const list = runtime.view.state.sessionArchive.getSnapshot().list
    if (list.open)
      await runtime.view.commands.execute('archivedSessions.load', {
        workspaceId: workspace.id,
        revision: list.revision,
        direction: 'first',
      })
  }
  window.sessionArchiveContentState = () => ({ calls, state: runtime.view.state.sessionArchive.getSnapshot() })
  window.sessionArchiveContentBounds = () => ({
    page200: directoryCommands['session.list'].output.safeParse({
      items: Array.from({ length: 200 }, (_, index) => ({ ...sessions[0], id: `bound-${index}` })),
      nextCursor: null,
    }).success,
    page201: directoryCommands['session.list'].output.safeParse({
      items: Array.from({ length: 201 }, (_, index) => ({ ...sessions[0], id: `bound-${index}` })),
      nextCursor: null,
    }).success,
    title160: directoryCommands['session.get'].output.safeParse({ ...sessions[0], title: 'a'.repeat(160) }).success,
    title161: directoryCommands['session.get'].output.safeParse({ ...sessions[0], title: 'a'.repeat(161) }).success,
  })
}
