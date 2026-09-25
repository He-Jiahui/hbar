// Test-only composition: production currently presents one tool at a time.
// These two views use the public runtime and real Host client, not a product test bridge.
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { HbarFileWorkspace, HbarRuntimeProvider } from '@hbar/app-react'
import { createAppRuntime } from '@hbar/app-runtime'
import { HbarClient, createDirectoryQueryAdapter, createFileCommandClient } from '@hbar/client'
import { LumenProvider } from '@lumen/app-ui'
import { createWebLumenAppearance, DEFAULT_WEB_APPEARANCE_DIMENSIONS } from '../../apps/web/src/appearance'
import { getShellCopy, resolveShellLocale } from '../../apps/web/src/shell-copy'
import '@lumen/app-ui/styles.css'
import './file-draft-preview.css'

const workspaceId = new URL(location.href).searchParams.get('workspace')
if (!workspaceId) throw new Error('File draft fixture requires its temporary workspace ID')
const locale = resolveShellLocale(navigator.languages)
document.documentElement.lang = locale
const client = new HbarClient(location.origin)
await client.connect()
const runtime = createAppRuntime({
  instanceId: 'file-draft-two-pane-test',
  hostId: location.origin,
  directory: createDirectoryQueryAdapter(client),
  files: createFileCommandClient(client),
  surfaces: { canRender: (id) => id === 'files' },
})
const panes = ['left', 'right'] as const
for (const instanceId of panes)
  await runtime.view.commands.execute('app.openPanel', {
    panelId: 'files',
    instanceId,
    workspaceId,
    binding: 'pinned',
  })
const root = document.getElementById('root')
if (!root) throw new Error('File draft fixture root is missing')
const copy = getShellCopy(locale)
createRoot(root).render(
  createElement(LumenProvider, {
    appearance: createWebLumenAppearance('light', DEFAULT_WEB_APPEARANCE_DIMENSIONS, false),
    children: createElement(HbarRuntimeProvider, {
      view: runtime.view,
      children: createElement(
        'main',
        { className: 'file-draft-test-panes' },
        panes.map((instanceId) =>
          createElement(
            'section',
            { key: instanceId, 'data-test-file-pane': instanceId },
            createElement(HbarFileWorkspace, { instanceId, labels: copy.files, connected: true }),
          ),
        ),
      ),
    }),
  }),
)
addEventListener(
  'pagehide',
  () => {
    runtime.dispose()
    client.disconnect()
  },
  { once: true },
)
