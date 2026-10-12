import { createContext, createElement, useCallback, useContext, type ReactNode } from 'react'

export interface MessageScope<TMessages extends object> {
  readonly Provider: (props: MessageScopeProviderProps<TMessages>) => ReactNode
  readonly useMessages: () => MessageScopeReader<TMessages>
}

export interface MessageScopeProviderProps<TMessages extends object> {
  readonly messages: TMessages
  readonly children: ReactNode
}

export interface MessageScopeReader<TMessages extends object> {
  readonly t: <TKey extends keyof TMessages>(key: TKey) => TMessages[TKey]
}

/** Creates an isolated, host-fed message scope for one independently owned UI feature. */
export function createMessageScope<TMessages extends object>(): MessageScope<TMessages> {
  const Context = createContext<TMessages | undefined>(undefined)
  Context.displayName = 'HbarMessageScope'

  function Provider({ messages, children }: MessageScopeProviderProps<TMessages>): ReactNode {
    return createElement(Context.Provider, { value: messages }, children)
  }

  function useMessages(): MessageScopeReader<TMessages> {
    const messages = useContext(Context)
    if (messages === undefined) {
      throw new Error('A host message scope provider is required for this feature.')
    }

    const t = useCallback(
      function getMessage<TKey extends keyof TMessages>(key: TKey): TMessages[TKey] {
        return messages[key]
      },
      [messages],
    )
    return { t }
  }

  return { Provider, useMessages }
}
