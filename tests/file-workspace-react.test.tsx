import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { createHash } from 'node:crypto'
import { HbarFileWorkspace, HbarRuntimeProvider } from '@hbar/app-react'
import { createAppRuntime } from '@hbar/app-runtime'
import { getShellCopy } from '../apps/web/src/shell-copy'

test('file workspace renders Host entries and a command-owned editable document', async () => {
  const text = '# Host file'
  const labels = getShellCopy('en-US').files
  expect(labels.error('UNSUPPORTED_TYPE')).toBe('This file is not editable UTF-8 text.')
  expect(labels.error('INVALID_OUTPUT')).toBe('This file is too large to open in the tool.')
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
        if (name === 'file.write') throw Object.assign(new Error('conflict'), { code: 'FILE_CONFLICT' })
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
        <HbarFileWorkspace labels={labels} connected />
      </HbarRuntimeProvider>,
    )
    expect(html).toContain('File manager')
    expect(html).toContain('Workspace root')
    expect(html).toContain('README.md')
    expect(html).toContain('# Host file')
    expect(html).toContain('Back to files')
    expect(html).toContain('Save file')
    expect(html).not.toContain('hbar-app-react-file-browser')
    expect(html).not.toContain('demo.ts')
    await runtime.view.commands.execute('fileWorkspace.setText', { instanceId: 'files', text: '# Local draft' })
    await expect(runtime.view.commands.execute('fileWorkspace.save', { instanceId: 'files' })).rejects.toMatchObject({
      code: 'FILE_CONFLICT',
    })
    const conflict = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarFileWorkspace labels={labels} connected />
      </HbarRuntimeProvider>,
    )
    expect(conflict).toContain('The source changed; your draft is still preserved.')
    expect(conflict).toContain('# Local draft')
    expect(conflict).toContain('Reload source')
  } finally {
    runtime.dispose()
  }
})
