import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { createAppRuntime, parseProposedPlan, type PlanProposalDocument } from '@hbar/app-runtime'
import {
  HbarMessageBlocks,
  HbarRuntimeProvider,
  HbarSessionWorkspace,
  type HbarMessageBlocksProps,
} from '@hbar/app-react'
import type { ContentBlock, SessionSnapshot, ToolCallPresentation } from '@hbar/contracts'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { createSessionToolPresenter } from '../apps/web/src/session-tool-presentation'
import { HbarHistoricalPlanMessage, HbarProposedPlanMessage } from '../packages/app-react/src/proposed-plan-message'
import { SessionToolDetails } from '../packages/app-react/src/session-tool-details'
import { buildMessageRows } from '../packages/app-react/src/session-message-model'

const kinds: readonly { presentation: ToolCallPresentation; icon: string; en: string; zh: string }[] = [
  { presentation: { version: 1, kind: 'file-read', pathField: 'path' }, icon: 'file', en: 'Read file', zh: '读取文件' },
  {
    presentation: { version: 1, kind: 'file-write', pathField: 'path' },
    icon: 'file-write',
    en: 'Write file',
    zh: '写入文件',
  },
  {
    presentation: { version: 1, kind: 'file-edit', pathField: 'path' },
    icon: 'file-edit',
    en: 'Edit file',
    zh: '编辑文件',
  },
  {
    presentation: { version: 1, kind: 'directory-list', pathField: 'path' },
    icon: 'directory',
    en: 'List directory',
    zh: '列出目录',
  },
  {
    presentation: { version: 1, kind: 'command', commandField: 'command' },
    icon: 'terminal',
    en: 'Run command',
    zh: '运行命令',
  },
  {
    presentation: { version: 1, kind: 'text-search', patternField: 'pattern' },
    icon: 'search',
    en: 'Search text',
    zh: '搜索文本',
  },
  {
    presentation: { version: 1, kind: 'file-search', queryField: 'nameQuery' },
    icon: 'search',
    en: 'Find files',
    zh: '查找文件',
  },
]
const makeCall = (
  callId: string,
  name = 'custom_tool',
  presentation = kinds[0]!.presentation,
): Extract<ContentBlock, { type: 'tool_call' }> => ({
  type: 'tool_call',
  callId,
  name,
  presentation,
  args: {
    path: 'C:\\项目\\src\\same-file.txt',
    command: 'NOT EXECUTED --fixture',
    pattern: 'needle',
    nameQuery: 'same-file',
    other: 42,
  },
})

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`canonical declarations render localized family identities without changing the technical tool: ${locale}`, () => {
    for (const { presentation, icon, en, zh } of kinds) {
      const call = makeCall('original', 'custom_tool', presentation)
      const html = renderToStaticMarkup(
        <HbarMessageBlocks
          sessionId="s"
          messageId="m"
          blocks={[call]}
          labels={getShellCopy(locale).session.messageBlocks}
          describeTool={createSessionToolPresenter(locale)}
        />,
      )
      expect(html).toContain(locale === 'zh-CN' ? zh : en)
      expect(html).toContain(`data-presentation-icon="${icon}"`)
      expect(html).toContain('data-tool-name="custom_tool"')
      expect(html).toContain('data-tool-call-id="original"')
      expect(html).toContain('aria-expanded="false"')
      expect(html).toContain('title=')
      expect(html).not.toContain('<a ')
      expect(html).not.toContain('<pre')
      expect(call.args.other).toBe(42)
    }
  })

  test(`production presenter does not replace complete JSON input or output: ${locale}`, () => {
    const call = makeCall('shell', 'custom_shell', { version: 1, kind: 'command', commandField: 'command' })
    call.args.description = 'Not a declared description'
    call.args.timeout = 5_000
    const rows = buildMessageRows([
      call,
      { type: 'tool_result', callId: call.callId, name: call.name, text: 'Exact output\nTail', isError: false },
    ])
    const row = rows[0]
    if (!row || row.kind !== 'tool') throw new Error('Tool fixture not paired')
    const presentation = createSessionToolPresenter(locale)(call)
    expect(presentation.input).toBeUndefined()
    const html = renderToStaticMarkup(
      <SessionToolDetails
        sessionId="s"
        messageId="m"
        row={row}
        labels={getShellCopy(locale).session.messageBlocks}
        presentation={presentation}
      />,
    )
    expect(html).toContain('NOT EXECUTED --fixture')
    expect(html).toContain('Not a declared description')
    expect(html).toContain('5000')
    expect(html).toContain('other')
    expect(html).toContain('Exact output\nTail')
    expect(html).toContain(getShellCopy(locale).session.messageBlocks.toolResultCopy.copy)
  })

  test(`activity keeps distinct real names and mixed same-name history truthful: ${locale}`, () => {
    const labels = getShellCopy(locale).session.messageBlocks
    const describeTool = createSessionToolPresenter(locale)
    const distinct = renderToStaticMarkup(
      <HbarMessageBlocks
        sessionId="s"
        messageId="m"
        blocks={[makeCall('one', 'first_plugin'), makeCall('two', 'second_plugin')]}
        labels={labels}
        describeTool={describeTool}
      />,
    )
    const label = locale === 'zh-CN' ? '读取文件' : 'Read file'
    expect(distinct).toContain(`${label} (first_plugin) × 1`)
    expect(distinct).toContain(`${label} (second_plugin) × 1`)
    const mixed = renderToStaticMarkup(
      <HbarMessageBlocks
        sessionId="s"
        messageId="m"
        blocks={[makeCall('one'), makeCall('two', 'custom_tool', kinds[4]!.presentation), makeCall('three')]}
        labels={labels}
        describeTool={describeTool}
      />,
    )
    expect(mixed).toContain('custom_tool × 3')
    expect(mixed).not.toContain(`${label} × 3`)
    const legacy = renderToStaticMarkup(
      <HbarMessageBlocks
        sessionId="s"
        messageId="m"
        blocks={[makeCall('one'), { type: 'tool_call', callId: 'old', name: 'custom_tool', args: { path: 'old.txt' } }]}
        labels={labels}
        describeTool={describeTool}
      />,
    )
    expect(legacy).toContain('custom_tool × 2')
  })

  test(`error preview retains priority while requested context remains inspectable: ${locale}`, () => {
    const call = makeCall('failed')
    const html = renderToStaticMarkup(
      <HbarMessageBlocks
        sessionId="s"
        messageId="m"
        blocks={[
          call,
          {
            type: 'tool_result',
            callId: call.callId,
            name: call.name,
            isError: true,
            text: 'Original failure',
            outcome: { kind: 'failed', executionStarted: true },
          },
        ]}
        labels={getShellCopy(locale).session.messageBlocks}
        describeTool={createSessionToolPresenter(locale)}
      />,
    )
    expect(html).toContain('Original failure')
    expect(html).toContain('same-file.txt')
    expect(html).toContain('data-outcome="failed"')
    expect(html).toContain('data-format="text"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('<pre')
  })
}

for (const count of [0, 1, 100, 101]) {
  test(`host-owned long captions remain intact without changing existing activity capacity: ${count}`, () => {
    const longLabel = '读取这个会话所请求的完整文件并保持原始调用身份'
    const describeTool: NonNullable<HbarMessageBlocksProps['describeTool']> = () => ({
      icon: 'file',
      label: longLabel,
      summary: 'same-file.txt',
    })
    const html = renderToStaticMarkup(
      <HbarMessageBlocks
        sessionId="s"
        messageId="m"
        blocks={Array.from({ length: count }, (_, index) => makeCall(`call-${index}`))}
        labels={getShellCopy('zh-CN').session.messageBlocks}
        describeTool={describeTool}
        streaming
      />,
    )
    expect(html.match(/data-presentation-icon="file"/g) ?? []).toHaveLength(count)
    if (count) expect(html).toContain(longLabel)
    if (count > 1) expect(html).toContain(`${longLabel} × ${count}`)
    expect(html).not.toContain('<pre')
  })
}

test('legacy lookalikes and orphan results never acquire semantics from their name or incidental args', () => {
  const labels = getShellCopy('zh-CN').session.messageBlocks
  const describeTool = createSessionToolPresenter('zh-CN')
  for (const block of [
    { type: 'tool_call', callId: 'legacy', name: 'read_file', args: { path: 'not-inferred.txt' } },
    { type: 'tool_result', callId: 'orphan', name: 'shell', text: 'output', isError: false },
  ] satisfies ContentBlock[]) {
    const html = renderToStaticMarkup(
      <HbarMessageBlocks sessionId="s" messageId="m" blocks={[block]} labels={labels} describeTool={describeTool} />,
    )
    expect(html).toContain('data-presentation-icon="tool"')
    expect(html).toContain(block.name)
    expect(html).not.toContain('读取文件')
    expect(html).not.toContain('运行命令')
    expect(html).not.toContain('not-inferred.txt')
  }
})

test('both Plan message wrappers retain the exact declared tool identity and requested summary', () => {
  const blocks: ContentBlock[] = [
    { type: 'text', text: 'Before.\n<proposed_plan>\n# Plan\n\nReview source.\n</proposed_plan>' },
    makeCall('plan-call'),
    { type: 'text', text: 'After.' },
  ]
  const parsed = parseProposedPlan(blocks.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n\n'))
  if (parsed.kind !== 'complete') throw new Error('Complete proposal fixture required')
  const document: PlanProposalDocument = {
    target: { sessionId: 's', messageId: 'm', sourceRunId: 'run', sourceSeq: 1, fingerprint: 'a'.repeat(64) },
    before: parsed.before,
    markdown: parsed.markdown,
    after: parsed.after,
  }
  const copy = getShellCopy('zh-CN').session
  const props = {
    sessionId: 's',
    messageId: 'm',
    blocks,
    labels: copy.messageBlocks,
    describeTool: createSessionToolPresenter('zh-CN'),
  }
  for (const html of [
    renderToStaticMarkup(<HbarHistoricalPlanMessage {...props} readOnlyLabel={copy.proposedPlanReadOnly} />),
    renderToStaticMarkup(
      <HbarProposedPlanMessage
        {...props}
        document={document}
        plan={{
          labels: copy.proposedPlan,
          state: {
            status: 'idle',
            canSubmit: true,
            connected: true,
            reconciling: false,
            error: null,
            unavailable: null,
          },
          onSubmit: () => {},
          onReconcile: () => {},
        }}
      />,
    ),
  ]) {
    expect(html).toContain('读取文件')
    expect(html).toContain('same-file.txt')
    expect(html).toContain('data-tool-call-id="plan-call"')
    expect(html.indexOf('Review source.')).toBeLessThan(html.indexOf('data-tool-call-id="plan-call"'))
    expect(html.indexOf('data-tool-call-id="plan-call"')).toBeLessThan(html.indexOf('After.'))
  }
})

test('real session workspace forwards its host presenter to ordinary and historical assistant paths', async () => {
  const workspace = { id: 'w', path: 'D:/fixture-only', name: 'Fixture', createdAt: 1 }
  const session = {
    id: 's',
    workspaceId: workspace.id,
    title: 'Presentation fixture',
    archived: false,
    parentId: null,
    createdAt: 1,
    updatedAt: 1,
    seq: 2,
  }
  const snapshot: SessionSnapshot = {
    session,
    messages: (['assistant', 'tool'] as const).map((role, index) => ({
      id: `m-${role}`,
      sessionId: session.id,
      runId: 'r',
      role,
      content: [makeCall(role)],
      seq: index + 1,
      createdAt: index + 1,
    })),
    runs: [],
    approvals: [],
    userInputs: [],
    streams: [],
    hasOlder: false,
    cursor: 2,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
  }
  const runtime = createAppRuntime({
    instanceId: 'presenter-workspace',
    hostId: 'fixture',
    directory: {
      async execute(name) {
        if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
        if (name === 'workspace.get') return workspace
        if (name === 'session.list') return { items: [session], nextCursor: null }
        if (name === 'session.get') return session
        throw new Error(`Unexpected directory query: ${name}`)
      },
    },
    timeline: {
      async snapshot() {
        return snapshot
      },
      async plan() {
        return null
      },
      async watch() {
        return () => {}
      },
    },
  })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
    for (let attempt = 0; runtime.view.state.timeline.getSnapshot().status !== 'ready'; attempt++) {
      if (attempt >= 100) throw new Error('Workspace fixture failed to settle')
      await Bun.sleep(1)
    }
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarSessionWorkspace
          sessionTitle={session.title}
          workspaceName={workspace.name}
          sessionWorkspaceId={workspace.id}
          labels={getShellCopy('zh-CN').session}
          describeTool={createSessionToolPresenter('zh-CN')}
          connected
        />
      </HbarRuntimeProvider>,
    )
    expect(html.match(/data-presentation-icon="file"/g)).toHaveLength(2)
    expect(html).toContain('读取文件')
    expect(html).toContain('same-file.txt')
    expect(html).toContain('data-tool-call-id="assistant"')
    expect(html).toContain('data-tool-call-id="tool"')
  } finally {
    runtime.dispose()
  }
})
