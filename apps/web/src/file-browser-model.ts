import { createStore } from 'zustand/vanilla'
import type { FileEntry } from '@hbar/contracts'

export interface FileBrowserTransport {
  identity(): object
  list(workspaceId: string, path: string): Promise<readonly FileEntry[]>
  read(workspaceId: string, path: string): Promise<string>
}
interface Resource<T> {
  readonly data: T
  readonly loading: boolean
  readonly error?: string
  readonly source: object
}
export interface FileBrowserState {
  readonly paths: Readonly<Record<string, string>>
  readonly directories: Readonly<Record<string, Resource<readonly FileEntry[]>>>
  readonly documents: Readonly<Record<string, Resource<string>>>
  openDirectory(workspaceId: string, path: string): Promise<void>
  navigate(workspaceId: string, path: string): void
  openDocument(workspaceId: string, path: string): Promise<void>
  clear(): void
}
export function fileResourceKey(workspaceId: string, path: string): string {
  return JSON.stringify([workspaceId, path])
}
const MAX_CACHED_RESOURCES = 32
function withResource<T>(
  resources: Readonly<Record<string, Resource<T>>>,
  key: string,
  value: Resource<T>,
): Readonly<Record<string, Resource<T>>> {
  const entries = Object.entries(resources).filter(([id]) => id !== key)
  return Object.fromEntries([...entries.slice(-(MAX_CACHED_RESOURCES - 1)), [key, value]])
}

export function createFileBrowserModel(transport: FileBrowserTransport) {
  let generation = 0
  const requests = new Map<string, symbol>()
  return createStore<FileBrowserState>((set) => {
    async function load(kind: 'directory' | 'document', workspaceId: string, path: string): Promise<void> {
      const source = transport.identity(),
        epoch = generation,
        key = fileResourceKey(workspaceId, path)
      const requestKey = `${kind}:${key}`,
        request = Symbol(requestKey)
      requests.set(requestKey, request)
      if (kind === 'directory')
        set((state) => ({
          paths: { ...state.paths, [workspaceId]: path },
          directories: withResource(state.directories, key, { data: [], loading: true, source }),
        }))
      else set((state) => ({ documents: withResource(state.documents, key, { data: '', loading: true, source }) }))
      const current = () =>
        generation === epoch && transport.identity() === source && requests.get(requestKey) === request
      try {
        if (kind === 'directory') {
          const data = await transport.list(workspaceId, path)
          if (current())
            set((state) => ({ directories: withResource(state.directories, key, { data, loading: false, source }) }))
        } else {
          const data = await transport.read(workspaceId, path)
          if (current())
            set((state) => ({ documents: withResource(state.documents, key, { data, loading: false, source }) }))
        }
      } catch (cause) {
        if (!current()) return
        const error = cause instanceof Error ? cause.message : String(cause)
        if (kind === 'directory')
          set((state) => ({
            directories: withResource(state.directories, key, { data: [], error, loading: false, source }),
          }))
        else
          set((state) => ({
            documents: withResource(state.documents, key, { data: '', error, loading: false, source }),
          }))
      } finally {
        if (requests.get(requestKey) === request) requests.delete(requestKey)
      }
    }
    return {
      paths: {},
      directories: {},
      documents: {},
      navigate: (workspaceId, path) => set((state) => ({ paths: { ...state.paths, [workspaceId]: path } })),
      openDirectory: (workspaceId, path) => load('directory', workspaceId, path),
      openDocument: (workspaceId, path) => load('document', workspaceId, path),
      clear() {
        generation++
        requests.clear()
        set({ paths: {}, directories: {}, documents: {} })
      },
    }
  })
}
