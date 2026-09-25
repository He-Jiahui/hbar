import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { createHash } from 'node:crypto'
import { HbarFileWorkspace, HbarRuntimeProvider } from '@hbar/app-react'
import { createAppRuntime } from '@hbar/app-runtime'
import { getShellCopy } from '../apps/web/src/shell-copy'

test('file tree keeps folders first even when Host cursor pages arrive in path order', async () => {
  const runtime = createAppRuntime({
    instanceId: 'files-order-react',
    hostId: 'host',
    directory: { execute: () => Promise.reject(new Error('unused')) },
    surfaces: { canRender: (id) => id === 'files' },
    files: {
      async execute(name) {
        if (name === 'file.list')
          return {
            items: [
              { name: 'a-file.txt', path: 'a-file.txt', directory: false },
              { name: 'z-directory', path: 'z-directory', directory: true },
            ],
          }
        throw new Error(`Unexpected ${name}`)
      },
    },
  })
  try {
    await runtime.view.commands.execute('app.openPanel', { panelId: 'files', workspaceId: 'workspace-1' })
    await runtime.view.commands.execute('fileWorkspace.refresh', { instanceId: 'files' })
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarFileWorkspace labels={getShellCopy('en-US').files} connected />
      </HbarRuntimeProvider>,
    )
    expect(html.indexOf('z-directory')).toBeLessThan(html.indexOf('a-file.txt'))
  } finally {
    runtime.dispose()
  }
})

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
    expect(html).toContain('Text preview: README.md')
    expect(html).not.toContain('<textarea')
    expect(html).not.toContain('Save file')
    expect(html).not.toContain('hbar-app-react-file-browser')
    expect(html).not.toContain('demo.ts')
    await runtime.view.commands.execute('fileWorkspace.setDocumentMode', {
      instanceId: 'files',
      workspaceId: 'workspace-1',
      path: 'README.md',
      mode: 'edit',
    })
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

test('restored file drafts render localized discard and save actions without a second read', async () => {
  const labels = { ...getShellCopy('zh-CN').files, dirty: '尚未保存的本地草稿会在返回列表和重新打开后保留' }
  let reads = 0
  const runtime = createAppRuntime({
    instanceId: 'files-draft-react',
    hostId: 'host',
    directory: { execute: () => Promise.reject(new Error('unused')) },
    surfaces: { canRender: (id) => id === 'files' },
    files: {
      async execute(name) {
        if (name === 'file.list') return { items: [{ name: '目标说明.md', path: '目标说明.md', directory: false }] }
        if (name === 'file.read') {
          reads += 1
          return {
            workspaceId: 'w',
            path: '目标说明.md',
            text: '来源',
            size: 6,
            sha256: createHash('sha256').update('来源').digest('hex'),
          }
        }
        throw new Error('Unexpected write')
      },
    },
  })
  try {
    const execute = runtime.view.commands.execute
    await execute('app.openPanel', { panelId: 'files', workspaceId: 'w' })
    await execute('fileWorkspace.refresh', { instanceId: 'files' })
    await execute('fileWorkspace.openEntry', { instanceId: 'files', path: '目标说明.md', directory: false })
    await execute('fileWorkspace.setText', { instanceId: 'files', text: '保留我的草稿' })
    await execute('fileWorkspace.showBrowser', { instanceId: 'files' })
    await execute('fileWorkspace.openEntry', { instanceId: 'files', path: '目标说明.md', directory: false })
    await execute('fileWorkspace.setDocumentMode', {
      instanceId: 'files',
      workspaceId: 'w',
      path: '目标说明.md',
      mode: 'edit',
    })
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarFileWorkspace labels={labels} connected />
      </HbarRuntimeProvider>,
    )
    expect(html).toContain('保留我的草稿')
    expect(html).toContain(labels.dirty)
    expect(html).toContain(labels.reload)
    expect(html).toContain(labels.save)
    expect(reads).toBe(1)
  } finally {
    runtime.dispose()
  }
})
