import { createContext, useContext, type ReactNode } from 'react'
import type { HbarAppUiCommandListProps } from './CommandList'
import type {
  HbarAppUiSearchCommandsProps,
  HbarAppUiInviteCommandProps,
  HbarAppUiAssistantCommandsProps,
} from './CommandWorkflows'

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
  readonly search?: (CommandOverlay & HbarAppUiSearchCommandsProps) | undefined
  readonly invite?: (CommandOverlay & HbarAppUiInviteCommandProps) | undefined
  readonly assistant?: (CommandOverlay & HbarAppUiAssistantCommandsProps) | undefined
}

export interface CommandOverlay {
  readonly open: boolean
  readonly title: string
  readonly trigger: string
  readonly closeLabel: string
  readonly onOpen: () => void
  readonly onClose: () => void
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
