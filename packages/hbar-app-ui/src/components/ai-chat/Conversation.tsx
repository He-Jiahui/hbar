import { createContext, useContext, type ReactNode } from 'react'
import { HbarAppUiMessage, type HbarAppUiMessageProps } from './Message'
import './Conversation.css'
import { uniqueItems } from '../../collection'

export interface HbarAppUiConversationProps {
  readonly title: string
  readonly messages: readonly HbarAppUiMessageProps[]
  readonly empty: ReactNode
  readonly composer: ReactNode
  readonly header?: ReactNode | undefined
  readonly afterMessages?: ReactNode | undefined
}
/** Small bounded embedded thread; long production history supplies virtualized message rows. */
export function HbarAppUiConversation(props: HbarAppUiConversationProps) {
  return (
    <section className="hbar-app-ui-conversation" aria-label={props.title}>
      {props.header === undefined ? (
        <header>
          <h2>{props.title}</h2>
        </header>
      ) : (
        props.header
      )}
      <div className="hbar-app-ui-conversation-messages">
        <div className="hbar-app-ui-conversation-content">
          {props.messages.length
            ? uniqueItems(props.messages).map((message) => <HbarAppUiMessage {...message} key={message.id} />)
            : props.empty}
          {props.afterMessages}
        </div>
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
