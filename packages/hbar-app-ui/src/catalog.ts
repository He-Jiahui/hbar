/** Explicit opt-in entry for the gallery's 300 stable variant registrations. */
export * from './index'
export {
  LUMEN_MIGRATED_VARIANT_IDS,
  LUMEN_SOURCE_VARIANTS,
  LUMEN_VARIANT_REGISTRY,
  getLumenVariant,
  getLumenVariantComponent,
  listLumenVariants,
} from '@lumen/app-ui/catalog'
export type {
  LumenMigratedVariantId,
  LumenSourceVariant,
  LumenVariantRegistryEntry,
  LumenVariantStatus,
} from '@lumen/app-ui/catalog'
export { HbarAppUiCommandMenuProvider } from './components/command-menu/CommandContent'
export type {
  HbarAppUiCommandMenuContent,
  HbarAppUiCommandSurfaceContent,
} from './components/command-menu/CommandContent'
export { HbarAppUiShellProvider } from './components/app-shell/WorkbenchShell'
export { HbarAppUiPromptProvider } from './components/prompt-input/Composer'
export { HbarAppUiConversationProvider } from './components/ai-chat/Conversation'
