import { useState, type ReactNode } from 'react'
import { HbarAppUiPromptComposer, type HbarAppUiPromptProps } from 'hbar-app-ui'
import { HbarAppUiConversationProvider, HbarAppUiPromptProvider, type HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import { CONVERSATION_FIXTURE } from '../../../tests/fixtures/hbar-app-ui-conversation-fixtures'

export function ConversationPreviewHost({
  children,
  spec,
  onAction,
}: HbarAppUiVariantProps & { readonly children: ReactNode }) {
  const [text, setText] = useState('')
  const [messages, setMessages] = useState(CONVERSATION_FIXTURE.messages)
  const content: HbarAppUiPromptProps = {
    value: text,
    labels: CONVERSATION_FIXTURE.labels,
    attachments: [],
    submitting: false,
    uploading: false,
    canSubmit: Boolean(text.trim()),
    canStop: false,
    onChange: setText,
    onRemoveAttachment() {},
    onStop() {},
    onSubmit() {
      const value = text.trim()
      if (!value) return
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text: value }])
      setText('')
      onAction?.({ variantId: spec.id, actionId: 'send', value })
    },
  }
  return (
    <HbarAppUiPromptProvider content={content}>
      <HbarAppUiConversationProvider
        content={{
          title: CONVERSATION_FIXTURE.title,
          messages: messages.map((message) => ({
            id: message.id,
            role: message.role,
            author: message.role === 'user' ? CONVERSATION_FIXTURE.user : CONVERSATION_FIXTURE.assistant,
            avatar: message.role === 'user' ? CONVERSATION_FIXTURE.userAvatar : CONVERSATION_FIXTURE.assistantAvatar,
            copyLabel: CONVERSATION_FIXTURE.copy,
            children: message.text,
          })),
          empty: null,
          composer: <HbarAppUiPromptComposer {...content} />,
        }}
      >
        {children}
      </HbarAppUiConversationProvider>
    </HbarAppUiPromptProvider>
  )
}
