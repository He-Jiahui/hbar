import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'bun:test'
import type { Approval, ContentBlock, Message, Run, UserInputRequest } from '@hbar/contracts'
import ChatApprovalSurface from './ChatApprovalSurface'
import ChatMessageSurface from './ChatMessageSurface'
import ChatQueueSurface from './ChatQueueSurface'
import ToolCallSurface from './ToolCallSurface'
import ToolResultSurface from './ToolResultSurface'
import UserInputSurface from './UserInputSurface'

const labels = {
  thinking: 'Thinking',
  you: 'You',
  copyMessage: 'Copy message',
  before: 'Before',
  after: 'After',
  arguments: 'Arguments',
  callArguments: 'Call arguments',
}

const toolCall: Extract<ContentBlock, { type: 'tool_call' }> = {
  type: 'tool_call',
  callId: 'call_1',
  name: 'read_file',
  args: { path: 'src/index.ts' },
}

const toolResult: Extract<ContentBlock, { type: 'tool_result' }> = {
  type: 'tool_result',
  callId: 'call_1',
  name: 'read_file',
  text: 'ok',
  isError: false,
  details: { before: 'old', after: 'new', path: 'src/index.ts' },
}

const message: Message = {
  id: 'message_1',
  sessionId: 'session_1',
  runId: 'run_1',
  role: 'assistant',
  content: [{ type: 'text', text: 'done' }, toolCall, toolResult],
  seq: 1,
  createdAt: 0,
}

const approval: Approval = {
  id: 'approval_1',
  sessionId: 'session_1',
  runId: 'run_1',
  callId: 'call_1',
  tool: 'write_file',
  args: { path: 'approved.txt', text: 'ok' },
  status: 'pending',
  createdAt: 0,
}

const request: UserInputRequest = {
  requestId: 'request_1',
  sessionId: 'session_1',
  runId: 'run_1',
  callId: 'call_1',
  questions: [
    {
      id: 'scope',
      header: 'Scope',
      question: 'Which scope?',
      options: [{ label: 'App', description: 'Application' }],
      isOther: false,
      isSecret: false,
    },
  ],
  isBlocking: true,
}

const run: Run = {
  id: 'run_2',
  sessionId: 'session_1',
  requestId: 'request_2',
  input: { text: 'queued', images: [], files: [] },
  modelId: 'model',
  status: 'queued',
  createdAt: 0,
  startedAt: null,
  endedAt: null,
  error: null,
}

test('chat message surface preserves ordered blocks and ReactBits tool bindings', () => {
  const markup = renderToStaticMarkup(
    createElement(ChatMessageSurface, {
      message,
      labels,
      artifactUrl: (id) => `/artifact/${id}`,
      renderMarkdown: (text) => createElement('p', null, text),
      renderCode: (value) => createElement('code', null, value),
      onCopy: () => undefined,
    }),
  )
  expect(markup).toContain('rb-chat-message-surface')
  expect(markup).toContain('data-reactbits-reference="https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-1"')
  expect(markup).toContain('rb-tool-call-surface')
  expect(markup).toContain('rb-tool-result-surface')
  expect(markup).toContain('done')
})

test('decision and queue surfaces expose live entities through typed callbacks', () => {
  const approvalMarkup = renderToStaticMarkup(
    createElement(ChatApprovalSurface, {
      approval,
      labels: { approveTool: 'Approve tool', viewRequest: 'View request', deny: 'Deny', approve: 'Approve', allowRemember: 'Remember' },
      impact: 'Workspace impact',
      summary: 'write_file · approved.txt',
      resolving: false,
      onResolve: () => undefined,
    }),
  )
  const inputMarkup = renderToStaticMarkup(
    createElement(UserInputSurface, {
      request,
      labels: {
        userInputRequired: 'Answer needed',
        questionsCount: 'questions',
        recommended: 'Recommended',
        other: 'Other',
        otherAnswer: 'Other answer',
        fillOtherAnswer: 'Fill other',
        fillAnswer: 'Fill answer',
        answer: 'Answer',
        submitAnswers: 'Submit',
        answerAllQuestions: 'Answer all',
        inputHandled: 'Handled',
      },
      resolve: async () => ({ accepted: true }),
    }),
  )
  const queueMarkup = renderToStaticMarkup(
    createElement(ChatQueueSurface, {
      runs: [run],
      labels: {
        queueAria: 'Queue',
        queueCount: 'queued',
        queueAutoSend: 'Auto send',
        queueContinue: 'Continue',
        editQueued: 'Edit queued',
        removeQueued: 'Remove queued',
        edit: 'Edit',
        remove: 'Remove',
        attachmentMessage: 'Attachment',
      },
      onStopActive: () => undefined,
      onEdit: () => undefined,
      onRemove: () => undefined,
      onReorder: () => undefined,
    }),
  )
  const callMarkup = renderToStaticMarkup(createElement(ToolCallSurface, { block: toolCall, labels }))
  const resultMarkup = renderToStaticMarkup(
    createElement(ToolResultSurface, { block: toolResult, labels: { before: 'Before', after: 'After' } }),
  )
  expect(approvalMarkup).toContain('rb-approval-surface')
  expect(inputMarkup).toContain('rb-user-input-surface')
  expect(queueMarkup).toContain('rb-queue-surface')
  expect(callMarkup).toContain('data-reactbits-reference="https://pro.reactbits.dev/docs/app-ui/tool-calls"')
  expect(resultMarkup).toContain('data-reactbits-reference="https://pro.reactbits.dev/docs/app-ui/tool-calls/tool-calls-2"')
})
