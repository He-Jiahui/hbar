// Actual hbar renderer with synthetic documents. No Host, Run or provider.
import { StrictMode, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { LumenButton, LumenFrame, LumenProvider, LumenText } from '@lumen/app-ui'
import { MessageMarkdown } from '../../packages/app-react/src/message-markdown'
import { HbarFileMarkdownPreview } from '../../packages/app-react/src/file-markdown-preview'
import { sessionFindRanges } from '../../packages/app-react/src/session-find-highlights'
import { projectSessionFindText } from '../../packages/app-react/src/session-find-text'
import { revealSessionCodeBlocks } from '../../packages/app-react/src/session-code-block-dom'
import { getShellCopy, resolveShellLocale } from '../../apps/web/src/shell-copy'
import { createWebLumenAppearance, DEFAULT_WEB_APPEARANCE_DIMENSIONS } from '../../apps/web/src/appearance'
import '@lumen/app-ui/styles.css'
import '../../apps/web/src/document.css'

const graph = 'flowchart TD\n  Start[Open document] --> Parse[Parse Markdown]\n  Parse --> Render[Render Mermaid]'
const cases = {
  valid: graph,
  invalid: 'flowchart TD\n A[unfinished',
  restricted: 'flowchart TD\n A@{img: "https://diagram.invalid/pixel.png"}',
  replacement: 'sequenceDiagram\n Reader->>Document: Replacement source\n Document-->>Reader: Ready',
  large: `flowchart TD\n${' '.repeat(16 * 1024)}`,
  wide: `flowchart LR\n ${Array.from({ length: 12 }, (_, i) => `N${i}[Step ${i}]`).join(' --> ')}`,
} as const
type Scenario = keyof typeof cases
function Fixture() {
  const locale = resolveShellLocale(navigator.languages)
  const copy = getShellCopy(locale)
  const [scenario, setScenario] = useState<Scenario>('valid')
  const [surface, setSurface] = useState<'message' | 'file'>('message')
  const [streaming, setStreaming] = useState(false)
  const [owner, setOwner] = useState(0)
  const [findResult, setFindResult] = useState<string | null>(null)
  const owners = useRef([{}, {}])
  const output = useRef<HTMLDivElement>(null)
  const text = `\`\`\`mermaid\n${cases[scenario]}\n\`\`\``
  const labels = new URL(location.href).searchParams.has('long-labels')
    ? {
        ...copy.session.messageBlocks.codeBlock,
        diagram: {
          ...copy.session.messageBlocks.codeBlock.diagram,
          source:
            locale === 'zh-CN'
              ? '查看当前图示未经改写的完整原始源码'
              : 'View the complete original source of this diagram',
        },
      }
    : copy.session.messageBlocks.codeBlock
  const actions = {
    valid: locale === 'zh-CN' ? '有效图示' : 'Valid diagram',
    invalid: locale === 'zh-CN' ? '无效图示' : 'Invalid diagram',
    restricted: locale === 'zh-CN' ? '受限图示' : 'Restricted diagram',
    replacement: locale === 'zh-CN' ? '替换图示' : 'Replacement diagram',
    large: locale === 'zh-CN' ? '超限图示' : 'Large diagram',
    wide: locale === 'zh-CN' ? '宽图示' : 'Wide diagram',
    message: locale === 'zh-CN' ? '消息正文' : 'Message body',
    file: locale === 'zh-CN' ? '文件正文' : 'File body',
    stream: locale === 'zh-CN' ? '切换流式状态' : 'Toggle streaming',
    owner: locale === 'zh-CN' ? '替换阅读所有者' : 'Replace reading owner',
    find: locale === 'zh-CN' ? '查找并显示原始代码' : 'Find and reveal source code',
  }
  const reveal = () => {
    const element = output.current
    const projection = projectSessionFindText(text)
    const start = projection?.text.indexOf('Parse Markdown') ?? -1
    if (!element || !projection || start < 0) return
    const ranges = sessionFindRanges(element, projection, start, start + 'Parse Markdown'.length)
    if (!ranges) {
      setFindResult('mapping_failed')
      return
    }
    revealSessionCodeBlocks(ranges)
    setFindResult(ranges.map((range) => range.toString()).join(''))
  }
  return (
    <LumenFrame as="main" className="diagram-fixture">
      <LumenFrame className="diagram-fixture-controls">
        {(Object.keys(cases) as Scenario[]).map((value) => (
          <LumenButton key={value} size="s" data-action={value} onClick={() => setScenario(value)}>
            {actions[value]}
          </LumenButton>
        ))}
        {(['message', 'file'] as const).map((value) => (
          <LumenButton key={value} size="s" data-action={value} onClick={() => setSurface(value)}>
            {actions[value]}
          </LumenButton>
        ))}
        <LumenButton size="s" data-action="stream" onClick={() => setStreaming((value) => !value)}>
          {actions.stream}
        </LumenButton>
        <LumenButton size="s" data-action="owner" onClick={() => setOwner((value) => 1 - value)}>
          {actions.owner}
        </LumenButton>
        <LumenButton size="s" data-action="find" onClick={reveal}>
          {actions.find}
        </LumenButton>
      </LumenFrame>
      <LumenFrame ref={output} className="hbar-session-message-prose" data-output="">
        {surface === 'message' ? (
          <MessageMarkdown
            text={text}
            findSegmentId="text:0"
            code={{
              sessionId: 'fixture-session',
              messageId: 'fixture-message',
              segmentId: 'text:0',
              owner: owners.current[owner],
              labels,
            }}
            fileReferences={{
              owner: owners.current,
              targetKey: 'fixture-session',
              streaming,
              labels: copy.session.fileReferences,
              onOpen: () => Promise.reject(new Error('No file actions in fixture')),
            }}
          />
        ) : (
          <HbarFileMarkdownPreview
            path="diagram.md"
            value={text}
            label={copy.files.textPreview('diagram.md')}
            imageLabel={copy.files.markdownImage}
            openFileLabel={copy.files.openLinkedFile}
            onOpenFile={() => {
              throw new Error('No file actions in fixture')
            }}
            code={{ previewId: 'fixture-file', owner: owners.current, labels }}
          />
        )}
      </LumenFrame>
      {findResult && (
        <LumenText as="p" data-find-result="">
          {findResult}
        </LumenText>
      )}
    </LumenFrame>
  )
}
const root = document.getElementById('root')
if (!root) throw new Error('Missing diagram fixture root')
createRoot(root).render(
  <StrictMode>
    <LumenProvider appearance={createWebLumenAppearance('light', DEFAULT_WEB_APPEARANCE_DIMENSIONS, false)}>
      <Fixture />
    </LumenProvider>
  </StrictMode>,
)
