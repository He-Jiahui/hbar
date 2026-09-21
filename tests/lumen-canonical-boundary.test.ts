import { readdir, readFile } from 'node:fs/promises'
import { expect, test } from 'bun:test'

const canonicalCompositions = [
  'hbar-ui/packages/lumen-app-ui/src/agent-activity.tsx',
  'hbar-ui/packages/lumen-app-ui/src/agent-approval.tsx',
  'hbar-ui/packages/lumen-app-ui/src/agent-plan.tsx',
  'hbar-ui/packages/lumen-app-ui/src/analytics.tsx',
  'hbar-ui/packages/lumen-app-ui/src/app-dialog.tsx',
  'hbar-ui/packages/lumen-app-ui/src/authentication.tsx',
  'hbar-ui/packages/lumen-app-ui/src/billing.tsx',
  'hbar-ui/packages/lumen-app-ui/src/card.tsx',
  'hbar-ui/packages/lumen-app-ui/src/chat.tsx',
  'hbar-ui/packages/lumen-app-ui/src/command-list.tsx',
  'hbar-ui/packages/lumen-app-ui/src/command-menu.tsx',
  'hbar-ui/packages/lumen-app-ui/src/comments.tsx',
  'hbar-ui/packages/lumen-app-ui/src/data-table.tsx',
  'hbar-ui/packages/lumen-app-ui/src/dashboard.tsx',
  'hbar-ui/packages/lumen-app-ui/src/editor.tsx',
  'hbar-ui/packages/lumen-app-ui/src/feedback-workflows.tsx',
  'hbar-ui/packages/lumen-app-ui/src/file-manager.tsx',
  'hbar-ui/packages/lumen-app-ui/src/filtering.tsx',
  'hbar-ui/packages/lumen-app-ui/src/form-workflows.tsx',
  'hbar-ui/packages/lumen-app-ui/src/integrations.tsx',
  'hbar-ui/packages/lumen-app-ui/src/list.tsx',
  'hbar-ui/packages/lumen-app-ui/src/monitoring.tsx',
  'hbar-ui/packages/lumen-app-ui/src/navbar.tsx',
  'hbar-ui/packages/lumen-app-ui/src/notifications.tsx',
  'hbar-ui/packages/lumen-app-ui/src/onboarding.tsx',
  'hbar-ui/packages/lumen-app-ui/src/paywall.tsx',
  'hbar-ui/packages/lumen-app-ui/src/prompt-input.tsx',
  'hbar-ui/packages/lumen-app-ui/src/scheduling.tsx',
  'hbar-ui/packages/lumen-app-ui/src/session-components.tsx',
  'hbar-ui/packages/lumen-app-ui/src/settings-form.tsx',
  'hbar-ui/packages/lumen-app-ui/src/tool-calls.tsx',
  'hbar-ui/packages/lumen-app-ui/src/usage.tsx',
]

test('canonical Lumen compositions use the Lumen control boundary', async () => {
  const violations: string[] = []
  const authenticationFiles = (await readdir('hbar-ui/packages/lumen-app-ui/src/authentication'))
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => `hbar-ui/packages/lumen-app-ui/src/authentication/${file}`)
  const billingFiles = (await readdir('hbar-ui/packages/lumen-app-ui/src/billing'))
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => `hbar-ui/packages/lumen-app-ui/src/billing/${file}`)
  const integrationFiles = (await readdir('hbar-ui/packages/lumen-app-ui/src/integrations'))
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => `hbar-ui/packages/lumen-app-ui/src/integrations/${file}`)
  const navbarFiles = (await readdir('hbar-ui/packages/lumen-app-ui/src/navbar'))
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => `hbar-ui/packages/lumen-app-ui/src/navbar/${file}`)

  for (const file of [
    ...canonicalCompositions,
    ...authenticationFiles,
    ...billingFiles,
    ...integrationFiles,
    ...navbarFiles,
  ]) {
    const source = await readFile(file, 'utf8')
    if (/@mui\/material(?:\/|['"])/.test(source)) violations.push(`${file}:mui-import`)
    if (/<\s*(?:button|select|textarea|details|summary)(?:\s|>)/.test(source)) {
      violations.push(`${file}:native-visible-control`)
    }
    for (const match of source.matchAll(/<input\b[^>]*>/g)) {
      if (!/type=["']file["']/.test(match[0])) violations.push(`${file}:native-input`)
    }
  }

  expect(violations).toEqual([])
})
