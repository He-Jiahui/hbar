import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarSessionProjectContext } from '../packages/app-react/src/session-project-context'
import { sessionContextCopy } from '../apps/web/src/session-context-copy'
import type { SessionGitContextState } from '@hbar/app-runtime'

const ready: SessionGitContextState = {
  sessionId: 'session-a',
  workspaceId: 'workspace-a',
  status: 'ready',
  branch: 'feature/very-long-branch',
  error: null,
}

function render(context: SessionGitContextState, connected = true, locale: 'en-US' | 'zh-CN' = 'en-US') {
  return renderToStaticMarkup(
    <HbarSessionProjectContext
      sessionId="session-a"
      workspaceId="workspace-a"
      workspaceName="Very long project 工程"
      context={context}
      connected={connected}
      labels={sessionContextCopy(locale)}
      onRetry={() => undefined}
    />,
  )
}

test('only an exact target with a confirmed branch renders that branch', () => {
  const visible = render(ready)
  expect(visible).toContain('feature/very-long-branch')
  expect(visible).toContain('Current project: Very long project 工程')
  for (const context of [
    { ...ready, sessionId: 'session-b' },
    { ...ready, workspaceId: 'workspace-b' },
    { ...ready, status: 'loading' as const },
    { ...ready, status: 'ready' as const, branch: null },
  ])
    expect(render(context)).not.toContain('feature/very-long-branch')
  expect(render(ready, false)).not.toContain('feature/very-long-branch')
})

test('failed and offline Git queries keep the real project and nearby bilingual feedback without a stale branch', () => {
  const failed = render({ ...ready, status: 'error', branch: null, error: 'GIT_TIMEOUT' }, true, 'zh-CN')
  expect(failed).toContain('Very long project 工程')
  expect(failed).toContain('分支不可用：GIT_TIMEOUT')
  expect(failed).toContain('title="分支不可用：GIT_TIMEOUT"')
  expect(failed).toContain('aria-label="分支不可用：GIT_TIMEOUT"')
  expect(failed).toContain('重试')
  expect(failed).not.toContain('feature/very-long-branch')
  const offline = render(ready, false)
  expect(offline).toContain('Branch offline')
  expect(offline).not.toContain('feature/very-long-branch')
  expect(offline).not.toContain('Retry')
})

test('a display alias keeps the canonical path available without changing branch or target', () => {
  const html = renderToStaticMarkup(
    <HbarSessionProjectContext
      sessionId="session-a"
      workspaceId="workspace-a"
      workspaceName="Research 项目"
      workspacePath="D:/work/same-folder-name"
      context={ready}
      connected
      labels={sessionContextCopy('zh-CN')}
      onRetry={() => undefined}
    />,
  )
  expect(html).toContain('title="D:/work/same-folder-name"')
  expect(html).toContain('Research 项目')
  expect(html).toContain('feature/very-long-branch')
})

test('generated launch branches retain their entire name as visible text in both locales', () => {
  const branch = `hbar/session-launch/${'a7'.repeat(32)}`
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const html = render({ ...ready, branch }, true, locale)
    expect(html).toContain(`<bdi>${branch}</bdi>`)
    expect(html).not.toContain('dir="rtl"')
    expect(sessionContextCopy(locale).branchCaption(branch)).toBe(branch)
  }
})
