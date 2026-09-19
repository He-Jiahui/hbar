import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { createHash } from 'node:crypto'
import { HbarFileWorkspace, HbarRuntimeProvider } from '@hbar/app-react'
import { createAppRuntime } from '@hbar/app-runtime'
import { getShellCopy } from '../apps/web/src/shell-copy'

test('file workspace renders Host entries and a command-owned editable document', async () => {
  const text = '# Host file'
  const runtime = createAppRuntime({
    instanceId: 'files-react',
    hostId: 'host',
    directory: { execute: () => Promise.reject(new Error('unused')) },
    surfaces: { canRender: (id) => id === 'files' },
    files: {
      async execute(name) {
        if (name === 'file.list') return { items: [{ name: 'README.md', path: 'README.md', directory: false }] }
        if (name === 'file.read')
          return {
            workspaceId: 'workspace-1',
            path: 'README.md',
            text,
            size: text.length,
            sha256: createHash('sha256').update(text).digest('hex'),
          }
        throw new Error(`Unexpected ${name}`)
      },
    },
  })
  try {
    await runtime.view.commands.execute('app.openPanel', { panelId: 'files', workspaceId: 'workspace-1' })
    await runtime.view.commands.execute('fileWorkspace.refresh', { instanceId: 'files' })
    await runtime.view.commands.execute('fileWorkspace.openEntry', {
      instanceId: 'files',
      path: 'README.md',
      directory: false,
    })
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarFileWorkspace labels={getShellCopy('en-US').files} connected />
      </HbarRuntimeProvider>,
    )
    expect(html).toContain('File manager')
    expect(html).toContain('README.md')
    expect(html).toContain('# Host file')
    expect(html).toContain('Save file')
    expect(html).not.toContain('demo.ts')
  } finally {
    runtime.dispose()
  }
})
