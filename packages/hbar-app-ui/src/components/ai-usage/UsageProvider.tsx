import { createContext, useContext, type ReactNode } from 'react'
import type { HbarAppUiUsageContent } from './UsageContent'
const context = createContext<HbarAppUiUsageContent>({})
export function HbarAppUiUsageProvider({
  content,
  children,
}: {
  readonly content: HbarAppUiUsageContent
  readonly children: ReactNode
}) {
  return <context.Provider value={content}>{children}</context.Provider>
}
export function useHbarAppUiUsageContent() {
  return useContext(context)
}
