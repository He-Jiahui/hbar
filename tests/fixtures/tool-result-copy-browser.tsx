// Test-only clipboard lifecycle harness. No Host, Run, provider or tool is used.
import { useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { LumenButton, LumenFrame, LumenProvider, LumenText } from '@lumen/app-ui'
import { ToolResultCopyAction } from '../../packages/app-react/src/tool-result-copy-action'
import { MAX_TOOL_RESULT_COPY_CHARACTERS } from '../../packages/app-react/src/tool-result-copy'
import { createWebLumenAppearance, DEFAULT_WEB_APPEARANCE_DIMENSIONS } from '../../apps/web/src/appearance'
import { getShellCopy, resolveShellLocale, type ShellLocale } from '../../apps/web/src/shell-copy'
import { clipboardTexts } from './tool-result-copy-fixtures'
import '@lumen/app-ui/styles.css'
import '../../packages/app-react/src/session-message.css'

type Scenario = 'a' | 'b' | 'replacement' | 'blank' | 'limit' | 'over' | 'unmounted'
interface FixtureLabels {
  readonly title: string
  readonly distinction: string
  readonly scenarios: Readonly<Record<Scenario, string>>
  readonly accept: string
  readonly reject: string
  readonly available: string
  readonly unavailable: string
  readonly writeCount: (count: number) => string
}
export function clipboardFixtureLabels(locale: ShellLocale): FixtureLabels {
  const zh = locale === 'zh-CN'
  return {
    title: zh ? '工具输出复制生命周期：受控组件测试' : 'Tool output copy lifecycle: controlled component test',
    distinction: zh
      ? '仅测试注入的剪贴板，不连接 Host、不执行工具。'
      : 'Injected clipboard only. No Host connection or tool execution.',
    scenarios: {
      a: zh ? '原目标 A' : 'Original target A',
      b: zh ? '切换到 B' : 'Switch to B',
      replacement: zh ? '替换 A 的输出' : 'Replace A output',
      blank: zh ? '空白输出' : 'Whitespace output',
      limit: zh ? '单次容量边界' : 'At copy limit',
      over: zh ? '超出容量边界' : 'Above copy limit',
      unmounted: zh ? '卸载原输出' : 'Unmount original output',
    },
    accept: zh ? '确认最早的写入' : 'Resolve earliest write',
    reject: zh ? '拒绝最早的写入' : 'Reject earliest write',
    available: zh ? '使用受控剪贴板' : 'Use controlled clipboard',
    unavailable: zh ? '剪贴板不可用' : 'Clipboard unavailable',
    writeCount: (count) => (zh ? `共 ${count} 次写入请求` : `${count} clipboard write requests`),
  }
}

interface PendingWrite {
  readonly index: number
  readonly resolve: () => void
  readonly reject: () => void
}

function ClipboardFixture({ locale }: { readonly locale: ShellLocale }) {
  const labels = clipboardFixtureLabels(locale)
  const [scenario, setScenario] = useState<Scenario>('a')
  const [unavailable, setUnavailable] = useState(false)
  const [writes, setWrites] = useState<readonly string[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const pending = useRef<PendingWrite[]>([])
  const nextIndex = useRef(0)
  const clipboard = useMemo(
    () => ({
      writeText: (text: string) =>
        new Promise<void>((resolve, reject) => {
          const index = nextIndex.current++
          setWrites((current) => [...current, text])
          pending.current.push({ index, resolve, reject: () => reject(new Error('Injected clipboard rejection')) })
          setPendingCount(pending.current.length)
        }),
    }),
    [],
  )
  const settle = (success: boolean) => {
    const first = pending.current.shift()
    if (!first) return
    if (success) first.resolve()
    else first.reject()
    setPendingCount(pending.current.length)
  }
  const text =
    scenario === 'blank'
      ? ' \n\t'
      : scenario === 'limit'
        ? '🐙'.repeat(MAX_TOOL_RESULT_COPY_CHARACTERS / 2)
        : scenario === 'over'
          ? `${'🐙'.repeat(MAX_TOOL_RESULT_COPY_CHARACTERS / 2)}x`
          : scenario === 'b'
            ? clipboardTexts.b
            : scenario === 'replacement'
              ? clipboardTexts.replacement
              : clipboardTexts.a
  const source = scenario === 'b' ? 'b' : 'a'
  const originalCopy = getShellCopy(locale).session.messageBlocks.toolResultCopy
  const longLabels = new URL(location.href).searchParams.has('long')
  const copyLabels = longLabels
    ? {
        ...originalCopy,
        copy:
          locale === 'zh-CN'
            ? '复制此工具已经加载的完整输出（不包含输入与其他调用）'
            : 'Copy this tool’s complete loaded output (excluding input and other calls)',
        failed:
          locale === 'zh-CN'
            ? '当前系统暂时拒绝剪贴板写入。原始工具输出没有改变，可以在原输出旁再次重试。'
            : 'The system declined this clipboard write. The original tool output is unchanged; retry beside the same output.',
      }
    : originalCopy
  return (
    <LumenFrame as="main" className="clipboard-fixture" data-fixture-scenario={scenario}>
      <LumenText as="h1">{labels.title}</LumenText>
      <LumenText as="p">{labels.distinction}</LumenText>
      <LumenFrame className="clipboard-fixture-controls">
        {Object.entries(labels.scenarios).map(([id, name]) => (
          <LumenButton key={id} data-fixture-action={id} size="s" onClick={() => setScenario(id as Scenario)}>
            {name}
          </LumenButton>
        ))}
        <LumenButton data-fixture-action="available" size="s" onClick={() => setUnavailable(false)}>
          {labels.available}
        </LumenButton>
        <LumenButton data-fixture-action="unavailable" size="s" onClick={() => setUnavailable(true)}>
          {labels.unavailable}
        </LumenButton>
        <LumenButton data-fixture-action="resolve" size="s" disabled={!pendingCount} onClick={() => settle(true)}>
          {labels.accept}
        </LumenButton>
        <LumenButton data-fixture-action="reject" size="s" disabled={!pendingCount} onClick={() => settle(false)}>
          {labels.reject}
        </LumenButton>
      </LumenFrame>
      {scenario !== 'unmounted' ? (
        <LumenFrame as="section" className="hbar-session-tool-section" data-fixture-output={source}>
          <LumenFrame className="hbar-session-tool-result-heading">
            <LumenText as="span" className="hbar-session-tool-heading">
              {getShellCopy(locale).session.messageBlocks.output}
            </LumenText>
            <ToolResultCopyAction
              sessionId={`session-${source}`}
              messageId={`message-${source}`}
              callId="same-call"
              toolName="same-tool"
              text={text}
              labels={copyLabels}
              clipboard={unavailable ? null : clipboard}
            />
          </LumenFrame>
          <LumenText as="pre">{text.length > 100 ? text.slice(0, 100) : text}</LumenText>
        </LumenFrame>
      ) : null}
      <LumenText as="p" data-write-count={writes.length} data-pending-count={pendingCount}>
        {labels.writeCount(writes.length)}
      </LumenText>
      <LumenFrame className="clipboard-fixture-writes">
        {writes.map((write, index) => (
          <LumenText key={index} as="pre" data-write-index={index} data-write-length={write.length}>
            {write.length > 100 ? write.slice(0, 100) : write}
          </LumenText>
        ))}
      </LumenFrame>
    </LumenFrame>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Clipboard fixture root is missing')
const locale = resolveShellLocale(navigator.languages)
document.documentElement.lang = locale
createRoot(root).render(
  <LumenProvider appearance={createWebLumenAppearance('light', DEFAULT_WEB_APPEARANCE_DIMENSIONS, false)}>
    <ClipboardFixture locale={locale} />
  </LumenProvider>,
)
