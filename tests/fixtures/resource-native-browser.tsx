import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { LumenProvider, LumenButton, LumenDialog } from '@lumen/app-ui'
import '@lumen/app-ui/styles.css'
import { createAppRuntime, createMessageResources } from '@hbar/app-runtime'
import { useHbarRuntimeState } from '@hbar/app-react'
import { ResourceBrowser, ResourceBrowserLayer } from '../../apps/web/src/ResourceBrowser'
import {
  createResourceBrowserController,
  type NativeResourceBridge,
} from '../../apps/web/src/resource-browser-controller'
import { HbarMessageResourceLayer } from '../../packages/app-react/src/message-resource'
import { MessageMarkdown } from '../../packages/app-react/src/message-markdown'
import { resourceCopy } from '../../apps/web/src/resource-copy'
import { createWebLumenAppearance, DEFAULT_WEB_APPEARANCE_DIMENSIONS } from '../../apps/web/src/appearance'
import './resource-native-browser.css'

const runtime = createAppRuntime({
  instanceId: 'native-resource-fixture',
  hostId: 'fixture',
  surfaces: { canRender: (id) => id === 'browser' },
  directory: {
    execute: (name) =>
      Promise.resolve(
        name === 'workspace.get'
          ? { id: 'w', name: 'Workspace', path: '/fixture', createdAt: 1 }
          : name === 'session.get'
            ? {
                id: 's',
                workspaceId: 'w',
                title: 'Native fixture',
                createdAt: 1,
                updatedAt: 1,
                seq: 1,
                archived: false,
                parentId: null,
              }
            : { items: [], nextCursor: null },
      ),
  },
})
await runtime.ready
await runtime.view.commands.execute('app.setSession', { workspaceId: 'w', sessionId: 's' })
const source = {
  workspaceId: 'w',
  sessionId: 's',
  messageId: 'm',
  sourceTabInstanceKey: runtime.view.state.workspaceTabs.getSnapshot().items[0]!.instanceKey,
}
const bridge = (window as Window & { __TAURI_INTERNALS__?: NativeResourceBridge }).__TAURI_INTERNALS__
if (!bridge) throw new Error('This fixture requires the actual desktop WebView')
const controller = createResourceBrowserController(runtime.view, bridge)
const labels = resourceCopy('en-US')
const url = new URL('../../artifacts/resource-references/native-page-1.html', import.meta.url).href
const model = createMessageResources({
  owns: () => true,
  target: () => Promise.resolve({ sessionId: 's', expectedRevision: 0 }),
  resolve: () =>
    Promise.resolve({
      candidates: [
        {
          id: 'a'.repeat(64),
          kind: 'web',
          name: 'Native browser fixture',
          location: url,
          directory: location.origin,
          workspacePath: null,
          mime: null,
          size: null,
        },
      ],
      truncated: false,
    }),
  text: () => Promise.reject(new Error('No file reads in native browser fixture')),
  media: () => Promise.reject(new Error('No image reads in native browser fixture')),
  defaultMode: () => Promise.resolve('internal'),
  openSystem: (candidate) => controller.openSystem(candidate),
  openBrowser: (candidate, source, signal) => controller.openBrowser(candidate, source, signal),
})
const context = {
  owner: model,
  targetKey: 'native',
  source,
  labels: { open: () => labels.internal, opening: labels.opening, error: labels.error },
  onOpen: () => Promise.reject(new Error('No workspace file opens in this fixture')),
}
function App() {
  const tabs = useHbarRuntimeState(runtime.view.state.workspaceTabs)
  const surfaces = useHbarRuntimeState(runtime.view.state.surfaces)
  const active = tabs.items.find((item) => item.id === tabs.activeId)
  const panel = active?.kind === 'workbench' ? surfaces.panels[active.panelInstanceId] : null
  const [modal, setModal] = useState(false)
  return (
    <LumenProvider appearance={createWebLumenAppearance('dark', DEFAULT_WEB_APPEARANCE_DIMENSIONS, false)}>
      <ResourceBrowserLayer controller={controller}>
        <HbarMessageResourceLayer model={model} labels={labels}>
          <main className="native-resource-fixture">
            <LumenButton onClick={() => setModal(true)}>{labels.choose}</LumenButton>
            {panel?.panelId === 'browser' ? (
              <ResourceBrowser id={String(panel.params.id)} url={String(panel.params.url)} locale="en-US" />
            ) : (
              <MessageMarkdown text={`[Native browser fixture](${url})`} fileReferences={context} />
            )}
          </main>
          <LumenDialog
            open={modal}
            title={labels.choose}
            closeLabel={labels.close}
            size="medium"
            onClose={() => setModal(false)}
          >
            <LumenButton onClick={() => setModal(false)}>{labels.close}</LumenButton>
          </LumenDialog>
        </HbarMessageResourceLayer>
      </ResourceBrowserLayer>
    </LumenProvider>
  )
}
declare global {
  interface Window {
    resourceNativeFixture: { readonly ids: () => string[]; close(): Promise<void> }
  }
}
window.resourceNativeFixture = {
  ids: () => Object.keys(controller.store.getState().entries),
  close: async () => {
    reactRoot.unmount()
    await controller.closeAll()
    runtime.dispose()
  },
}
const root = document.getElementById('root')
if (!root) throw new Error('Missing native fixture root')
const reactRoot = createRoot(root)
reactRoot.render(<App />)
