import { lazy, Suspense, useEffect } from 'react'
import { useStore } from 'zustand'
import { HbarAppUiWorkspaceFiles, HbarAppUiFileDocument } from 'hbar-app-ui'
import { client, useConnection, useWorkbench } from './stores'
import { createFileBrowserModel, fileResourceKey } from './file-browser-model'
import { getWorkspaceFileCopy } from './app-ui-locale'
import { useLocale } from './locale'
import './file-viewer.css'

const CodeEditor = lazy(() => import('./CodeEditor'))
const disconnected = {}
const files = createFileBrowserModel({
  identity: () => useConnection.getState().client ?? disconnected,
  list: (workspaceId, path) => client().call('file.list', { workspaceId, path }),
  read: async (workspaceId, path) => (await client().call('file.read', { workspaceId, path })).text,
})

export default function Files({ onOpen }: { onOpen(path: string): void }) {
  const { locale } = useLocale()
  const workspaceId = useWorkbench((state) => state.workspaceId)
  const connection = useConnection((state) => state.client)
  const path = useStore(files, (state) => state.paths[workspaceId] ?? '.')
  const resource = useStore(files, (state) => state.directories[fileResourceKey(workspaceId, path)])
  const current = resource?.source === connection ? resource : undefined
  const load = () => {
    if (workspaceId && connection) void files.getState().openDirectory(workspaceId, path)
  }
  useEffect(() => {
    if (workspaceId && connection) void files.getState().openDirectory(workspaceId, path)
  }, [workspaceId, path, connection])
  return (
    <HbarAppUiWorkspaceFiles
      path={path}
      labels={getWorkspaceFileCopy(locale)}
      items={(current?.data ?? []).map((entry) => ({ id: entry.path, name: entry.name, directory: entry.directory }))}
      loading={current?.loading ?? Boolean(workspaceId && connection)}
      error={current?.error}
      onRefresh={load}
      onParent={() => {
        files.getState().navigate(workspaceId, path.includes('/') ? path.split('/').slice(0, -1).join('/') || '.' : '.')
      }}
      onOpen={(id) => {
        const entry = current?.data.find((item) => item.path === id)
        if (entry?.directory) files.getState().navigate(workspaceId, entry.path)
        else if (entry) onOpen(entry.path)
      }}
    />
  )
}

export function FileViewer({ path, workspaceId }: { path: string; workspaceId: string }) {
  const { locale } = useLocale()
  const connection = useConnection((state) => state.client)
  const resource = useStore(files, (state) => state.documents[fileResourceKey(workspaceId, path)])
  const current = resource?.source === connection ? resource : undefined
  useEffect(() => {
    if (connection) void files.getState().openDocument(workspaceId, path)
  }, [workspaceId, path, connection])
  return (
    <HbarAppUiFileDocument
      path={path}
      labels={getWorkspaceFileCopy(locale)}
      loading={current?.loading ?? true}
      error={current?.error}
      onRetry={() => {
        void files.getState().openDocument(workspaceId, path)
      }}
    >
      <Suspense fallback={<pre>{current?.data}</pre>}>
        <CodeEditor value={current?.data ?? ''} language={path.split('.').at(-1) ?? ''} />
      </Suspense>
    </HbarAppUiFileDocument>
  )
}
