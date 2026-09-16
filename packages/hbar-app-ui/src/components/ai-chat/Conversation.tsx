import { createContext, useContext, type ReactNode } from 'react'
import { HbarAppUiMessage, type HbarAppUiMessageProps } from './Message'
import './Conversation.css'
import { uniqueItems } from '../../collection'

export interface HbarAppUiConversationProps {
  readonly title: string
  readonly messages: readonly HbarAppUiMessageProps[]
  readonly empty: ReactNode
  readonly composer: ReactNode
}
/** Small bounded embedded thread; long production history supplies virtualized message rows. */
export function HbarAppUiConversation(props: HbarAppUiConversationProps) {
  return (
    <section className="hbar-app-ui-conversation" aria-label={props.title}>
      <header>
        <h2>{props.title}</h2>
      </header>
      <div className="hbar-app-ui-conversation-messages">
        {props.messages.length
          ? uniqueItems(props.messages).map((message) => <HbarAppUiMessage {...message} key={message.id} />)
          : props.empty}
      </div>
      {props.composer}
    </section>
  )
}
const ConversationContext = createContext<HbarAppUiConversationProps | undefined>(undefined)
export function HbarAppUiConversationProvider({
  content,
  children,
}: {
  readonly content: HbarAppUiConversationProps
  readonly children: ReactNode
}) {
  return <ConversationContext.Provider value={content}>{children}</ConversationContext.Provider>
}
export function useHbarAppUiConversationContent() {
  return useContext(ConversationContext)
}
