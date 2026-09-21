import {
  LumenPromptComposer,
  type LumenComposerAttachment,
  type LumenPromptComposerProps,
  type LumenPromptLabels,
} from '@lumen/app-ui'
import { createContext, useContext, type ReactNode } from 'react'

export type HbarAppUiComposerAttachment = LumenComposerAttachment
export type HbarAppUiPromptLabels = LumenPromptLabels
export type HbarAppUiPromptProps = LumenPromptComposerProps

const PromptContext = createContext<HbarAppUiPromptProps | undefined>(undefined)

export function HbarAppUiPromptProvider({
  content,
  children,
}: {
  readonly content: HbarAppUiPromptProps
  readonly children: ReactNode
}) {
  return <PromptContext.Provider value={content}>{children}</PromptContext.Provider>
}

export function useHbarAppUiPromptContent() {
  return useContext(PromptContext)
}

/** Compatibility name for the canonical Lumen prompt composer. */
export function HbarAppUiPromptComposer(props: HbarAppUiPromptProps) {
  return <LumenPromptComposer {...props} />
}
