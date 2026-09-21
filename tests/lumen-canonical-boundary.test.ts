import { readFile } from 'node:fs/promises'
import { expect, test } from 'bun:test'

const canonicalCompositions = [
  'hbar-ui/packages/lumen-app-ui/src/agent-activity.tsx',
  'hbar-ui/packages/lumen-app-ui/src/agent-approval.tsx',
  'hbar-ui/packages/lumen-app-ui/src/agent-plan.tsx',
  'hbar-ui/packages/lumen-app-ui/src/feedback-workflows.tsx',
  'hbar-ui/packages/lumen-app-ui/src/session-components.tsx',
  'hbar-ui/packages/lumen-app-ui/src/usage.tsx',
]

test('canonical Lumen compositions use the Lumen control boundary', async () => {
  const violations: string[] = []

  for (const file of canonicalCompositions) {
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
