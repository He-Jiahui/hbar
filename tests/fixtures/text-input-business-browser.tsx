import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DEFAULT_LUMEN_APPEARANCE, type LumenSize } from '@lumen/app-ui/appearance'
import LumenProvider from '@lumen/app-ui/provider'
import {
  HbarChatSearchView,
  HbarPreSessionChoicePicker,
  HbarPreSessionSlashEditor,
  HbarPreSessionLanding,
  HbarProposedPlan,
  HbarSessionDecision,
} from '@hbar/app-react'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import { chatSearchCopy } from '../../apps/web/src/chat-search-copy'
import { preSessionCopy } from '../../apps/web/src/pre-session-copy'
import '@lumen/app-ui/styles.css'
import '../../apps/web/src/workbench-design.css'

const fixtureCopy = {
  heading: '实际业务组件的文本间距验证',
  plan: '# 验证计划\n\n保留原有输入、焦点和可访问名称。',
  question: '说明需要保留的长中文内容与文件路径',
  secret: '输入私密值',
  model: '一个很长的本地测试模型名称',
} as const
const callbacks = { onDecision() {}, onPlanExit() {}, onSubmit() {}, onReconcile() {} }

function TextInputBusinessFixture() {
  const mode = document.documentElement.dataset.lumenMode === 'light' ? 'light' : 'dark'
  const requestedSize = document.documentElement.dataset.lumenControlSize
  const controlSize: LumenSize = requestedSize === 's' || requestedSize === 'l' ? requestedSize : 'm'
  const locale = document.documentElement.lang.startsWith('zh') ? 'zh-CN' : 'en-US'
  const copy = getShellCopy(locale)
  const [query, setQuery] = useState('')
  const search = useRef<HTMLInputElement>(null)
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState<string | null>(null)
  const [answers, setAnswers] = useState<
    Record<string, { readonly kind: 'option' | 'custom'; readonly value: string }>
  >({})

  return (
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode, controlSize }} withCssBaseline={false}>
      <main className="padding-business-fixture" data-hbar-app-ui-shell="app">
        <h1>{fixtureCopy.heading}</h1>
        <section className="padding-business-search">
          <HbarChatSearchView
            inputRef={search}
            query={query}
            status="empty"
            rows={[]}
            selectedResultId={null}
            truncated={false}
            error={null}
            labels={chatSearchCopy(locale)}
            onQueryChange={setQuery}
            onSourceChange={() => {}}
            onMove={() => {}}
            onSelect={() => {}}
            onOpen={() => {}}
            onClose={() => {}}
            onCompositionStart={() => {}}
            onCompositionEnd={setQuery}
            onRetry={() => {}}
          />
        </section>
        <section id="business-composer">
          <HbarPreSessionLanding
            labels={copy.preSession}
            composer={{
              value: prompt,
              attachments: [],
              submitting: false,
              uploading: false,
              canSubmit: true,
              onChange: setPrompt,
              onRemoveAttachment: () => {},
              onSubmit: () => {},
              editor: (controls) => (
                <HbarPreSessionSlashEditor
                  {...controls}
                  sendBehavior={null}
                  labels={copy.session.slash}
                  onLocalCommand={() => {}}
                />
              ),
            }}
          />
        </section>
        <HbarPreSessionChoicePicker
          placement="dialog"
          labels={preSessionCopy(locale).model}
          selectedId={model}
          items={[{ id: 'local', label: fixtureCopy.model }]}
          onChoose={setModel}
        />
        <section id="business-proposed-plan">
          <HbarProposedPlan
            target={{
              sessionId: 'fixture',
              messageId: 'message',
              sourceRunId: 'run',
              sourceSeq: 1,
              fingerprint: 'a'.repeat(64),
            }}
            markdown={fixtureCopy.plan}
            labels={copy.session.proposedPlan}
            state={{
              status: 'idle',
              canSubmit: true,
              connected: true,
              reconciling: false,
              error: null,
              unavailable: null,
            }}
            onSubmit={() => {}}
            onReconcile={() => {}}
          />
        </section>
        <section id="business-plan-exit">
          <HbarSessionDecision
            decision={{
              kind: 'approval',
              id: 'exit',
              sessionId: 'fixture',
              runId: 'run',
              callId: 'exit',
              tool: 'exit_plan_mode',
              approval: {
                id: 'exit',
                sessionId: 'fixture',
                runId: 'run',
                callId: 'exit',
                tool: 'exit_plan_mode',
                args: { plan: fixtureCopy.plan },
                status: 'pending',
                createdAt: 1,
              },
            }}
            labels={copy.session.decisions}
            connected
            onAnswer={() => {}}
            {...callbacks}
          />
        </section>
        {(['text', 'secret'] as const).map((kind) => (
          <section key={kind} id={`business-answer-${kind}`}>
            <HbarSessionDecision
              decision={{
                kind: 'questionnaire',
                id: kind,
                requestId: kind,
                sessionId: 'fixture',
                runId: 'run',
                callId: kind,
                tool: 'request_user_input',
                pending: true,
                fact: null,
                questions: [
                  {
                    id: kind,
                    header: kind === 'secret' ? fixtureCopy.secret : fixtureCopy.question,
                    question: fixtureCopy.question,
                    options: [],
                    isOther: false,
                    isSecret: kind === 'secret',
                  },
                ],
              }}
              labels={copy.session.decisions}
              connected
              answers={answers}
              onAnswer={(target) => setAnswers((current) => ({ ...current, [target.questionId]: target.answer }))}
              {...callbacks}
            />
          </section>
        ))}
      </main>
    </LumenProvider>
  )
}

const root = document.getElementById('fixture-root')
if (!root) throw new Error('Missing business text input fixture root')
createRoot(root).render(<TextInputBusinessFixture />)
