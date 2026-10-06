import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const output = resolve(root, 'artifacts/desktop-elements/modals')
await mkdir(output, { recursive: true })
const build = await Bun.build({
  entrypoints: [resolve(root, 'tests/fixtures/lumen-modal-queries-browser.ts')],
  target: 'browser',
  format: 'iife',
  outdir: output,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
})
if (!build.success) throw new AggregateError(build.logs, 'Modal query browser fixture build failed')
const browser = await chromium.launch({ channel: process.env.HBAR_BROWSER_CHANNEL ?? 'chrome' })
try {
  const page = await browser.newPage()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setContent('<!doctype html><html><body></body></html>')
  await page.addScriptTag({ path: resolve(output, 'lumen-modal-queries-browser.js') })
  const checks = await page.evaluate(() => window.verifyLumenModalQueries())
  if (errors.length)
    throw new AggregateError(
      errors.map((value) => new Error(value)),
      'Modal query browser errors',
    )
  await Bun.write(resolve(output, 'verification.json'), JSON.stringify({ checks, errors }, null, 2))
  console.log(JSON.stringify({ checks: checks.length, errors: errors.length }))
} finally {
  await browser.close()
}
