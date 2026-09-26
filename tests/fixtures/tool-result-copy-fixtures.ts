// Test-only durable transcript data. Displayed tools are metadata, not executed.
export const authored = 'Authored assistant body only — 助手正文，不混入工具输出。'
export const thinking = 'Private thinking fixture — must never be copied with the authored reply'
export const longOutput = `START-OF-FULL-OUTPUT\n${'Loaded tool output — 已加载的结果 🐙\n'.repeat(650)}END-OF-FULL-OUTPUT`
export const calls = [
  {
    callId: 'shared-call-id',
    name: 'read_file',
    args: { path: 'fixture-A.md' },
    text: 'Result A first line\n第二行 🐙\nLast result A line',
    isError: false,
  },
  {
    callId: 'shared-call-id',
    name: 'different_tool',
    args: { target: 'same-id-different-tool' },
    text: 'Same callId, different tool — only this output',
    isError: false,
  },
  {
    callId: 'long-output-call',
    name: 'execute_command',
    args: { command: 'NOT_EXECUTED fixture command metadata' },
    text: longOutput,
    isError: false,
  },
  {
    callId: 'error-output-call',
    name: 'diagnostic_error',
    args: { target: 'synthetic historical failure' },
    text: 'Fixture error output\n原调用失败，仍可复制诊断文字。',
    isError: true,
  },
  { callId: 'empty-output-call', name: 'empty_fixture', args: { target: 'empty output' }, text: '', isError: false },
] as const
export const otherRunText = 'Same Session and callId/name, different Run — exact other output'
export const otherSessionText = 'Session B output only — 不应得到A的文字'
export const clipboardTexts = {
  a: 'Original A output\n原始内容 🐙',
  b: 'B result only\n不能被 A 的回执覆盖',
  replacement: 'Replaced A output\n原 ID 的新内容',
} as const
