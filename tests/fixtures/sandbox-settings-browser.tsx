import { createRoot } from 'react-dom/client'
import { CommandError, type CommandExecutor } from '@hbar/commands'
import { createAppRuntime } from '@hbar/app-runtime'
import { HbarRuntimeProvider, HbarSandboxProfileSettings } from '@hbar/app-react'
import { sandboxCommands } from '@hbar/contracts/commands/sandbox'
import { sandboxProfileSchema, type SandboxProfile } from '@hbar/contracts/sandbox'
import { LumenFrame, LumenProvider, DEFAULT_LUMEN_APPEARANCE } from '@lumen/app-ui'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import '@lumen/app-ui/styles.css'

export interface SandboxFixtureInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly suffix: string
  readonly count: number
  readonly rows: number
  readonly failure: 'none' | 'duplicates' | 'list-error' | 'missing' | 'save-failed' | 'save-unknown' | 'invalid'
}
declare global {
  interface Window {
    mountSandboxSettings(input: SandboxFixtureInput): Promise<void>
    releaseSandboxSettings(): void
    reverseSandboxProfiles(): Promise<void>
    sandboxBoundaryAccepted(rows: number): boolean
    sandboxFixtureSnapshot(): {
      readonly profileId: string | null
      readonly editorId: string | null
      readonly selectedName: string | null
      readonly modelStatus: string | null
      readonly writeKeys: readonly string[]
      readonly targets: readonly string[]
    }
  }
}
function profile(index: number, rows: number): SandboxProfile {
  return sandboxProfileSchema.parse({
    id: index === 0 ? ':read-only' : index === 1 ? ':workspace-write' : `original-profile-${index}`,
    builtin: index < 2,
    name: `Original profile ${index} — 原始沙盒配置名称 `.repeat(3),
    description: '',
    extends: null,
    escalation: 'deny',
    filesystem: {
      default: 'read',
      grants: Array.from({ length: rows }, (_, row) => ({ path: `src/original-${row}`, access: 'write' })),
    },
    commands: {
      rules: Array.from({ length: Math.min(rows, 128) }, (_, row) => ({
        pattern: `bun test original-${row}`,
        decision: 'allow',
      })),
    },
    network: { enabled: false },
    tools: {
      rules: Array.from({ length: Math.min(rows, 64) }, (_, row) => ({
        tool: `original_tool_${row}`,
        decision: 'deny',
      })),
    },
    environment: {
      set: Object.fromEntries(
        Array.from({ length: Math.min(rows, 64) }, (_, row) => [`ORIGINAL_${row}`, `value-${row}`]),
      ),
    },
    revision: 4,
    createdAt: 1,
    updatedAt: 1,
  })
}
window.sandboxBoundaryAccepted = (rows) => {
  try {
    profile(2, rows)
    return true
  } catch {
    return false
  }
}
window.mountSandboxSettings = async (input) => {
  const container = document.getElementById('sandbox-settings-fixture')
  if (!container) throw new Error('Missing owned Sandbox root')
  let summaries = Array.from({ length: input.count }, (_, index) => {
    const value = profile(index, 0)
    return {
      id: value.id,
      name: value.name,
      builtin: value.builtin,
      description: value.description,
      extends: value.extends,
      revision: value.revision,
      updatedAt: value.updatedAt,
    }
  })
  const profiles = new Map(summaries.map((entry, index) => [entry.id, profile(index, input.rows)]))
  const target = summaries[2]
  if (input.failure === 'duplicates' && target)
    summaries = [...summaries, { ...target, name: 'Rejected duplicate source' }]
  const writeKeys: string[] = []
  const targets: string[] = []
  let lost = false
  let receipt: SandboxProfile | null = null
  const sandbox: CommandExecutor = {
    async execute(name, value, options) {
      if (name === 'sandbox.list') {
        if (input.failure === 'list-error') throw new CommandError('TIMEOUT', 'Owned Sandbox list read failed')
        return sandboxCommands['sandbox.list'].output.parse({ items: summaries })
      }
      if (name === 'sandbox.get') {
        const query = sandboxCommands['sandbox.get'].input.parse(value)
        const current = profiles.get(query.id)
        return input.failure === 'missing' || !current ? null : { profile: current, resolved: null, resolveError: null }
      }
      if (name === 'sandbox.save') {
        const parsed = sandboxCommands['sandbox.save'].input.parse(value)
        if (input.failure === 'save-failed') throw new CommandError('INVALID_INPUT', 'Owned rejected Sandbox save')
        const { expectedRevision, ...fields } = parsed
        const original = profiles.get(parsed.id)
        if (expectedRevision !== (original?.revision ?? null))
          throw new CommandError('COMMAND_CONFLICT', 'Owned Sandbox revision conflict')
        receipt = sandboxProfileSchema.parse({
          ...fields,
          builtin: false,
          revision: (original?.revision ?? 0) + 1,
          createdAt: 1,
          updatedAt: 2,
        })
        profiles.set(parsed.id, receipt)
        targets.push(parsed.id)
        writeKeys.push(options?.idempotencyKey ?? 'missing-key')
        if (!lost && input.failure === 'save-unknown') {
          lost = true
          throw new CommandError('CONNECTION_CLOSED', 'Owned response lost after original save')
        }
        return receipt
      }
      if (name === 'sandbox.receipt') return receipt
      throw new Error(`Unexpected owned Sandbox command ${name}`)
    },
  }
  const directory: CommandExecutor = {
    execute(name) {
      if (name === 'workspace.list' || name === 'session.list') return Promise.resolve({ items: [], nextCursor: null })
      if (name === 'workspace.get' || name === 'session.get') return Promise.resolve(null)
      return Promise.reject(new Error(`Unexpected owned directory command ${name}`))
    },
  }
  const runtime = createAppRuntime({ instanceId: 'owned-sandbox', hostId: 'host', directory, sandbox })
  const root = createRoot(container)
  window.releaseSandboxSettings = () => {
    root.unmount()
    runtime.dispose()
  }
  window.reverseSandboxProfiles = async () => {
    summaries = [...summaries].reverse()
    await runtime.view.commands.execute('sandboxProfiles.refresh', {})
  }
  window.sandboxFixtureSnapshot = () => {
    const editor = runtime.view.state.sandboxProfiles.getSnapshot().editor
    return {
      profileId: editor?.profileId ?? null,
      editorId: editor?.editorId ?? null,
      selectedName: editor?.draft.name ?? null,
      modelStatus: editor?.status ?? null,
      writeKeys,
      targets,
    }
  }
  if (input.failure !== 'list-error') {
    await runtime.view.commands.execute('sandboxProfiles.refresh', {})
    if (target)
      await runtime.view.commands.execute('sandboxProfiles.open', { target: { kind: 'existing', id: target.id } })
    if (input.failure === 'invalid') {
      const editor = runtime.view.state.sandboxProfiles.getSnapshot().editor
      const row = editor?.draft.grants[0]
      if (!editor || !row) throw new Error('Missing original Sandbox invalid-row target')
      await runtime.view.commands.execute('sandboxProfiles.edit', {
        editorId: editor.editorId,
        edit: { kind: 'grant', rowId: row.rowId, path: '' },
      })
    }
  }
  const copy = getShellCopy(input.locale).sandbox
  const labels = {
    ...copy,
    title: copy.title + input.suffix,
    refresh: copy.refresh + input.suffix,
    create: copy.create + input.suffix,
    save: copy.save + input.suffix,
    discard: copy.discard + input.suffix,
    fields: { ...copy.fields, name: copy.fields.name + input.suffix, extends: copy.fields.extends + input.suffix },
    grants: { ...copy.grants, title: copy.grants.title + input.suffix, add: copy.grants.add + input.suffix },
    commands: { ...copy.commands, title: copy.commands.title + input.suffix },
    tools: { ...copy.tools, title: copy.tools.title + input.suffix },
    environment: { ...copy.environment, title: copy.environment.title + input.suffix },
  }
  root.render(
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, motion: false }}>
      <LumenFrame className="sandbox-fixture-pane">
        <HbarRuntimeProvider view={runtime.view}>
          <HbarSandboxProfileSettings labels={labels} connected />
        </HbarRuntimeProvider>
      </LumenFrame>
    </LumenProvider>,
  )
}
