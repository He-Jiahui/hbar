import { createContext, useContext, type ReactNode } from 'react'

export interface MessageImagePreviewLabels {
  readonly loading: string
  readonly failed: string
  readonly retry: string
  readonly open: (name: string) => string
}
const Context = createContext<MessageImagePreviewLabels | null>(null)

export function MessageImagePreviewProvider({
  labels,
  children,
}: {
  readonly labels: MessageImagePreviewLabels
  readonly children: ReactNode
}) {
  return <Context.Provider value={labels}>{children}</Context.Provider>
}

export function useMessageImagePreviewLabels(): MessageImagePreviewLabels | null {
  return useContext(Context)
}
