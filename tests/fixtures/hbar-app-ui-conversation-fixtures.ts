import type { HbarAppUiPromptLabels } from '../../packages/hbar-app-ui/src/production'

export const CONVERSATION_FIXTURE = {
  title: 'Workspace assistant',
  user: 'You',
  assistant: 'hbar',
  userAvatar: 'U',
  assistantAvatar: 'h',
  copy: 'Copy message',
  messages: [
    { id: 'question', role: 'user' as const, text: 'Review the workspace changes.' },
    {
      id: 'answer',
      role: 'assistant' as const,
      text: 'The changes are ready for review. Open a file to inspect its source.',
    },
  ],
  labels: {
    input: 'Message',
    placeholder: 'Ask about this workspace',
    send: 'Send',
    submitTitle: 'Send',
    stop: 'Stop',
    uploading: 'Uploading',
    removeAttachment: (attachment) => `Remove ${attachment.name}`,
  } satisfies HbarAppUiPromptLabels,
}
