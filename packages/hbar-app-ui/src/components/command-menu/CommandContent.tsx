import { createContext, useContext, type ReactNode } from 'react'
import type { HbarAppUiCommandListProps } from './CommandList'

export interface HbarAppUiCommandSurfaceContent extends HbarAppUiCommandListProps {
  readonly open: boolean
  readonly title: string
  readonly trigger: string
  readonly onOpen: () => void
  readonly onClose: () => void
}
export interface HbarAppUiCommandMenuContent {
  readonly grouped?: HbarAppUiCommandSurfaceContent | undefined
  readonly quick?: HbarAppUiCommandSurfaceContent | undefined
  readonly rooms?: HbarAppUiCommandSurfaceContent | undefined
}
const context = createContext<HbarAppUiCommandMenuContent>({})
export function HbarAppUiCommandMenuProvider({
  content,
  children,
}: {
  readonly content: HbarAppUiCommandMenuContent
  readonly children: ReactNode
}) {
  return <context.Provider value={content}>{children}</context.Provider>
}
export const useCommandMenuContent = () => useContext(context)
