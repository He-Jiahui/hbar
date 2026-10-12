import { readdir, readFile } from 'node:fs/promises'
import { expect, test } from 'bun:test'

async function collectFiles(root: string, suffix: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = `${root}/${entry.name}`
      return entry.isDirectory() ? collectFiles(path, suffix) : path.endsWith(suffix) ? [path] : []
    }),
  )
  return files.flat()
}

const canonicalCompositions = [
  'packages/lumen-app-ui/src/agent-activity.tsx',
  'packages/lumen-app-ui/src/agent-approval.tsx',
  'packages/lumen-app-ui/src/agent-plan.tsx',
  'packages/lumen-app-ui/src/ai-chat.tsx',
  'packages/lumen-app-ui/src/analytics.tsx',
  'packages/lumen-app-ui/src/app-dialog.tsx',
  'packages/lumen-app-ui/src/app-shell-workflows.tsx',
  'packages/lumen-app-ui/src/app-sidebar-workflows.tsx',
  'packages/lumen-app-ui/src/authentication.tsx',
  'packages/lumen-app-ui/src/billing.tsx',
  'packages/lumen-app-ui/src/card.tsx',
  'packages/lumen-app-ui/src/chat.tsx',
  'packages/lumen-app-ui/src/command-list.tsx',
  'packages/lumen-app-ui/src/command-menu.tsx',
  'packages/lumen-app-ui/src/comments.tsx',
  'packages/lumen-app-ui/src/data-table.tsx',
  'packages/lumen-app-ui/src/dashboard.tsx',
  'packages/lumen-app-ui/src/editor.tsx',
  'packages/lumen-app-ui/src/feedback-workflows.tsx',
  'packages/lumen-app-ui/src/file-manager.tsx',
  'packages/lumen-app-ui/src/filtering.tsx',
  'packages/lumen-app-ui/src/form-workflows.tsx',
  'packages/lumen-app-ui/src/integrations.tsx',
  'packages/lumen-app-ui/src/kanban.tsx',
  'packages/lumen-app-ui/src/list.tsx',
  'packages/lumen-app-ui/src/mobile.tsx',
  'packages/lumen-app-ui/src/monitoring.tsx',
  'packages/lumen-app-ui/src/navbar.tsx',
  'packages/lumen-app-ui/src/notifications.tsx',
  'packages/lumen-app-ui/src/onboarding.tsx',
  'packages/lumen-app-ui/src/paywall.tsx',
  'packages/lumen-app-ui/src/prompt-input.tsx',
  'packages/lumen-app-ui/src/scheduling.tsx',
  'packages/lumen-app-ui/src/session-components.tsx',
  'packages/lumen-app-ui/src/settings-form.tsx',
  'packages/lumen-app-ui/src/support.tsx',
  'packages/lumen-app-ui/src/tool-calls.tsx',
  'packages/lumen-app-ui/src/usage.tsx',
  'packages/lumen-app-ui/src/usage-overview.tsx',
  'packages/lumen-app-ui/src/usage-model-table.tsx',
  'packages/lumen-app-ui/src/usage-rate-panel.tsx',
  'packages/lumen-app-ui/src/usage-member-list.tsx',
  'packages/lumen-app-ui/src/usage-budget-panel.tsx',
  'packages/lumen-app-ui/src/usage-overage-panel.tsx',
  'packages/lumen-app-ui/src/usage-request-table.tsx',
  'packages/lumen-app-ui/src/usage-compact-widget.tsx',
  'packages/lumen-app-ui/src/wizard.tsx',
]

test('canonical Lumen compositions use the Lumen control boundary', async () => {
  const violations: string[] = []
  const authenticationFiles = (await readdir('packages/lumen-app-ui/src/authentication'))
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => `packages/lumen-app-ui/src/authentication/${file}`)
  const billingFiles = (await readdir('packages/lumen-app-ui/src/billing'))
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => `packages/lumen-app-ui/src/billing/${file}`)
  const integrationFiles = (await readdir('packages/lumen-app-ui/src/integrations'))
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => `packages/lumen-app-ui/src/integrations/${file}`)
  const navbarFiles = (await readdir('packages/lumen-app-ui/src/navbar'))
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => `packages/lumen-app-ui/src/navbar/${file}`)

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

test('hbar compatibility code cannot recreate Lumen control visuals', async () => {
  const violations: string[] = []
  const componentFiles = await collectFiles('packages/hbar-app-ui/src', '.tsx')

  for (const file of componentFiles) {
    const source = await readFile(file, 'utf8')
    if (/<\s*(?:button|select|textarea)(?:\s|>)/.test(source)) {
      violations.push(`${file}:native-visible-control`)
    }
    for (const match of source.matchAll(/<input\b[^>]*>/g)) {
      if (!/type=["']file["']/.test(match[0])) violations.push(`${file}:native-input`)
    }
    if (/role=["']switch["']/.test(source)) violations.push(`${file}:private-switch`)
  }

  const cssFiles = ['packages/hbar-app-ui/src/theme.css', 'packages/hbar-app-ui/src/components/forms/FormControls.css']
  const sharedControl = /\.hbar-app-ui-(?:button|input|textarea|select|checkbox|toggle|combobox|field)(?![\w-])/
  const forbiddenVisual = /\b(?:border(?:-[\w-]+)?|background|outline|box-shadow)\s*:/

  for (const file of cssFiles) {
    const source = await readFile(file, 'utf8')
    for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = match[1] ?? ''
      const declarations = match[2] ?? ''
      const ownsSharedControl = sharedControl.test(selector)
      const ownsGenericControl = /\.hbar-app-ui-variant\s+(?:button|input|select|textarea)\b/.test(selector)
      if ((ownsSharedControl || ownsGenericControl) && forbiddenVisual.test(declarations)) {
        violations.push(`${file}:${selector.trim()}`)
      }
    }
  }

  expect(violations).toEqual([])
})

test('canonical family roots no longer depend on the legacy variant box', async () => {
  const violations: string[] = []
  for (const file of await collectFiles('packages/lumen-app-ui/src', '.tsx')) {
    const source = await readFile(file, 'utf8')
    if (source.includes("'hbar-app-ui-variant'")) violations.push(file)
  }
  const compatibilityFrame = await readFile('packages/hbar-app-ui/src/components/SurfaceFrame.tsx', 'utf8')
  if (compatibilityFrame.includes("'hbar-app-ui-variant'")) {
    violations.push('packages/hbar-app-ui/src/components/SurfaceFrame.tsx')
  }
  expect(compatibilityFrame).toContain('<LumenSurface')
  expect(compatibilityFrame).toContain('boundary="horizontal"')
  expect(violations).toEqual([])
})
