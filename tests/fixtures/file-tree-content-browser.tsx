import { useSyncExternalStore } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createAppRuntime } from '@hbar/app-runtime'
import { CommandError } from '@hbar/commands'
import { fileCommands } from '@hbar/contracts/commands/files'
import { LumenProvider, DEFAULT_LUMEN_APPEARANCE } from '@lumen/app-ui'
import { HbarFileTree } from '../../packages/app-react/src/file-workspace-tree'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import '@lumen/app-ui/styles.css'

export interface FileTreeContentInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly view: 'root' | 'folder' | 'search' | 'breadcrumb' | 'deep'
  readonly count: number
  readonly suffix: string
  readonly state:
    'ready' | 'loading' | 'error' | 'offline' | 'search-empty' | 'search-error' | 'folder-error' | 'truncated'
}
interface Call {
  readonly action: string
  readonly path: string
}
declare global {
  interface Window {
    mountFileTreeContent(input: FileTreeContentInput): Promise<void>
    fileTreeContentState(): {
      readonly calls: readonly Call[]
      readonly entry: import('@hbar/app-runtime').FileWorkspaceEntryState | undefined
    }
    repairFileTreeContent(): void
    shrinkFileTreeContent(): Promise<void>
    disposeFileTreeContent?: () => void
  }
}
const title = (index: number) => `原始条目 ${index} Complete original file name `.repeat(3).trim() + '.md'
const folderName = '原始目录 Complete original directory name '.repeat(3).trim()
let root: Root | undefined
let runtime: ReturnType<typeof createAppRuntime> | undefined
let releasePrevious: (() => void) | undefined
window.mountFileTreeContent = async (input) => {
  const element = document.getElementById('file-tree-content-fixture')
  if (!element) throw new Error('Missing owned file tree fixture')
  root?.unmount()
  releasePrevious?.()
  runtime?.dispose()
  let failed = input.state === 'error' || input.state === 'folder-error' || input.state === 'search-error'
  let shrink = false
  let release: (() => void) | undefined
  const held =
    input.state === 'loading'
      ? new Promise<void>((resolve) => {
          release = resolve
        })
      : Promise.resolve()
  const calls: Call[] = []
  releasePrevious = release
  let shouldHold = false
  const deepNames = Array.from({ length: 8 }, (_, index) => title(index))
  const entries = (parent: string) => {
    if (input.view === 'deep') {
      const depth = parent === '.' ? 0 : parent.split('/').length
      return depth < 8
        ? [
            {
              name: title(depth),
              path: parent === '.' ? deepNames[depth]! : `${parent}/${deepNames[depth]}`,
              directory: true,
            },
          ]
        : []
    }
    if (parent === '.' && (input.view === 'folder' || input.view === 'breadcrumb'))
      return [{ name: folderName, path: folderName, directory: true }]
    return Array.from({ length: shrink ? Math.min(1, input.count) : input.count }, (_, index) => ({
      name: title(index),
      path: parent === '.' ? title(index) : `${parent}/${title(index)}`,
      directory: false,
    }))
  }
  const owned = createAppRuntime({
    instanceId: 'file-tree-content',
    hostId: 'owned-fixture',
    surfaces: { canRender: (id) => id === 'files' },
    directory: { execute: () => Promise.reject(new Error('Unused fixture directory command')) },
    files: {
      async execute(name, raw) {
        if (name === 'file.list') {
          const request = fileCommands['file.list'].input.parse(raw)
          if (shouldHold) await held
          if (failed && (input.state !== 'folder-error' || request.path !== '.'))
            throw new CommandError('EXECUTION_FAILED', 'Owned folder fixture failure')
          const all = entries(request.path)
          const start = request.after ? all.findIndex((item) => item.path === request.after) + 1 : 0
          const items = all.slice(start, start + request.limit)
          const last = items.at(-1)
          return { items, ...(last && start + items.length < all.length ? { nextCursor: last.path } : {}) }
        }
        if (name === 'file.find') {
          const request = fileCommands['file.find'].input.parse(raw)
          if (failed) throw new CommandError('EXECUTION_FAILED', 'Owned search fixture failure')
          const paths =
            input.state === 'search-empty'
              ? []
              : Array.from(
                  { length: shrink ? Math.min(1, input.count) : Math.min(input.count, request.limit) },
                  (_, index) => `${folderName}/${title(index)}`,
                )
          return {
            paths,
            truncated: input.state === 'truncated' || input.count > request.limit,
            filesChecked: input.count,
          }
        }
        throw new Error(`Unexpected owned file tree command ${name}`)
      },
    },
  })
  runtime = owned
  await owned.ready
  const execute = owned.view.commands.execute
  await execute('app.openPanel', {
    instanceId: 'owned-tree',
    panelId: 'files',
    workspaceId: 'original-workspace',
    binding: 'pinned',
  })
  const refresh = execute('fileWorkspace.refresh', { instanceId: 'owned-tree' })
  await refresh.catch((error: unknown) => {
    if (!failed) throw error
  })
  if (input.state === 'loading') {
    shouldHold = true
    void execute('fileWorkspace.refresh', { instanceId: 'owned-tree' }).catch(() => {})
  }
  if (input.view === 'folder')
    await execute('fileWorkspace.toggleTree', {
      instanceId: 'owned-tree',
      workspaceId: 'original-workspace',
      path: folderName,
    }).catch((error: unknown) => {
      if (!failed) throw error
    })
  if (input.view === 'breadcrumb')
    await execute('fileWorkspace.openEntry', {
      instanceId: 'owned-tree',
      workspaceId: 'original-workspace',
      path: folderName,
      directory: true,
      preservePreview: true,
    })
  if (input.view === 'deep') {
    for (let depth = 0; depth < 7; depth++)
      await execute('fileWorkspace.toggleTree', {
        instanceId: 'owned-tree',
        workspaceId: 'original-workspace',
        path: deepNames.slice(0, depth + 1).join('/'),
      })
  }
  if (input.view === 'search')
    await execute('fileWorkspace.filterTree', {
      instanceId: 'owned-tree',
      workspaceId: 'original-workspace',
      filter: 'original',
    })
  const base = getShellCopy(input.locale).files.tree
  const labels = {
    ...base,
    loading: base.loading + input.suffix,
    searching: base.searching + input.suffix,
    empty: base.empty + input.suffix,
    noMatches: base.noMatches + input.suffix,
    filterScope: base.filterScope + input.suffix,
    searchScope: base.searchScope + input.suffix,
    rootLimit: base.rootLimit + input.suffix,
    folderLimit: base.folderLimit + input.suffix,
    searchLimit: base.searchLimit + input.suffix,
    root: base.root + input.suffix,
    retry: base.retry + input.suffix,
    loadMore: base.loadMore + input.suffix,
    refreshSearch: base.refreshSearch + input.suffix,
    error: (code: string) => base.error(code) + input.suffix,
    searchError: (code: string) => base.searchError(code) + input.suffix,
  }
  const invoke = (name: Parameters<typeof execute>[0], values: Readonly<Record<string, unknown>>) => {
    void execute(name, { instanceId: 'owned-tree', ...values }).catch(() => {})
  }
  window.repairFileTreeContent = () => {
    failed = false
    release?.()
  }
  window.shrinkFileTreeContent = async () => {
    shrink = true
    await execute('fileWorkspace.filterTree', {
      instanceId: 'owned-tree',
      workspaceId: 'original-workspace',
      filter: 'changed-original',
    })
  }
  window.fileTreeContentState = () => ({ calls, entry: owned.view.state.files.getSnapshot().entries['owned-tree'] })
  window.disposeFileTreeContent = () => {
    release?.()
    owned.dispose()
    root?.unmount()
  }
  function Fixture() {
    const state = useSyncExternalStore(owned.view.state.files.subscribe, owned.view.state.files.getSnapshot)
    return (
      <LumenProvider
        className="file-tree-fixture-provider"
        appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, motion: false }}
      >
        <HbarFileTree
          entry={state.entries['owned-tree']}
          labels={labels}
          connected={input.state !== 'offline'}
          selectedPath={input.view === 'search' ? `${folderName}/${title(0)}` : title(0)}
          onFilter={(filter) => invoke('fileWorkspace.filterTree', { workspaceId: 'original-workspace', filter })}
          onToggle={(path) => invoke('fileWorkspace.toggleTree', { workspaceId: 'original-workspace', path })}
          onRefreshNode={(path) => invoke('fileWorkspace.refreshTree', { workspaceId: 'original-workspace', path })}
          onMoreNode={(path) => invoke('fileWorkspace.loadMoreTree', { workspaceId: 'original-workspace', path })}
          onOpenFile={(path) => calls.push({ action: 'open-file', path })}
          onNavigateFolder={(path) => {
            calls.push({ action: 'open-folder', path })
            invoke('fileWorkspace.openEntry', {
              workspaceId: 'original-workspace',
              path,
              directory: true,
              preservePreview: true,
            })
          }}
          onMoreRoot={() => invoke('fileWorkspace.loadMore', {})}
          onRefreshRoot={() => invoke('fileWorkspace.refresh', { preservePreview: true })}
        />
      </LumenProvider>
    )
  }
  root = createRoot(element)
  root.render(<Fixture />)
}
