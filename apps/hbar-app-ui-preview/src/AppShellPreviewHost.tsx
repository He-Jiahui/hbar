import { useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { LumenAppShellWorkflowsProvider as HbarAppUiAppShellProvider, type LumenAppShellContent } from '@lumen/app-ui/catalog'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import { appShellSidebarFixture } from '../../../tests/fixtures/hbar-app-ui-app-shell-sidebar-fixtures'
import { appShellRailFixture } from '../../../tests/fixtures/hbar-app-ui-app-shell-rail-fixtures'
import { appShellContractsFixture } from '../../../tests/fixtures/hbar-app-ui-app-shell-contracts-fixtures'
import { appShellEditorialFixture } from '../../../tests/fixtures/hbar-app-ui-app-shell-editorial-fixtures'
import { appShellInboxFixture } from '../../../tests/fixtures/hbar-app-ui-app-shell-inbox-fixtures'
import { appShellDocumentsFixture } from '../../../tests/fixtures/hbar-app-ui-app-shell-documents-fixtures'
import { appShellScopeFixture } from '../../../tests/fixtures/hbar-app-ui-app-shell-scope-fixtures'
import { appShellAdaptiveFixture } from '../../../tests/fixtures/hbar-app-ui-app-shell-adaptive-fixtures'
import { createAppShellAdaptivePreviewStore, projectAppShellAdaptivePreview } from './app-shell-adaptive-preview-model'
import { appShellChatFixture } from '../../../tests/fixtures/hbar-app-ui-app-shell-chat-fixtures'
import { createAppShellChatPreviewStore, projectAppShellChatPreview } from './app-shell-chat-preview-model'
import { createAppShellScopePreviewStore, projectAppShellScopePreview } from './app-shell-scope-preview-model'
import {
  createAppShellDocumentsPreviewStore,
  projectAppShellDocumentsPreview,
} from './app-shell-documents-preview-model'
import { createAppShellInboxPreviewStore, projectAppShellInboxPreview } from './app-shell-inbox-preview-model'
import {
  createAppShellEditorialPreviewStore,
  projectAppShellEditorialPreview,
} from './app-shell-editorial-preview-model'
import {
  createAppShellContractsPreviewStore,
  projectAppShellContractsPreview,
} from './app-shell-contracts-preview-model'
import { createAppShellRailPreviewStore, projectAppShellRailPreview } from './app-shell-rail-preview-model'
import { createAppShellSidebarPreviewStore, projectAppShellSidebarPreview } from './app-shell-sidebar-preview-model'
import { appShellPreviewRequestActions, createAppShellIntentPreviewStore } from './appShellIntentPreviewStore'
import { createAppShellPreviewCopy } from './appShellPreviewCopy'

interface AppShellPreviewHostProps extends HbarAppUiVariantProps {
  readonly content: LumenAppShellContent
  readonly children: ReactNode
}

export function AppShellPreviewHost(props: AppShellPreviewHostProps) {
  if (props.spec.category !== 'app-shell') return <>{props.children}</>
  const mode = new URLSearchParams(location.search).get('appShellFixture')
  return <AppShellPreviewOwner key={`${props.spec.id}:${mode ?? 'default'}`} {...props} mode={mode} />
}

function AppShellPreviewOwner({
  content,
  spec,
  onAction,
  children,
  mode,
}: AppShellPreviewHostProps & { readonly mode: string | null }) {
  const [store] = useState(createAppShellSidebarPreviewStore)
  const [railStore] = useState(createAppShellRailPreviewStore)
  const [contractsStore] = useState(createAppShellContractsPreviewStore)
  const [editorialStore] = useState(createAppShellEditorialPreviewStore)
  const [inboxStore] = useState(createAppShellInboxPreviewStore)
  const [documentsStore] = useState(createAppShellDocumentsPreviewStore)
  const [scopeStore] = useState(createAppShellScopePreviewStore)
  const [adaptiveStore] = useState(createAppShellAdaptivePreviewStore)
  const [chatStore] = useState(createAppShellChatPreviewStore)
  const ownerId = `app-shell-preview-${spec.id}`
  const copy = createAppShellPreviewCopy(mode === 'localized')
  const [intentStore] = useState(() =>
    createAppShellIntentPreviewStore({
      ownerId,
      actions:
        spec.variant === 6
          ? [
              'new',
              'trash',
              'share',
              'link',
              ...appShellDocumentsFixture(mode).menu.map((item) => item.id),
              ...appShellDocumentsFixture(mode).moreFormatting.map((item) => item.id),
            ]
          : appShellPreviewRequestActions(spec.variant),
    }),
  )
  const intent = useStore(intentStore, (state) => state.intent)
  function report(actionId: string, value?: string) {
    if (intentStore.getState().seed.actions.includes(actionId)) {
      // Inbox's no-target callbacks historically serialize their absent IDs as an empty string.
      const requestValue = spec.variant === 5 && value === '' ? undefined : value
      if (!intentStore.getState().request(ownerId, actionId, requestValue)) return
    }
    onAction?.({ variantId: spec.id, actionId, ...(value === undefined ? {} : { value }) })
  }
  const scope = projectAppShellScopePreview(useStore(scopeStore), appShellScopeFixture(mode, report), mode)
  const adaptive = projectAppShellAdaptivePreview(useStore(adaptiveStore), appShellAdaptiveFixture(mode, report))
  const chat = projectAppShellChatPreview(useStore(chatStore), appShellChatFixture(mode, report))
  const documents = projectAppShellDocumentsPreview(useStore(documentsStore), appShellDocumentsFixture(mode, report))
  const inbox = projectAppShellInboxPreview(useStore(inboxStore), appShellInboxFixture(mode, report))
  const editorial = projectAppShellEditorialPreview(useStore(editorialStore), appShellEditorialFixture(mode, report))
  const contracts = projectAppShellContractsPreview(useStore(contractsStore), appShellContractsFixture(mode, report))
  const rail = projectAppShellRailPreview(useStore(railStore), appShellRailFixture(mode, report))
  const fixture = appShellSidebarFixture(mode, report)
  const sidebar = projectAppShellSidebarPreview(useStore(store), fixture)
  return (
    <HbarAppUiAppShellProvider
      content={{
        ...content,
        presentation: { ownerId, notice: intent ? copy.requestNotice : undefined },
        sidebar,
        rail,
        contracts,
        editorial,
        inbox,
        documents,
        scope,
        adaptive,
        chat,
      }}
    >
      {children}
    </HbarAppUiAppShellProvider>
  )
}
