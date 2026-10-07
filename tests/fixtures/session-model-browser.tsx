import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { LumenContentText, LumenFrame, LumenInput } from '@lumen/app-ui'
import { applyLumenAppearance, DEFAULT_LUMEN_APPEARANCE, type LumenMode } from '@lumen/app-ui/appearance'
import { HbarRuntimeProvider } from '@hbar/app-react'
import { HbarComposerModelPicker } from '../../packages/app-react/src/composer-model-picker'
import {
  createAppRuntime,
  type ComposerModelState,
  type SessionControlsState,
  type StateReader,
} from '@hbar/app-runtime'
import { CommandError, type CommandExecutor } from '@hbar/commands'
import { modelCommands, type ModelConfiguration, type ModelWriteResult } from '@hbar/contracts/commands/models'
import { getShellCopy, type ShellLocale } from '../../apps/web/src/shell-copy'
import '@lumen/app-ui/styles.css'

export interface SessionModelFixtureInput {
  readonly locale: ShellLocale
  readonly mode: LumenMode
  readonly sessionId: string
  readonly controls: SessionControlsState
  readonly catalog: ComposerModelState
  readonly presentation: 'native' | 'web'
  readonly connected?: boolean
  readonly disabled?: boolean
  readonly canSelect?: boolean
  readonly runActive?: boolean
  readonly openRequest?: number
  readonly readBehavior?: 'resolve' | 'fail' | 'defer'
  readonly writeBehavior?: 'resolve' | 'fail' | 'defer'
  readonly copy: {
    readonly outside: string
    readonly draft: string
    readonly suffix: string
    readonly readFailed?: string
  }
}
interface FixtureCall {
  readonly name: string
  readonly sessionId?: string
  readonly modelId?: string
}
declare global {
  interface Window {
    mountSessionModelFixture: (input: SessionModelFixtureInput) => Promise<void>
    updateSessionModelFixture: (input: SessionModelFixtureInput) => Promise<void>
    settleSessionModelFixture: (success: boolean) => void
    readSessionModelFixtureCalls: () => readonly FixtureCall[]
    releaseSessionModelFixture: () => void
  }
}
let current: SessionModelFixtureInput
const calls: FixtureCall[] = []
const configurations = new Map<string, ModelConfiguration>()
const listeners = new Set<() => void>()
let pending: { readonly resolve: () => void; readonly reject: (reason: unknown) => void } | null = null
async function defer(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    pending = { resolve, reject }
  })
}
function reader<T>(read: () => T): StateReader<T> {
  return {
    getSnapshot: read,
    subscribe: (notify) => {
      listeners.add(notify)
      return () => {
        listeners.delete(notify)
      }
    },
  }
}
function configuration(input: SessionModelFixtureInput): ModelConfiguration {
  return (
    input.controls.model ?? {
      sessionId: input.sessionId,
      status: 'unset',
      modelId: null,
      model: null,
      thinkingLevel: null,
      revisions: {},
      sources: { model: 'default', thinkingLevel: 'default' },
    }
  )
}
const port: CommandExecutor = {
  async execute(name, raw, options = {}) {
    if (name === 'model.list') {
      calls.push({ name })
      if (current.readBehavior === 'defer') await defer()
      if (current.readBehavior === 'fail') throw new CommandError('DISCONNECTED', 'Fixture read failed')
      return [...current.catalog.models]
    }
    if (name === 'session.getModel') {
      const input = modelCommands[name].input.parse(raw)
      calls.push({ name, sessionId: input.sessionId })
      const value = configurations.get(input.sessionId)
      if (!value) throw new Error('Missing original fixture configuration')
      return value
    }
    if (name === 'session.getModelReceipt') return null
    if (name === 'session.setModel' || name === 'session.setThinkingLevel') {
      const input = modelCommands[name].input.parse(raw)
      calls.push({ name, sessionId: input.sessionId, ...('modelId' in input ? { modelId: input.modelId } : {}) })
      const behavior = current.writeBehavior
      const originalModels = current.catalog.models
      if (behavior === 'defer') await defer()
      if (behavior === 'fail') throw new CommandError('INVALID_INPUT', 'Fixture rejects this original write')
      const previous = configurations.get(input.sessionId)
      const selected = 'modelId' in input ? originalModels.find((model) => model.id === input.modelId) : previous?.model
      if (!previous || !selected) throw new Error('Missing original model')
      const revision = (previous.revisions[`settings:session:${input.sessionId}`] ?? 0) + 1
      const next: ModelConfiguration = {
        ...previous,
        status: 'configured',
        modelId: selected.id,
        model: selected,
        thinkingLevel: 'thinkingLevel' in input ? input.thinkingLevel : selected.defaultThinkingLevel,
        revisions: { ...previous.revisions, [`settings:session:${input.sessionId}`]: revision },
      }
      configurations.set(input.sessionId, next)
      const result: ModelWriteResult = { ...next, commitId: options.idempotencyKey ?? 'fixture', revision }
      return result
    }
    throw new Error(`Unexpected model fixture command: ${name}`)
  },
}
const workspace = { id: 'workspace', name: 'Original workspace', path: 'D:/session-model-fixture', createdAt: 1 }
const runtime = createAppRuntime({
  instanceId: 'session-model-browser-fixture',
  hostId: 'fixture-host',
  models: port,
  directory: {
    async execute(name, raw) {
      calls.push({ name })
      if (name === 'workspace.get') return workspace
      if (
        name === 'session.get' &&
        raw &&
        typeof raw === 'object' &&
        'sessionId' in raw &&
        typeof raw.sessionId === 'string'
      ) {
        return {
          id: raw.sessionId,
          workspaceId: workspace.id,
          title: raw.sessionId,
          archived: false,
          parentId: null,
          createdAt: 1,
          updatedAt: 1,
          seq: 1,
        }
      }
      return { items: [], nextCursor: null }
    },
  },
})
const controls = reader(() => current.controls)
const catalog = reader(() => current.catalog)
const element = document.getElementById('session-model-fixture')
if (!element) throw new Error('Missing session model fixture root')
const root = createRoot(element)
function Fixture({ input }: { readonly input: SessionModelFixtureInput }) {
  const [draft, setDraft] = useState(input.copy.draft)
  const original = getShellCopy(input.locale).session.modelPicker
  const labels = {
    ...original,
    title: original.title + input.copy.suffix,
    readFailed: input.copy.readFailed ?? original.readFailed,
  }
  return (
    <HbarRuntimeProvider view={{ ...runtime.view, state: { ...runtime.view.state, controls, composerModel: catalog } }}>
      <LumenFrame className="session-model-fixture">
        <LumenFrame className="session-model-fixture-main">
          <LumenContentText context="workspace.title">{labels.title}</LumenContentText>
          <LumenInput
            aria-label={input.copy.outside}
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
          />
        </LumenFrame>
        <LumenFrame className="session-model-fixture-rail">
          <HbarComposerModelPicker
            sessionId={input.sessionId}
            connected={input.connected ?? true}
            disabled={input.disabled ?? false}
            canSelect={input.canSelect ?? true}
            runActive={input.runActive ?? false}
            labels={labels}
            menuPresentation={input.presentation}
            openRequest={input.openRequest ?? 0}
          />
        </LumenFrame>
      </LumenFrame>
    </HbarRuntimeProvider>
  )
}
async function render(input: SessionModelFixtureInput): Promise<void> {
  const changed = current?.sessionId !== input.sessionId
  current = input
  configurations.set(input.sessionId, configuration(input))
  if (changed) {
    try {
      await runtime.view.commands.execute('app.setSession', { sessionId: input.sessionId })
    } catch (error) {
      throw new Error(
        `Fixture navigation failed: ${error instanceof CommandError ? error.code : String(error)}; calls=${calls.map((call) => call.name).join(',')}`,
        { cause: error },
      )
    }
    if (input.readBehavior !== 'defer') {
      try {
        await runtime.view.commands.execute('composerModel.refresh', { sessionId: input.sessionId })
      } catch (error) {
        if (!(error instanceof CommandError)) throw error
      }
    }
  }
  applyLumenAppearance(document.documentElement, { ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode })
  flushSync(() => {
    for (const notify of listeners) notify()
    root.render(<Fixture input={input} />)
  })
}
window.mountSessionModelFixture = async (input) => {
  await runtime.ready
  await render(input)
}
window.updateSessionModelFixture = render
window.readSessionModelFixtureCalls = () => [...calls]
window.settleSessionModelFixture = (success) => {
  if (!pending) throw new Error('No pending original operation')
  const operation = pending
  pending = null
  if (success) operation.resolve()
  else operation.reject(new CommandError('INVALID_INPUT', 'Fixture failure'))
}
window.releaseSessionModelFixture = () => {
  root.unmount()
  runtime.dispose()
}
