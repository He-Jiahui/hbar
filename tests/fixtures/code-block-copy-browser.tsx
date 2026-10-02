// Controlled component fixture: no Host, provider, Run or executable plan.
import { StrictMode, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { LumenButton, LumenFrame, LumenProvider, LumenText } from '@lumen/app-ui'
import type { ContentBlock } from '@hbar/contracts'
import { HbarMessageBlocks } from '../../packages/app-react/src/session-message'
import { MessageMarkdown } from '../../packages/app-react/src/message-markdown'
import { HbarFileMarkdownPreview } from '../../packages/app-react/src/file-markdown-preview'
import { HbarHistoricalPlanMessage, HbarProposedPlanMessage } from '../../packages/app-react/src/proposed-plan-message'
import { HbarSessionDecision, type HbarSessionDecisionProps } from '../../packages/app-react/src/session-interactions'
import type { MessageClipboardPort } from '../../packages/app-react/src/message-copy'
import { CodeBlockCopyAction } from '../../packages/app-react/src/code-block-copy-action'
import { MAX_CODE_BLOCK_COPY_CHARACTERS } from '../../packages/app-react/src/code-block-copy'
import { codeBlockCopyLabels } from '../../apps/web/src/code-block-copy-labels'
import { createWebLumenAppearance, DEFAULT_WEB_APPEARANCE_DIMENSIONS } from '../../apps/web/src/appearance'
import { getShellCopy, resolveShellLocale, type ShellLocale } from '../../apps/web/src/shell-copy'
import '@lumen/app-ui/styles.css'
import '../../apps/web/src/document.css'

const scenarios = [
  'a',
  'b',
  'replacement',
  'segment',
  'owner',
  'stream',
  'unmounted',
  'empty',
  'below',
  'limit',
  'over',
  'long',
  'normal',
  'no-context',
  'proposal',
  'history',
  'plan-exit',
  'long-stream',
] as const
type Scenario = (typeof scenarios)[number]
const repeated = 'const repeated = true\nconsole.log(repeated)'
const fence = (text: string, language = 'typescript') => `\`\`\`${language}\n${text}\n\`\`\``
const longCode = Array.from({ length: 25 }, (_, index) => `line-${String(index + 1).padStart(2, '0')}`).join('\n')
const before = fence('before-code')
const planBody = fence('plan-code')
const after = fence('after-code')
const planText = `${before}\n\n<proposed_plan>\n${planBody}\n</proposed_plan>\n\n${after}`

function fixtureLabels(locale: ShellLocale) {
  const zh = locale === 'zh-CN'
  return {
    title: zh ? '代码块复制：受控生命周期夹具' : 'Code block copy: controlled lifecycle fixture',
    note: zh ? '仅测试注入的剪贴板，无 Host 或执行动作。' : 'Injected clipboard only. No Host or execution actions.',
    scenarios: {
      a: zh ? '原来源 A' : 'Original source A',
      b: zh ? '来源 B' : 'Source B',
      replacement: zh ? '替换正文' : 'Replace source',
      segment: zh ? '相同代码另一文本段' : 'Same code, another segment',
      owner: zh ? '相同代码另一 owner' : 'Same code, another owner',
      stream: zh ? '追加流式正文' : 'Append streaming text',
      unmounted: zh ? '卸载消息' : 'Unmount message',
      empty: zh ? '空代码' : 'Empty code',
      below: zh ? '上限减一' : 'Below limit',
      limit: zh ? '恰好上限' : 'At limit',
      over: zh ? '上限加一' : 'Above limit',
      long: zh ? '长代码' : 'Long code',
      normal: zh ? '实际普通消息' : 'Actual normal message',
      'no-context': zh ? '旧无上下文 Markdown' : 'Legacy Markdown without context',
      proposal: zh ? '当前计划及前后正文' : 'Current proposal and surrounding prose',
      history: zh ? '只读历史计划' : 'Read-only historical plan',
      'plan-exit': zh ? '实际退出规划审批' : 'Actual PlanExit approval',
      'long-stream': zh ? '长代码后追加正文' : 'Append prose after long code',
    } satisfies Record<Scenario, string>,
    resolve: zh ? '确认最早写入' : 'Resolve earliest write',
    reject: zh ? '拒绝最早写入' : 'Reject earliest write',
    unavailable: zh ? '剪贴板不可用' : 'Clipboard unavailable',
    available: zh ? '恢复受控剪贴板' : 'Restore controlled clipboard',
    writes: (count: number) => (zh ? `写入请求 ${count} 次` : `${count} write requests`),
  }
}

function planExitFixtureLabels(locale: ShellLocale) {
  const zh = locale === 'zh-CN'
  return {
    pending: zh ? '显示待处理审批' : 'Show pending approval',
    allowed: zh ? '显示已允许审批' : 'Show allowed approval',
    denied: zh ? '显示已拒绝审批' : 'Show denied approval',
    offline: zh ? '离线显示' : 'Show offline',
    online: zh ? '在线显示' : 'Show online',
    owner: zh ? '仅替换副本所有者' : 'Replace copy owner only',
    replacement: zh ? '替换退出规划审批' : 'Replace PlanExit approval',
    effects: (count: number) => (zh ? `业务回调 ${count} 次` : `${count} business callbacks`),
  }
}

function PlanExitFixture({
  locale,
  clipboard,
}: {
  readonly locale: ShellLocale
  readonly clipboard: MessageClipboardPort | null
}) {
  const shell = getShellCopy(locale).session
  const labels = planExitFixtureLabels(locale)
  const [status, setStatus] = useState<'pending' | 'allowed' | 'denied'>('pending')
  const [connected, setConnected] = useState(true)
  const [replaced, setReplaced] = useState(false)
  const [owner, setOwner] = useState<'a' | 'b'>('a')
  const owners = useRef({ a: {}, b: {} })
  const [effects, setEffects] = useState({ planExit: 0, decision: 0, reconcile: 0, answer: 0, submit: 0 })
  const record = (kind: keyof typeof effects) => setEffects((current) => ({ ...current, [kind]: current[kind] + 1 }))
  const approval = {
    id: replaced ? 'plan-exit-b' : 'plan-exit-a',
    sessionId: 'plan-exit-session',
    runId: 'controlled-plan-exit-run',
    callId: replaced ? 'plan-exit-call-b' : 'plan-exit-call-a',
    tool: 'exit_plan_mode',
    args: {
      plan: `${fence(replaced ? 'const replacementApproval = true;' : 'const currentApproval = true;')}\n\n${fence(longCode)}`,
    },
    status,
    createdAt: 1,
  }
  const decision = {
    kind: 'approval',
    id: approval.id,
    sessionId: approval.sessionId,
    runId: approval.runId,
    callId: approval.callId,
    tool: approval.tool,
    approval,
  } satisfies HbarSessionDecisionProps['decision']
  return (
    <LumenFrame data-plan-exit-fixture="" data-plan-exit-effects={JSON.stringify(effects)}>
      <LumenFrame className="code-copy-fixture-controls">
        {(['pending', 'allowed', 'denied'] as const).map((value) => (
          <LumenButton key={value} size="s" data-plan-exit-action={value} onClick={() => setStatus(value)}>
            {labels[value]}
          </LumenButton>
        ))}
        <LumenButton size="s" data-plan-exit-action="offline" onClick={() => setConnected(false)}>
          {labels.offline}
        </LumenButton>
        <LumenButton size="s" data-plan-exit-action="online" onClick={() => setConnected(true)}>
          {labels.online}
        </LumenButton>
        <LumenButton
          size="s"
          data-plan-exit-action="owner"
          onClick={() => setOwner((value) => (value === 'a' ? 'b' : 'a'))}
        >
          {labels.owner}
        </LumenButton>
        <LumenButton size="s" data-plan-exit-action="replacement" onClick={() => setReplaced(true)}>
          {labels.replacement}
        </LumenButton>
      </LumenFrame>
      <HbarSessionDecision
        decision={decision}
        connected={connected}
        copyOwner={owners.current[owner]}
        clipboard={clipboard}
        labels={shell.decisions}
        onPlanExit={() => record('planExit')}
        onDecision={() => record('decision')}
        onReconcile={() => record('reconcile')}
        onAnswer={() => record('answer')}
        onSubmit={() => record('submit')}
      />
      <LumenText as="p">{labels.effects(Object.values(effects).reduce((sum, count) => sum + count, 0))}</LumenText>
    </LumenFrame>
  )
}

function Fixture({ locale }: { readonly locale: ShellLocale }) {
  const labels = fixtureLabels(locale)
  const shell = getShellCopy(locale).session
  const fileLabels = getShellCopy(locale).files
  const filePreview = new URL(location.href).searchParams.has('file-preview')
  const [scenario, setScenario] = useState<Scenario>('a')
  const [unavailable, setUnavailable] = useState(false)
  const [writes, setWrites] = useState<readonly string[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const pending = useRef<{ resolve: () => void; reject: () => void }[]>([])
  const owners = useRef({ a: {}, b: {} })
  const clipboard = useMemo(
    () => ({
      writeText: (text: string) =>
        new Promise<void>((resolve, reject) => {
          setWrites((current) => [...current, text])
          pending.current.push({ resolve, reject: () => reject(new Error('PRIVATE_INJECTED_CLIPBOARD_FAILURE')) })
          setPendingCount(pending.current.length)
        }),
    }),
    [],
  )
  const settle = (success: boolean) => {
    const first = pending.current.shift()
    if (success) first?.resolve()
    else first?.reject()
    setPendingCount(pending.current.length)
  }
  const baseCopy = codeBlockCopyLabels(locale)
  const longLabels = new URL(location.href).searchParams.has('long-labels')
  const copyLabels = longLabels
    ? {
        ...baseCopy,
        copy:
          locale === 'zh-CN'
            ? '复制当前代码块的完整内容（不包含说明或其他代码块）'
            : 'Copy the complete current code block without prose or other code blocks',
        failed:
          locale === 'zh-CN'
            ? '系统没有接受这次代码复制，原始内容保持不变，请在本代码块旁重试。'
            : 'The system did not accept this copy. The original code is unchanged; retry beside this code block.',
      }
    : baseCopy
  const text =
    scenario === 'b'
      ? fence('const source = "B"')
      : scenario === 'replacement'
        ? fence('const replacement = true')
        : scenario === 'long' || scenario === 'long-stream'
          ? `${fence(longCode)}${scenario === 'long-stream' ? '\n\nStreaming appended prose.' : ''}`
          : scenario === 'empty'
            ? fence('')
            : `${fence(repeated)}\n\n${fence(repeated)}${scenario === 'stream' ? '\n\nStreaming appended prose.' : ''}`
  const context = {
    sessionId: scenario === 'b' ? 'session-b' : 'session-a',
    messageId: 'message-a',
    segmentId: scenario === 'segment' ? 'text:1' : 'text:0',
    owner: scenario === 'owner' ? owners.current.b : owners.current.a,
    labels: copyLabels,
    clipboard: unavailable ? null : clipboard,
  }
  const capacityText = useMemo(() => {
    if (scenario !== 'below' && scenario !== 'limit' && scenario !== 'over') return null
    return 'x'.repeat(MAX_CODE_BLOCK_COPY_CHARACTERS + (scenario === 'below' ? -1 : scenario === 'over' ? 1 : 0))
  }, [scenario])
  const message = {
    sessionId: context.sessionId,
    messageId: context.messageId,
    blocks: [{ type: 'text', text: scenario === 'normal' ? text : planText }] as ContentBlock[],
    labels: { ...shell.messageBlocks, codeBlock: copyLabels },
    copyOwner: context.owner,
    clipboard: context.clipboard,
  }
  return (
    <LumenFrame as="main" className="code-copy-fixture" data-fixture-scenario={scenario}>
      <LumenText as="h1">{labels.title}</LumenText>
      <LumenText as="p">{labels.note}</LumenText>
      <LumenFrame className="code-copy-fixture-controls">
        {scenarios.map((id) => (
          <LumenButton key={id} size="s" data-fixture-action={id} onClick={() => setScenario(id)}>
            {labels.scenarios[id]}
          </LumenButton>
        ))}
        <LumenButton size="s" data-fixture-action="resolve" disabled={!pendingCount} onClick={() => settle(true)}>
          {labels.resolve}
        </LumenButton>
        <LumenButton size="s" data-fixture-action="reject" disabled={!pendingCount} onClick={() => settle(false)}>
          {labels.reject}
        </LumenButton>
        <LumenButton size="s" data-fixture-action="unavailable" onClick={() => setUnavailable(true)}>
          {labels.unavailable}
        </LumenButton>
        <LumenButton size="s" data-fixture-action="available" onClick={() => setUnavailable(false)}>
          {labels.available}
        </LumenButton>
      </LumenFrame>
      {scenario !== 'unmounted' && (
        <LumenFrame data-fixture-output="" className="hbar-session-message-prose">
          {filePreview ? (
            <HbarFileMarkdownPreview
              path={scenario === 'b' ? 'B.md' : 'A.md'}
              value={text}
              label={fileLabels.textPreview(scenario === 'b' ? 'B.md' : 'A.md')}
              imageLabel={fileLabels.markdownImage}
              openFileLabel={fileLabels.openLinkedFile}
              onOpenFile={() => {
                throw new Error('Unexpected file navigation in code fixture')
              }}
              code={{
                previewId: scenario === 'segment' ? 'preview-reopened' : 'preview-original',
                owner: context.owner,
                labels: copyLabels,
                clipboard: context.clipboard,
              }}
            />
          ) : scenario === 'plan-exit' ? (
            <PlanExitFixture locale={locale} clipboard={context.clipboard} />
          ) : capacityText !== null ? (
            <CodeBlockCopyAction {...context} occurrenceId="capacity" text={capacityText} source={scenario} />
          ) : scenario === 'normal' ? (
            <HbarMessageBlocks {...message} />
          ) : scenario === 'no-context' ? (
            <MessageMarkdown text={text} />
          ) : scenario === 'history' ? (
            <HbarHistoricalPlanMessage {...message} readOnlyLabel={shell.proposedPlanReadOnly} />
          ) : scenario === 'proposal' ? (
            <HbarProposedPlanMessage
              {...message}
              document={{
                target: {
                  sessionId: context.sessionId,
                  messageId: context.messageId,
                  sourceRunId: 'fixture-run',
                  sourceSeq: 1,
                  fingerprint: 'a'.repeat(64),
                },
                before,
                markdown: planBody,
                after,
              }}
              plan={{
                labels: shell.proposedPlan,
                state: {
                  status: 'accepted',
                  canSubmit: false,
                  connected: false,
                  reconciling: false,
                  error: null,
                  unavailable: null,
                },
                onSubmit: () => {
                  throw new Error('Unexpected fixture plan write')
                },
                onReconcile: () => {
                  throw new Error('Unexpected fixture plan read')
                },
              }}
            />
          ) : (
            <MessageMarkdown text={text} code={context} findSegmentId={context.segmentId} />
          )}
        </LumenFrame>
      )}
      <LumenText as="p" data-write-count={writes.length} data-pending-count={pendingCount}>
        {labels.writes(writes.length)}
      </LumenText>
      <LumenFrame className="code-copy-fixture-writes">
        {writes.map((write, index) => (
          <LumenText key={index} as="pre" data-write-index={index} data-write-length={write.length}>
            {write.length > 1_000 ? write.slice(0, 100) : write}
          </LumenText>
        ))}
      </LumenFrame>
    </LumenFrame>
  )
}
const root = document.getElementById('root')
if (!root) throw new Error('Missing code-copy fixture root')
const locale = resolveShellLocale(navigator.languages)
document.documentElement.lang = locale
createRoot(root).render(
  <StrictMode>
    <LumenProvider appearance={createWebLumenAppearance('light', DEFAULT_WEB_APPEARANCE_DIMENSIONS, false)}>
      <Fixture locale={locale} />
    </LumenProvider>
  </StrictMode>,
)
