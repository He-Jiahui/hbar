import type { SessionToolRow } from '../../packages/app-react/src/session-message-model'
export const toolDetailsOutput = (length: number) =>
  '原输出 Original output 雪 🐙 with spaces /\\ and CRLF\r\n'.repeat(Math.ceil(length / 35)).slice(0, length)
export const toolDetailsCommand = `printf '%s\\n' '${'原始命令 Original command with complete characters 雪 /\\ '.repeat(6)}'`
export function toolDetailsRow(
  length: number,
  outcome: 'succeeded' | 'failed' | 'unknown' | 'pending' = 'succeeded',
): SessionToolRow {
  const row: SessionToolRow = {
    kind: 'tool',
    id: 'original-call',
    name: 'owned_command',
    call: { type: 'tool_call', callId: 'original-call', name: 'owned_command', args: { command: toolDetailsCommand } },
  }
  return outcome === 'pending'
    ? row
    : {
        ...row,
        result: {
          type: 'tool_result',
          callId: 'original-call',
          name: 'owned_command',
          text: toolDetailsOutput(length),
          isError: outcome !== 'succeeded',
          outcome:
            outcome === 'unknown'
              ? { kind: 'unknown', executionStarted: true }
              : { kind: outcome, executionStarted: true },
        },
      }
}
