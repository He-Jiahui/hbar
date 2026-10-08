import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenContentText } from '@lumen/app-ui'
import { HbarSessionWorkspaceContext } from '../packages/app-react/src/session-workspace-context'
import { sessionContextCopy } from '../apps/web/src/session-context-copy'

test('host launch slots remain distinct from confirmed project facts in both responsive placements', () => {
  for (const placement of ['toolbar', 'below'] as const) {
    const launch = renderToStaticMarkup(
      <HbarSessionWorkspaceContext
        placement={placement}
        content={{
          kind: 'launch',
          slot: <LumenContentText context="workspace.context">原始启动目标 Original launch target</LumenContentText>,
        }}
      />,
    )
    expect(launch).toContain('原始启动目标 Original launch target')
    expect(launch).toContain('data-text-context="workspace.context"')
    expect(launch).toContain(`hbar-session-project-context-${placement}`)
    const absent = renderToStaticMarkup(
      <HbarSessionWorkspaceContext placement={placement} content={{ kind: 'launch', slot: null }} />,
    )
    expect(absent).not.toContain('hbar-session-project-context-name')
    expect(absent).not.toContain('Original launch target')
    const empty = renderToStaticMarkup(
      <HbarSessionWorkspaceContext placement={placement} content={{ kind: 'empty' }} />,
    )
    expect(empty).toBe(absent)
  }
})

test('both placements keep the original bilingual project owner and suppress another session branch', () => {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const labels = sessionContextCopy(locale)
    for (const placement of ['toolbar', 'below'] as const) {
      const props = {
        workspaceName: 'Original 工程',
        workspacePath: 'D:/original/project',
        sessionId: 'original-session',
        workspaceId: 'original-workspace',
        connected: true,
        context: {
          sessionId: 'another-session',
          workspaceId: 'original-workspace',
          status: 'ready' as const,
          branch: 'another/branch',
          error: null,
        },
        labels,
        onRetry: () => undefined,
      }
      const html = renderToStaticMarkup(
        <HbarSessionWorkspaceContext placement={placement} content={{ kind: 'project', props }} />,
      )
      expect(html).toContain(labels.project(props.workspaceName))
      expect(html).toContain('D:/original/project')
      expect(html).not.toContain('another/branch')
    }
  }
})
