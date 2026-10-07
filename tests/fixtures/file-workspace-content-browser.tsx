import { createRoot, type Root } from 'react-dom/client'
import { createAppRuntime } from '@hbar/app-runtime'
import { CommandError } from '@hbar/commands'
import { fileCommands } from '@hbar/contracts/commands/files'
import { HbarFileWorkspace, HbarRuntimeProvider } from '@hbar/app-react'
import { LumenProvider, DEFAULT_LUMEN_APPEARANCE } from '@lumen/app-ui'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import '@lumen/app-ui/styles.css'

export interface FileWorkspaceContentInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly state: 'dirty' | 'failed' | 'unknown' | 'oversize' | 'action-error' | 'reading'
  readonly path: string
  readonly source: string
  readonly sha256: string
  readonly suffix: string
}
declare global {
  interface Window {
    mountFileWorkspaceContent(input: FileWorkspaceContentInput): Promise<void>
    fileWorkspaceContentState(): {
      readonly reads: number
      readonly writes: readonly { workspaceId: string; path: string; text: string }[]
      readonly document: import('@hbar/app-runtime').FileWorkspaceEntryState['document'] | undefined
    }
    disposeFileWorkspaceContent?: () => void
  }
}
let root: Root | undefined
let runtime: ReturnType<typeof createAppRuntime> | undefined
window.mountFileWorkspaceContent = async (input) => {
  window.disposeFileWorkspaceContent?.()
  const element = document.getElementById('file-workspace-content-fixture')
  if (!element) throw new Error('Missing owned file workspace fixture')
  let reads = 0
  const writes: { workspaceId: string; path: string; text: string }[] = []
  const owned = createAppRuntime({
    instanceId: 'file-workspace-content',
    hostId: 'owned-fixture',
    surfaces: { canRender: (id) => id === 'files' },
    directory: { execute: () => Promise.reject(new Error('Unused fixture directory command')) },
    files: {
      execute(name, raw) {
        if (name === 'file.list') {
          fileCommands['file.list'].input.parse(raw)
          return Promise.resolve({ items: [{ name: input.path, path: input.path, directory: false }] })
        }
        if (name === 'file.read') {
          const request = fileCommands['file.read'].input.parse(raw)
          reads++
          return Promise.resolve({
            ...request,
            text: input.source,
            size: new TextEncoder().encode(input.source).byteLength,
            sha256: input.sha256,
          })
        }
        if (name === 'file.write') {
          const request = fileCommands['file.write'].input.parse(raw)
          writes.push({ workspaceId: request.workspaceId, path: request.path, text: request.text })
          return Promise.reject(
            new CommandError(input.state === 'unknown' ? 'CONNECTION_CLOSED' : 'FILE_CONFLICT', 'Owned save failure'),
          )
        }
        return Promise.reject(new Error(`Unexpected owned file command: ${name}`))
      },
    },
  })
  runtime = owned
  await owned.ready
  const execute: typeof owned.view.commands.execute = async (name, raw, options) => {
    try {
      return await owned.view.commands.execute(name, raw, options)
    } catch (error) {
      throw new Error(
        `${name}: ${error instanceof CommandError ? JSON.stringify({ code: error.code, issues: error.issues }) : String(error)}`,
        { cause: error },
      )
    }
  }
  await execute('app.openPanel', {
    instanceId: 'files',
    panelId: 'files',
    workspaceId: 'original-workspace',
    binding: 'pinned',
  })
  await execute('fileWorkspace.refresh', { instanceId: 'files' })
  await execute('fileWorkspace.openEntry', { instanceId: 'files', path: input.path, directory: false })
  if (input.state !== 'reading')
    await execute('fileWorkspace.setText', {
      instanceId: 'files',
      text: input.state === 'oversize' ? 'x'.repeat(128 * 1024 + 1) : 'Original preserved draft 原始草稿',
    })
  await execute('fileWorkspace.setDocumentMode', {
    instanceId: 'files',
    workspaceId: 'original-workspace',
    path: input.path,
    mode: input.state === 'oversize' || input.state === 'reading' ? 'preview' : 'edit',
  })
  if (input.state === 'failed' || input.state === 'unknown')
    await owned.view.commands.execute('fileWorkspace.save', { instanceId: 'files' }).catch((error: unknown) => {
      if (!(error instanceof CommandError)) throw error
    })
  const base = getShellCopy(input.locale).files
  const labels = {
    ...base,
    dirty: base.dirty + input.suffix,
    reloadDescription: base.reloadDescription + input.suffix,
    reloadTitle: (path: string) => base.reloadTitle(path) + input.suffix,
    markdownTooLarge: base.markdownTooLarge + input.suffix,
    addNoSource: base.addNoSource + input.suffix,
    error: (code: string) => base.error(code) + input.suffix,
  }
  window.fileWorkspaceContentState = () => ({
    reads,
    writes,
    document: owned.view.state.files.getSnapshot().entries.files?.document,
  })
  window.disposeFileWorkspaceContent = () => {
    root?.unmount()
    runtime?.dispose()
    root = undefined
    runtime = undefined
  }
  root = createRoot(element)
  root.render(
    <LumenProvider
      className="file-workspace-fixture-provider"
      appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, motion: false }}
    >
      <HbarRuntimeProvider view={owned.view}>
        <HbarFileWorkspace
          labels={labels}
          connected
          actionError={input.state === 'action-error' ? input.suffix : null}
        />
      </HbarRuntimeProvider>
    </LumenProvider>,
  )
}
