import { useState } from 'react'
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Image as ImageIcon,
  Palette,
  Paperclip,
  Pin,
  Plus,
  SlidersHorizontal,
  Square,
  X,
} from 'lucide-react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './observed-chat.css'

type ChatVariant =
  'ai-chat-1' | 'ai-chat-2' | 'ai-chat-3' | 'ai-chat-4' | 'ai-chat-5' | 'ai-chat-6' | 'ai-chat-7' | 'ai-chat-8'
type Message = { kind: 'user' | 'assistant'; text: string; label?: string }

const messages: Record<ChatVariant, readonly Message[]> = {
  'ai-chat-1': [
    { kind: 'user', text: 'Why did refunds spike last week?' },
    {
      kind: 'assistant',
      text: 'Refunds rose 38% week over week, from $6,730 to $9,290. Almost all of the increase came from failed renewals after the card-retry window was shortened on the 12th. Downgrade credits were flat, and duplicate charges stayed in the single digits.',
    },
    { kind: 'user', text: 'Break it down by plan tier.' },
    {
      kind: 'assistant',
      text: 'By plan, Growth accounted for $5,180 of the refunds and Scale for $3,240, with Starter under $900. The renewal failures cluster on Growth annual plans billed on the 12th, so retrying those cards a day later would recover most of the amount.',
    },
  ],
  'ai-chat-2': [
    { kind: 'user', text: 'Build a three-tier pricing table component for the marketing site.' },
    {
      kind: 'assistant',
      text: 'Here is a responsive pricing table with Starter, Growth, and Scale. It maps over a plans array so you can edit copy without touching markup.',
      label: 'pricing-table.tsx',
    },
    { kind: 'user', text: 'Add a short plan description under each price.' },
    {
      kind: 'assistant',
      text: 'Done. I added a description line beneath each price and wrote the copy for all three tiers. This is version 3, so compare it against the earlier versions from the panel.',
    },
    { kind: 'user', text: 'Can you make the middle plan stand out?' },
    {
      kind: 'assistant',
      text: 'I marked Growth as the recommended plan without leaning on colour: it now carries a small “Recommended” label, a slightly heavier border, and a touch more vertical padding so it reads as primary.',
    },
  ],
  'ai-chat-3': [
    { kind: 'user', text: 'Summarize the latest release notes' },
    {
      kind: 'assistant',
      text: 'Version 2.4 focused on the new filter panel, faster search indexing, and keyboard-navigation fixes.',
    },
    { kind: 'user', text: 'What changed in the filter panel?' },
    {
      kind: 'assistant',
      text: 'It moved into a docked sidebar, gained saved views, and now remembers your last query per project.',
    },
    { kind: 'user', text: 'Draft acceptance criteria for the new filter' },
    {
      kind: 'assistant',
      text: 'Filters apply instantly, saved views persist per project, and every control stays reachable by keyboard.',
    },
  ],
  'ai-chat-4': [
    { kind: 'user', text: 'Compare our onboarding completion rate to last quarter.' },
    {
      kind: 'assistant',
      text: 'Completion rose to 71%, up from 63% last quarter. The largest gain came from the shortened setup step, which cut median time to first project from nine minutes to five.',
    },
    { kind: 'user', text: 'Where do people still drop off?' },
    {
      kind: 'assistant',
      text: 'The biggest remaining drop is at the invite-teammates step, where 22% leave without adding anyone. Making that step optional would likely lift completion by another three to four points based on the last experiment.',
    },
    { kind: 'user', text: 'Draft a one-line summary for the weekly update.' },
    {
      kind: 'assistant',
      text: 'Onboarding completion reached 71% this quarter, up eight points, driven by a faster setup step; the invite step is the next place to improve.',
    },
  ],
  'ai-chat-5': [
    { kind: 'user', text: 'Clean up the staging environment before tomorrow’s demo.' },
    {
      kind: 'assistant',
      text: 'I scanned the staging project and found two preview databases that have not been queried in 30 days and three API keys with no recent requests. I’ll remove them in a few steps so you can approve each one.',
    },
  ],
  'ai-chat-6': [
    { kind: 'user', text: 'Put together a competitive brief on the top three note-taking apps.' },
    {
      kind: 'assistant',
      text: 'I’ll split this into two parts. Researcher will gather pricing and the core feature set for each app, then Writer will turn that into a one-page brief.',
      label: 'PLANNER',
    },
    {
      kind: 'assistant',
      text: 'All three offer a free tier. Paid plans are $8, $10, and $12 per seat each month. The clearest differences are offline sync and end-to-end encryption, which only one app includes.',
      label: 'RESEARCHER',
    },
    { kind: 'user', text: 'Which one fits a small, privacy-focused team best?' },
    {
      kind: 'assistant',
      text: 'For a small team that puts privacy first, the encrypted app is the pick. It runs a dollar or two more per seat, but it is the only one that keeps notes end-to-end encrypted, and the price gap barely registers under ten seats.',
      label: 'WRITER',
    },
  ],
  'ai-chat-7': [
    { kind: 'user', text: 'Summarize why net revenue retention dropped in Q3.' },
    {
      kind: 'assistant',
      text: 'Net revenue retention fell to 104% from 111% the prior quarter.¹ The decline is concentrated in the mid-market segment, where two large accounts downgraded after a reorganization.² Expansion held up in enterprise, but new upsells slowed after the pricing change.³',
    },
    { kind: 'user', text: 'What would recover it fastest?' },
    {
      kind: 'assistant',
      text: 'The quickest lever is re-engaging the two downgraded mid-market accounts, which together account for four of the seven points lost.² A targeted win-back offer before renewal would address most of the gap, and reversing the upsell slowdown means revisiting the new tiers.³',
    },
    { kind: 'user', text: 'Which segment held up best?' },
    {
      kind: 'assistant',
      text: 'Enterprise held up best: expansion there was roughly flat, so almost all of the drag is coming from mid-market rather than a broad-based decline.³ Gross retention in enterprise actually improved slightly, which is why the net number did not fall further.⁴',
    },
    { kind: 'user', text: 'Draft a one-line summary for the board.' },
    {
      kind: 'assistant',
      text: 'Net revenue retention slipped to 104% in Q3 after two mid-market downgrades.¹ A renewal-timed win-back should recover most of the gap.²',
    },
  ],
  'ai-chat-8': [{ kind: 'user', text: 'Pull the three designs from the shared folder and tell me which one' }],
}

const pinnedSources = [
  ['q3-board-deck.pdf', 'PDF · 24 pages'],
  ['revenue-model.xlsx', 'Spreadsheet · updated Oct 2'],
  ['churn-analysis.md', 'Note · 1,200 words'],
  ['renewals-export.csv', 'Data · 8,400 rows'],
  ['qbr-notes.md', 'Note · 640 words'],
  ['pricing-change-brief.pdf', 'PDF · 6 pages'],
  ['support-tickets.csv', 'Data · 2,100 rows'],
  ['win-back-playbook.md', 'Note · 900 words'],
  ['exec-summary.docx', 'Doc · 3 pages'],
  ['segment-cohorts.xlsx', 'Spreadsheet · 14 tabs'],
] as const
const activityItems = [
  ['Planner', 'Split the task into research + writing'],
  ['Researcher', 'Pulled pricing for 3 apps'],
  ['Researcher', 'Compared offline-sync support'],
  ['Researcher', 'Checked encryption coverage'],
  ['Researcher', 'Noted free-tier limits'],
  ['Writer', 'Outlined the one-page brief'],
  ['Writer', 'Drafted the comparison'],
  ['Researcher', 'Summarized review sentiment'],
  ['Planner', 'Flagged the price trade-off'],
  ['Planner', 'Reviewed for a privacy angle'],
  ['Writer', 'Recommending an option'],
] as const

function Header({ title, detail, compact = false }: { title: string; detail: string; compact?: boolean }) {
  return (
    <header className={`rb-observed-chat-header${compact ? ' compact' : ''}`}>
      <strong>{title}</strong>
      <span>{detail}</span>
    </header>
  )
}

function ModelHeader() {
  return (
    <header className="rb-observed-chat-header rb-observed-model-header">
      <strong>Onboarding analysis</strong>
      <div className="rb-observed-model-controls">
        <button type="button" aria-label="Model: Atlas">
          Atlas <ChevronDown size={13} />
        </button>
        <span className="rb-observed-token-meter">
          <i>
            <b />
          </i>
          <span>12.4k / 32k tokens</span>
        </span>
        <button type="button" aria-label="Conversation settings">
          <SlidersHorizontal size={15} />
        </button>
      </div>
    </header>
  )
}

function JumpToLatest() {
  return (
    <button type="button" className="rb-observed-jump">
      <ArrowDown size={13} /> Jump to latest
    </button>
  )
}

function renderMessageText(text: string) {
  return text.split(/([¹²³⁴])/u).map((part, index) => {
    const citation = { '¹': '1', '²': '2', '³': '3', '⁴': '4' }[part as '¹' | '²' | '³' | '⁴']
    return citation ? (
      <button type="button" className="rb-observed-citation" aria-label={`Source ${citation}`} key={`${part}-${index}`}>
        {citation}
      </button>
    ) : (
      part
    )
  })
}

function Composer({
  placeholder = 'Ask anything',
  stop = false,
  attachment = false,
  compact = false,
  onInteraction: _onInteraction,
}: {
  placeholder?: string
  stop?: boolean
  attachment?: boolean
  compact?: boolean
  onInteraction?: ReferenceFixtureProps['onInteraction']
}) {
  const [text, setText] = useState('')
  if (compact) {
    return (
      <footer className="rb-observed-composer rb-observed-compact-composer">
        <textarea
          aria-label="Message"
          placeholder={placeholder}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="button" aria-label="Send">
          <ArrowUp size={16} />
        </button>
      </footer>
    )
  }
  return (
    <footer className="rb-observed-composer">
      <div className="rb-observed-composer-input">
        {attachment && (
          <div className="rb-observed-attachment">
            <FileText size={13} /> refunds-week-24.csv{' '}
            <button type="button" aria-label="Remove attachment">
              <X size={12} />
            </button>
          </div>
        )}
        <textarea
          aria-label="Message"
          placeholder={placeholder}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      <div className="rb-observed-composer-actions">
        <button type="button" aria-label="Add attachment">
          <Plus size={15} />
        </button>
        <span>⌘ Enter to send</span>
        <button type="button" className={stop ? 'stop' : ''} aria-label={stop ? 'Stop generating' : 'Send'}>
          {stop ? <Square className="stop-icon" size={14} /> : <ArrowUp size={15} />}
          {stop && <ArrowUp className="send-icon" size={15} />}
        </button>
      </div>
    </footer>
  )
}

function AssistantMessage({
  message,
  tool,
  reasoning,
  approval,
  artifact,
  sources,
  regenerate = false,
  copy = false,
}: {
  message: Message
  tool?: string
  reasoning?: boolean
  approval?: boolean
  artifact?: boolean
  sources?: readonly string[]
  regenerate?: boolean
  copy?: boolean
}) {
  return (
    <article className="rb-observed-message assistant">
      <div className="rb-observed-message-copy">
        {message.label && !artifact && <span className="rb-observed-label">{message.label}</span>}
        {reasoning && (
          <details className="rb-observed-reasoning">
            <summary>Thought for 4s</summary>
          </details>
        )}
        {tool && !approval && (
          <button type="button" className="rb-observed-tool">
            <ChevronRight size={13} />
            <span className="rb-observed-tool-name">{tool}</span>
            <small>Done</small>
            <time>1.2s</time>
          </button>
        )}
        <p>{renderMessageText(message.text)}</p>
        {message.label && artifact && (
          <button type="button" className="rb-observed-artifact-link">
            <FileText size={13} />
            <span>{message.label}</span>
            <small>Open in panel</small>
            <ChevronRight size={13} />
          </button>
        )}
        {tool && approval && (
          <button type="button" className="rb-observed-tool">
            <ChevronRight size={13} />
            <span className="rb-observed-tool-name">{tool}</span>
            <small>Done</small>
            <time>0.9s</time>
          </button>
        )}
        {sources && (
          <div className="rb-observed-sources">
            <span>Sources</span>
            {sources.map((source) => (
              <span key={source}>{source}</span>
            ))}
          </div>
        )}
        {approval && (
          <>
            <div className="rb-observed-status-lines">
              <span>● Approved · Deleted 2 preview databases</span>
              <span>● Approved · Cleared 5 idle sessions</span>
            </div>
            <div className="rb-observed-approval">
              <div className="rb-observed-approval-main">
                <strong>
                  <i />
                  Needs approval
                </strong>
                <p>
                  Delete 3 unused API keys from the staging project. Any service still using them will start returning
                  401 errors. This cannot be undone.
                </p>
              </div>
            <div className="rb-observed-approval-footer">
              <button type="button" className="show-request">
                <ChevronRight size={12} />
                Show request
              </button>
                <div className="rb-observed-approval-actions">
                  <button type="button" className="primary">
                    Delete keys
                  </button>
                  <button type="button">Keep them</button>
                </div>
              </div>
            </div>
          </>
        )}
        {regenerate && (
          <div className="rb-observed-message-actions">
            <button type="button" className="rb-observed-regenerate">
              ↻ Regenerate
            </button>
            {copy && (
              <button type="button" className="rb-observed-copy" aria-label="Copy reply">
                <Copy size={14} />
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

function MessageStream({ variant }: { variant: ChatVariant }) {
  const stream = messages[variant]
  return (
    <div className={`rb-observed-stream stream-${variant}`}>
      {stream.map((message, index) => {
        if (message.kind === 'user')
          return (
            <div className="rb-observed-message user" key={`${message.text}-${index}`}>
              {message.text}
            </div>
          )
        const assistantProps = {
          message,
          reasoning: variant === 'ai-chat-1' && index === 1,
          approval: variant === 'ai-chat-5',
          regenerate: index === stream.length - 1 && ['ai-chat-2', 'ai-chat-4', 'ai-chat-6', 'ai-chat-7'].includes(variant),
          copy: variant === 'ai-chat-1' && index === stream.length - 1,
        }
        if (variant === 'ai-chat-1' && index === 1)
          return (
            <AssistantMessage
              key={`${message.text}-${index}`}
              {...assistantProps}
              tool="Searched 1,284 refunds"
              sources={['Billing events', 'Pricing change · Jun 12']}
            />
          )
        if (variant === 'ai-chat-2' && index === 1)
          return <AssistantMessage key={`${message.text}-${index}`} {...assistantProps} artifact />
        if (variant === 'ai-chat-5' && index === 1)
          return (
            <AssistantMessage key={`${message.text}-${index}`} {...assistantProps} tool="Scanned staging resources" />
          )
        return (
          <AssistantMessage
            key={`${message.text}-${index}`}
            {...assistantProps}
            regenerate={assistantProps.regenerate || (variant === 'ai-chat-1' && index === stream.length - 1)}
          />
        )
      })}
    </div>
  )
}

function StandardChat({
  variant,
  onInteraction,
}: {
  variant: ChatVariant
  onInteraction?: ReferenceFixtureProps['onInteraction']
}) {
  const titles: Record<ChatVariant, [string, string]> = {
    'ai-chat-1': ['Revenue assistant', 'Atlas'],
    'ai-chat-4': ['Onboarding analysis', 'Atlas'],
    'ai-chat-5': ['Staging cleanup', 'Atlas · Needs review'],
    'ai-chat-6': ['Competitive brief', 'Planner · 3 agents'],
    'ai-chat-7': ['Q3 retention review', '6 sources · cited'],
    'ai-chat-2': ['Build assistant', 'Draft'],
    'ai-chat-3': ['Assistant', 'Ready'],
    'ai-chat-8': ['Voice message', 'Listening · 0:15'],
  }
  const [title, detail] = titles[variant]
  return (
    <div
      className={`rb-observed-chat rb-observed-${variant}`}
      onClickCapture={(event) => reportFixtureClick(event, onInteraction)}
    >
      {variant === 'ai-chat-4' ? <ModelHeader /> : <Header title={title} detail={detail} />}
      {variant === 'ai-chat-4' && <div className="rb-observed-usage" aria-hidden="true" />}
      <main className="rb-observed-column">
        <MessageStream variant={variant} />
      </main>
      <Composer stop={variant !== 'ai-chat-5'} attachment={variant === 'ai-chat-1'} />
      {['ai-chat-1', 'ai-chat-2', 'ai-chat-4', 'ai-chat-5', 'ai-chat-6', 'ai-chat-7'].includes(variant) && <JumpToLatest />}
      {
        <button type="button" className="rb-observed-theme" aria-label="Theme">
          <Palette size={14} /> Theme
        </button>
      }
    </div>
  )
}

function ArtifactChat({ onInteraction }: { onInteraction?: ReferenceFixtureProps['onInteraction'] }) {
  const [tab, setTab] = useState('Code')
  const [version, setVersion] = useState('v3')
  return (
    <div
      className="rb-observed-chat rb-observed-ai-chat-2"
      onClickCapture={(event) => reportFixtureClick(event, onInteraction)}
    >
      <div className="rb-observed-artifact-main">
        <Header title="Build assistant" detail="Draft" />
        <main className="rb-observed-column">
          <MessageStream variant="ai-chat-2" />
        </main>
        <Composer stop onInteraction={onInteraction} />
      </div>
      <aside className="rb-observed-artifact">
        <div className="rb-observed-artifact-surface">
          <div className="rb-observed-artifact-top">
            <header>
              <strong>pricing-table.tsx</strong>
              <div>
                <button type="button" aria-label="Copy artifact">
                  <Copy size={15} />
                </button>
                <button type="button" aria-label="Download artifact">
                  <Download size={15} />
                </button>
              </div>
            </header>
            <nav>
              <div>
                {['Code', 'Document'].map((item) => (
                  <button
                    type="button"
                    className={tab === item ? 'selected' : ''}
                    key={item}
                    onClick={() => setTab(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <div>
                {['v3', 'v2', 'v1'].map((item) => (
                  <button
                    type="button"
                    className={version === item ? 'selected' : ''}
                    key={item}
                    onClick={() => setVersion(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </nav>
          </div>
          <div className="rb-observed-artifact-code">
            <pre>
              {tab === 'Code'
                ? `type Plan = {\n  name: string\n  price: string\n  period: string\n  cta: string\n}\n\nexport function PricingTable({ plans,\n}: { plans: Plan[] }) {\n  return (\n    <div className="grid gap-4">\n      {plans.map((plan) => (\n        <article key={plan.name}>\n          <h3>{plan.name}</h3>\n          <p>{plan.price}</p>\n          <span>{plan.period}</span>\n          <button>{plan.cta}</button>\n        </article>\n      ))}\n    </div>\n  )\n}`
                : `${version} · pricing table document`}
            </pre>
          </div>
        </div>
        <button type="button" className="rb-observed-theme" aria-label="Theme">
          <Palette size={14} /> Theme
        </button>
      </aside>
      <JumpToLatest />
    </div>
  )
}

function CompactChat({ onInteraction }: { onInteraction?: ReferenceFixtureProps['onInteraction'] }) {
  return (
    <div
      className="rb-observed-chat rb-observed-ai-chat-3"
      onClickCapture={(event) => reportFixtureClick(event, onInteraction)}
    >
      <div className="rb-observed-compact-card">
        <Header title="Assistant" detail="● Ready" compact />
        <main className="rb-observed-compact-body">
          <MessageStream variant="ai-chat-3" />
          <div className="rb-observed-compact-composer-shell">
            <Composer compact placeholder="Ask anything" onInteraction={onInteraction} />
          </div>
        </main>
      </div>
    </div>
  )
}

function ActivityChat({ onInteraction }: { onInteraction?: ReferenceFixtureProps['onInteraction'] }) {
  return (
    <div
      className="rb-observed-chat rb-observed-ai-chat-6"
      onClickCapture={(event) => reportFixtureClick(event, onInteraction)}
    >
      <div className="rb-observed-artifact-main">
        <Header title="Competitive brief" detail="Planner · 3 agents" />
        <main className="rb-observed-column">
          <MessageStream variant="ai-chat-6" />
        </main>
        <Composer stop onInteraction={onInteraction} />
      </div>
      <aside className="rb-observed-activity">
        <h2>Activity</h2>
        <div className="rb-observed-activity-surface">
          <div className="rb-observed-activity-list">
            {activityItems.map(([who, text]) => (
              <article key={`${who}-${text}`}>
                <i />
                <strong>{who}</strong>
                <span>Done</span>
                <small>{text}</small>
              </article>
            ))}
          </div>
        </div>
        <button type="button" className="rb-observed-theme" aria-label="Theme">
          <Palette size={14} /> Theme
        </button>
      </aside>
      <JumpToLatest />
    </div>
  )
}

function PinnedChat({ onInteraction }: { onInteraction?: ReferenceFixtureProps['onInteraction'] }) {
  return (
    <div
      className="rb-observed-chat rb-observed-ai-chat-7"
      onClickCapture={(event) => reportFixtureClick(event, onInteraction)}
    >
      <aside className="rb-observed-pinned">
        <h2>
          <Pin size={14} /> Pinned sources
        </h2>
        <div className="rb-observed-pinned-surface">
          <div className="rb-observed-pinned-list">
            {pinnedSources.map(([name, meta], index) => (
              <button type="button" key={name}>
                <b>{index + 1}</b>
                <span>
                  <strong>{name}</strong>
                  <small>{meta}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      </aside>
      <div className="rb-observed-artifact-main">
        <Header title="Q3 retention review" detail="6 sources · cited" />
        <main className="rb-observed-column">
          <MessageStream variant="ai-chat-7" />
        </main>
        <Composer onInteraction={onInteraction} />
      </div>
      <button type="button" className="rb-observed-theme" aria-label="Theme">
        <Palette size={14} /> Theme
      </button>
      <JumpToLatest />
    </div>
  )
}

function VoiceChat({ onInteraction, viewport }: { onInteraction?: ReferenceFixtureProps['onInteraction']; viewport?: ReferenceFixtureProps['viewport'] | undefined }) {
  const [recording, setRecording] = useState(true)
  const voicePrompt = viewport === 'desktop'
    ? 'Pull the three designs from the shared folder and tell me which one'
    : viewport === 'mobile'
      ? 'Pull the three designs from the shared folder and tell me which one has the strongest contrast in dark mode.'
      : 'Pull the three designs from the shared folder and tell me which one has the strongest contrast in dark mode.'
  const mobilePromptLines = [
    'Pull the three designs from',
    'the shared folder and tell me',
    'which one has the strongest',
    'contrast in dark mode.',
  ]
  const waveformHeights = viewport === 'mobile'
    ? [38, 32, 46, 36, 44, 40, 38, 30, 28, 46, 18, 38, 36, 42, 24, 30, 40, 38, 48, 34, 30, 40, 32, 30, 22, 32, 38, 36]
    : viewport === 'tablet'
      ? [17, 29, 15, 17, 31, 45, 23, 43, 29, 41, 41, 27, 27, 23, 25, 49, 39, 41, 45, 55, 20, 17, 17, 25, 43, 41, 23, 29]
      : [39, 31, 53, 34, 33, 13, 27, 41, 29, 51, 41, 29, 47, 53, 39, 19, 19, 45, 47, 33, 37, 31, 17, 33, 51, 37, 33, 51]
  const voiceTime = viewport === 'mobile' ? '0:19' : viewport === 'tablet' ? '0:16' : '0:15'
  return (
    <div
      className="rb-observed-chat rb-observed-ai-chat-8"
      onClickCapture={(event) => reportFixtureClick(event, onInteraction)}
    >
      <div className="rb-observed-voice-column">
        <header className="rb-observed-chat-header">
          <strong>Voice message</strong>
            <span className="rb-observed-voice-status" data-time={voiceTime}>
              <i /> Listening <b>·</b> <em>{voiceTime}</em>
          </span>
        </header>
        <p className="rb-observed-voice-prompt">
          {viewport === 'mobile'
            ? mobilePromptLines.map((line) => <span key={line}>{line}</span>)
            : voicePrompt}
        </p>
        <div className="rb-observed-waveform">
          {waveformHeights.map((height, index) => (
            <i key={index} style={{ height: `${height}px` }} />
          ))}
        </div>
        <div className="rb-observed-voice-composer">
          <div className="rb-observed-file-pills">
            <span>
              <ImageIcon size={14} /> hero-option-a.png{' '}
              <button type="button" aria-label="Remove hero-option-a.png">
                <X size={14} />
              </button>
            </span>
            <span>
              <ImageIcon size={14} /> hero-option-b.png{' '}
              <button type="button" aria-label="Remove hero-option-b.png">
                <X size={14} />
              </button>
            </span>
            <span>
              <Paperclip size={14} /> brand-guidelines.pdf{' '}
              <button type="button" aria-label="Remove brand-guidelines.pdf">
                <X size={14} />
              </button>
            </span>
          </div>
          <div>
            <button
              type="button"
              className={recording ? 'recording' : ''}
              onClick={() => setRecording((value) => !value)}
              aria-label={recording ? 'Stop recording' : 'Start recording'}
            >
              {recording ? <Square size={16} /> : <Activity size={16} />}
            </button>
            <span>{recording ? 'Tap to stop' : 'Tap to record'}</span>
            <button type="button" aria-label="Send">
              <ArrowUp size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ObservedChat({
  variant,
  onInteraction,
  viewport,
}: {
  variant: ChatVariant
  onInteraction?: ReferenceFixtureProps['onInteraction']
  viewport?: ReferenceFixtureProps['viewport']
}) {
  if (variant === 'ai-chat-2') return <ArtifactChat onInteraction={onInteraction} />
  if (variant === 'ai-chat-3') return <CompactChat onInteraction={onInteraction} />
  if (variant === 'ai-chat-6') return <ActivityChat onInteraction={onInteraction} />
  if (variant === 'ai-chat-7') return <PinnedChat onInteraction={onInteraction} />
  if (variant === 'ai-chat-8') return <VoiceChat onInteraction={onInteraction} viewport={viewport} />
  return <StandardChat variant={variant} onInteraction={onInteraction} />
}

export type { ChatVariant }
