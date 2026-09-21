import { expect, test } from 'bun:test'
import {
  LUMEN_MIGRATED_VARIANT_IDS,
  LUMEN_SOURCE_VARIANTS,
  LUMEN_VARIANT_REGISTRY,
  getLumenVariant,
} from '../packages/hbar-app-ui/src/catalog'
import {
  LUMEN_MIGRATED_VARIANT_IDS as canonicalMigratedIds,
  LUMEN_SOURCE_VARIANTS as canonicalSourceVariants,
  LUMEN_VARIANT_REGISTRY as canonicalRegistry,
} from '../hbar-ui/packages/lumen-app-ui/src/catalog'

test('hbar-app-ui compatibility catalog re-exports the canonical Lumen inventory', () => {
  expect(LUMEN_SOURCE_VARIANTS).toBe(canonicalSourceVariants)
  expect(LUMEN_VARIANT_REGISTRY).toBe(canonicalRegistry)
  expect(LUMEN_MIGRATED_VARIANT_IDS).toBe(canonicalMigratedIds)
  expect(getLumenVariant('hbar-app-ui-feedback-6')?.status).toBe('migrated')
  expect(getLumenVariant('hbar-app-ui-agent-activity-1')?.status).toBe('migrated')
  expect(getLumenVariant('hbar-app-ui-tool-calls-1')?.status).toBe('migrated')
  expect(getLumenVariant('hbar-app-ui-agent-approval-1')?.status).toBe('migrated')
  expect(getLumenVariant('hbar-app-ui-agent-plan-1')?.status).toBe('migrated')
  expect(getLumenVariant('hbar-app-ui-ai-usage-1')?.status).toBe('migrated')
  expect(getLumenVariant('hbar-app-ui-command-menu-1')?.status).toBe('migrated')
  expect(getLumenVariant('hbar-app-ui-prompt-input-1')?.status).toBe('migrated')
  expect(getLumenVariant('hbar-app-ui-navbar-1')?.status).toBe('migrated')
  expect(getLumenVariant('hbar-app-ui-card-1')?.status).toBe('migrated')
  expect(getLumenVariant('hbar-app-ui-data-table-1')?.status).toBe('migrated')
  expect(getLumenVariant('hbar-app-ui-dashboard-1')?.status).toBe('migrated')
  expect(getLumenVariant('hbar-app-ui-analytics-1')?.status).toBe('migrated')
  expect(getLumenVariant('hbar-app-ui-list-1')?.status).toBe('migrated')
  expect(getLumenVariant('hbar-app-ui-forms-1')?.status).toBe('migrated')
  expect(getLumenVariant('hbar-app-ui-settings-form-1')?.status).toBe('migrated')
  expect(getLumenVariant('hbar-app-ui-file-manager-1')?.status).toBe('migrated')
  expect(getLumenVariant('hbar-app-ui-filtering-1')?.status).toBe('migrated')
  expect(getLumenVariant('hbar-app-ui-monitoring-1')?.status).toBe('migrated')
  expect(getLumenVariant('hbar-app-ui-paywall-1')?.status).toBe('migrated')
  expect(getLumenVariant('hbar-app-ui-onboarding-1')?.status).toBe('migrated')
  expect(getLumenVariant('hbar-app-ui-authentication-1')?.status).toBe('migrated')
  expect(getLumenVariant('hbar-app-ui-comments-1')?.status).toBe('migrated')
  expect(getLumenVariant('hbar-app-ui-scheduling-1')?.status).toBe('migrated')
  expect(getLumenVariant('hbar-app-ui-integrations-1')?.status).toBe('migrated')
  expect(getLumenVariant('hbar-app-ui-editor-1')?.status).toBe('migrated')
  expect(getLumenVariant('hbar-app-ui-billing-1')?.status).toBe('migrated')
  expect(getLumenVariant('hbar-app-ui-chat-1')?.status).toBe('migrated')
})
