import { expect, test } from 'bun:test'
import {
  LUMEN_MIGRATED_VARIANT_IDS,
  LUMEN_SOURCE_VARIANTS,
  LUMEN_VARIANT_REGISTRY,
  getLumenVariant,
  getLumenVariantComponent,
} from '../hbar-ui/packages/lumen-app-ui/src/catalog'

test('canonical Lumen catalog covers every stable source variant without overstating migration', () => {
  expect(LUMEN_SOURCE_VARIANTS).toHaveLength(300)
  expect(LUMEN_VARIANT_REGISTRY).toHaveLength(LUMEN_SOURCE_VARIANTS.length)
  expect(new Set(LUMEN_VARIANT_REGISTRY.map((entry) => entry.id)).size).toBe(300)

  const migrated = LUMEN_VARIANT_REGISTRY.filter((entry) => entry.status === 'migrated')
  expect(migrated.map((entry) => entry.id)).toEqual([...LUMEN_MIGRATED_VARIANT_IDS])
  expect(migrated.every((entry) => entry.component)).toBe(true)
  expect(LUMEN_MIGRATED_VARIANT_IDS).toHaveLength(185)
  expect(LUMEN_VARIANT_REGISTRY.filter((entry) => entry.status === 'source')).toHaveLength(115)
})

test('canonical Lumen catalog resolves stable IDs and leaves source-only IDs unimplemented', () => {
  const migrated = getLumenVariant('hbar-app-ui-empty-state-1')
  expect(migrated?.status).toBe('migrated')
  expect(getLumenVariantComponent('hbar-app-ui-empty-state-1')).toBeFunction()

  const agentActivity = getLumenVariant('hbar-app-ui-agent-activity-7')
  expect(agentActivity?.status).toBe('migrated')
  expect(getLumenVariantComponent('hbar-app-ui-agent-activity-7')).toBeFunction()

  const toolCalls = getLumenVariant('hbar-app-ui-tool-calls-6')
  expect(toolCalls?.status).toBe('migrated')
  expect(getLumenVariantComponent('hbar-app-ui-tool-calls-6')).toBeFunction()

  const approval = getLumenVariant('hbar-app-ui-agent-approval-6')
  expect(approval?.status).toBe('migrated')
  expect(getLumenVariantComponent('hbar-app-ui-agent-approval-6')).toBeFunction()

  const plan = getLumenVariant('hbar-app-ui-agent-plan-6')
  expect(plan?.status).toBe('migrated')
  expect(getLumenVariantComponent('hbar-app-ui-agent-plan-6')).toBeFunction()

  const usage = getLumenVariant('hbar-app-ui-ai-usage-8')
  expect(usage?.status).toBe('migrated')
  expect(getLumenVariantComponent('hbar-app-ui-ai-usage-8')).toBeFunction()

  const commandMenu = getLumenVariant('hbar-app-ui-command-menu-6')
  expect(commandMenu?.status).toBe('migrated')
  expect(getLumenVariantComponent('hbar-app-ui-command-menu-6')).toBeFunction()

  const promptInput = getLumenVariant('hbar-app-ui-prompt-input-7')
  expect(promptInput?.status).toBe('migrated')
  expect(getLumenVariantComponent('hbar-app-ui-prompt-input-7')).toBeFunction()

  const navbar = getLumenVariant('hbar-app-ui-navbar-14')
  expect(navbar?.status).toBe('migrated')
  expect(getLumenVariantComponent('hbar-app-ui-navbar-14')).toBeFunction()

  const card = getLumenVariant('hbar-app-ui-card-11')
  expect(card?.status).toBe('migrated')
  expect(getLumenVariantComponent('hbar-app-ui-card-11')).toBeFunction()

  const dataTable = getLumenVariant('hbar-app-ui-data-table-8')
  expect(dataTable?.status).toBe('migrated')
  expect(getLumenVariantComponent('hbar-app-ui-data-table-8')).toBeFunction()

  const settingsForm = getLumenVariant('hbar-app-ui-settings-form-6')
  expect(settingsForm?.status).toBe('migrated')
  expect(getLumenVariantComponent('hbar-app-ui-settings-form-6')).toBeFunction()

  const fileManager = getLumenVariant('hbar-app-ui-file-manager-4')
  expect(fileManager?.status).toBe('migrated')
  expect(getLumenVariantComponent('hbar-app-ui-file-manager-4')).toBeFunction()

  const filtering = getLumenVariant('hbar-app-ui-filtering-9')
  expect(filtering?.status).toBe('migrated')
  expect(getLumenVariantComponent('hbar-app-ui-filtering-9')).toBeFunction()

  const monitoring = getLumenVariant('hbar-app-ui-monitoring-10')
  expect(monitoring?.status).toBe('migrated')
  expect(getLumenVariantComponent('hbar-app-ui-monitoring-10')).toBeFunction()

  const paywall = getLumenVariant('hbar-app-ui-paywall-7')
  expect(paywall?.status).toBe('migrated')
  expect(getLumenVariantComponent('hbar-app-ui-paywall-7')).toBeFunction()

  const onboarding = getLumenVariant('hbar-app-ui-onboarding-7')
  expect(onboarding?.status).toBe('migrated')
  expect(getLumenVariantComponent('hbar-app-ui-onboarding-7')).toBeFunction()

  const authentication = getLumenVariant('hbar-app-ui-authentication-14')
  expect(authentication?.status).toBe('migrated')
  expect(getLumenVariantComponent('hbar-app-ui-authentication-14')).toBeFunction()

  const integrations = getLumenVariant('hbar-app-ui-integrations-6')
  expect(integrations?.status).toBe('migrated')
  expect(getLumenVariantComponent('hbar-app-ui-integrations-6')).toBeFunction()

  const comments = getLumenVariant('hbar-app-ui-comments-6')
  expect(comments?.status).toBe('migrated')
  expect(getLumenVariantComponent('hbar-app-ui-comments-6')).toBeFunction()

  const scheduling = getLumenVariant('hbar-app-ui-scheduling-7')
  expect(scheduling?.status).toBe('migrated')
  expect(getLumenVariantComponent('hbar-app-ui-scheduling-7')).toBeFunction()

  const editor = getLumenVariant('hbar-app-ui-editor-5')
  expect(editor?.status).toBe('migrated')
  expect(getLumenVariantComponent('hbar-app-ui-editor-5')).toBeFunction()

  const billing = getLumenVariant('hbar-app-ui-billing-8')
  expect(billing?.status).toBe('migrated')
  expect(getLumenVariantComponent('hbar-app-ui-billing-8')).toBeFunction()

  const chat = getLumenVariant('hbar-app-ui-chat-6')
  expect(chat?.status).toBe('migrated')
  expect(getLumenVariantComponent('hbar-app-ui-chat-6')).toBeFunction()

  const sourceOnly = getLumenVariant('hbar-app-ui-analytics-1')
  expect(sourceOnly?.status).toBe('source')
  expect(getLumenVariantComponent('hbar-app-ui-analytics-1')).toBeUndefined()
  expect(getLumenVariant('missing-variant')).toBeUndefined()
})
