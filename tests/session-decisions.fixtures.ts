import type { SessionTimelineState } from '@hbar/app-runtime'
export const decisionRequest = {
  sessionId: 'one',
  runId: 'run',
  callId: 'question-call',
  requestId: 'question',
  isBlocking: true,
  questions: [
    {
      id: 'choice',
      header: '选择',
      question: '你希望使用哪个入口？',
      options: [
        { label: '原位', description: '保留当前上下文' },
        { label: '新页', description: '打开其他栏目' },
      ],
      isOther: true,
      isSecret: false,
    },
    { id: 'secret', header: '秘密', question: '输入私密值', options: [], isOther: false, isSecret: true },
  ],
}
export const decisionApproval = {
  id: 'approval',
  sessionId: 'one',
  runId: 'run',
  callId: 'edit-call',
  tool: 'edit_file',
  args: { path: 'src/example.ts', oldText: 'before', newText: 'after' },
  status: 'pending' as const,
  createdAt: 1,
}
export function decisionsTimeline(): SessionTimelineState {
  return {
    sessionId: 'one',
    status: 'ready',
    olderStatus: 'idle',
    olderError: null,
    messages: [
      {
        id: 'assistant',
        sessionId: 'one',
        runId: 'run',
        role: 'assistant',
        seq: 1,
        createdAt: 1,
        content: [
          {
            type: 'tool_call',
            callId: 'edit-call',
            name: 'edit_file',
            args: { path: 'original-args-not-reviewed.ts' },
          },
          {
            type: 'tool_call',
            callId: 'question-call',
            name: 'request_user_input',
            args: { questions: decisionRequest.questions },
          },
        ],
      },
    ],
    runs: [],
    approvals: [decisionApproval],
    userInputs: [decisionRequest],
    streams: {},
    plan: null,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    events: [],
    cursor: 1,
    hasOlder: false,
    error: null,
  }
}
export const decisionAnswers = { choice: { answers: ['原位'] }, secret: { answers: ['private-value'] } }
export function answeredTimeline(): SessionTimelineState {
  const current = decisionsTimeline()
  return {
    ...current,
    userInputs: [],
    messages: [
      ...current.messages,
      {
        id: 'result',
        sessionId: 'one',
        runId: 'run',
        role: 'tool',
        seq: 2,
        createdAt: 2,
        content: [
          {
            type: 'tool_result',
            callId: 'question-call',
            name: 'request_user_input',
            isError: false,
            text: JSON.stringify({ answers: decisionAnswers }),
            details: { answers: decisionAnswers },
          },
        ],
      },
    ],
  }
}
