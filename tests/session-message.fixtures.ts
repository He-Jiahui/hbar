import type {
  HbarMessageActionLabels,
  HbarMessageBlocksLabels,
  HbarMessageToolPresentation,
} from '../packages/app-react/src/session-message'
import type {
  SessionMessage,
  SessionMessageBlock,
  SessionToolCall,
} from '../packages/app-react/src/session-message-model'

export function messageLabels(locale: 'zh-CN' | 'en-US'): {
  blocks: HbarMessageBlocksLabels
  actions: HbarMessageActionLabels
} {
  const zh = locale === 'zh-CN'
  return {
    blocks: {
      thinking: zh ? '正在思考' : 'Thinking',
      thought: zh ? '已思考' : 'Thought',
      activity: ({ thinkingCount, toolCounts, failedCount }) => {
        const tools = toolCounts.reduce((sum, tool) => sum + tool.count, 0)
        return zh
          ? `思考 ${thinkingCount} 次，执行 ${tools} 个工具${failedCount ? `，${failedCount} 个失败` : ''}`
          : `Thought ${thinkingCount} times, used ${tools} tools${failedCount ? `, ${failedCount} failed` : ''}`
      },
      tool: (name) => name,
      failed: zh ? '失败' : 'Failed',
      resultAvailable: zh ? '已有结果' : 'Result available',
      awaitingResult: zh ? '等待结果' : 'Awaiting result',
      input: zh ? '输入参数' : 'Input',
      output: zh ? '工具输出' : 'Output',
      toolResultCopy: {
        copy: zh ? '复制输出' : 'Copy output',
        copying: zh ? '正在复制' : 'Copying',
        copied: zh ? '已复制' : 'Copied',
        failed: zh ? '复制输出失败，请重试。' : 'Output copy failed. Try again.',
        unavailable: zh ? '剪贴板不可用，请选择输出文本后复制。' : 'Clipboard unavailable. Select the output to copy.',
        tooLarge: (limit) =>
          zh
            ? `超出 ${limit} 个 UTF-16 单元的单次复制上限，请分段复制。`
            : `Exceeds the ${limit} UTF-16 unit copy limit. Copy smaller sections.`,
        retry: zh ? '重试复制' : 'Retry copy',
      },
      emptyOutput: zh ? '结果没有文本输出' : 'The result has no text output',
      unavailableInput: zh ? '无法显示输入参数' : 'Input is unavailable',
      showFullContent: zh ? '显示完整内容' : 'Show full content',
      showLessContent: zh ? '收起长内容' : 'Show less',
      attachment: (kind, name) =>
        zh ? `${kind === 'image' ? '图片' : '文件'}：${name}` : `${kind === 'image' ? 'Image' : 'File'}: ${name}`,
    },
    actions: {
      copy: zh ? '复制回复' : 'Copy reply',
      copying: zh ? '正在复制' : 'Copying',
      copied: zh ? '已复制' : 'Copied',
      copyFailed: zh ? '复制失败。请再次尝试。' : 'Copy failed. Try again.',
      copyUnavailable: zh
        ? '当前环境不支持复制。请选择正文后复制。'
        : 'Clipboard is unavailable. Select the reply to copy it.',
      retryCopy: zh ? '重试复制' : 'Retry copy',
    },
  }
}

export const messageBlocks: readonly SessionMessageBlock[] = [
  { type: 'thinking', text: '先检查现有输入区域与模型选择器的关系。\n\n完成后核对键盘、窄屏与长文本边界。' },
  { type: 'tool_call', callId: 'read-call', name: 'Read', args: { file_path: '/workspace/src/composer.tsx' } },
  {
    type: 'tool_result',
    callId: 'read-call',
    name: 'Read',
    text: 'export const Composer = () => <form>...</form>',
    isError: false,
  },
  {
    type: 'tool_call',
    callId: 'shell-call',
    name: 'Bash',
    args: { command: 'bun test composer.test.tsx', description: '验证模型选择与输入交互' },
  },
  {
    type: 'tool_result',
    callId: 'shell-call',
    name: 'Bash',
    text: '3 tests passed\nKeyboard selection: pass\nNarrow viewport: pass',
    isError: false,
  },
  {
    type: 'text',
    text: '已经将模型入口放回输入区域旁。\n\n- 模型在弹出菜单中选择。\n- 思考等级独立调整。\n- 草稿与会话位置保持不变。',
  },
]

export function describeFixtureTool(call: SessionToolCall): HbarMessageToolPresentation {
  if (call.name === 'Read')
    return {
      icon: 'file',
      summary: String(call.args.file_path),
      input: { format: 'text', text: String(call.args.file_path) },
    }
  if (call.name === 'Bash')
    return {
      icon: 'terminal',
      summary: String(call.args.description),
      input: { format: 'command', text: String(call.args.command) },
    }
  return { icon: 'tool' }
}

export function sessionMessage(
  content: SessionMessage['content'],
  overrides: Partial<SessionMessage> = {},
): SessionMessage {
  return {
    id: 'reply',
    sessionId: 'session',
    runId: 'run',
    seq: 1,
    role: 'assistant',
    createdAt: 1,
    content,
    ...overrides,
  }
}
