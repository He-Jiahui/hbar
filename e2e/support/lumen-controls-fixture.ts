import type { Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { z } from 'zod'

const bundleSchema = z.object({ code: z.string().min(1), css: z.string().min(1) })
let bundle: z.infer<typeof bundleSchema> | undefined

export interface LumenControlsFixtureOptions {
  readonly theme?: 'light' | 'dark'
  readonly size?: 's' | 'm' | 'l'
  readonly locale?: 'en-US' | 'zh-CN'
  readonly styles?: string
}

function bunExecutable(): string {
  if (process.platform !== 'win32') return 'bun'
  const path = process.env.PATH ?? ''
  const executable = path
    .split(delimiter)
    .flatMap((directory) => [join(directory, 'bun.exe'), join(directory, 'node_modules/bun/bin/bun.exe')])
    .find(existsSync)
  if (!executable) throw new Error('Bun is unavailable for the Lumen controls fixture build')
  return executable
}

async function readBundle(): Promise<z.infer<typeof bundleSchema>> {
  if (bundle) return bundle
  const value = execFileSync(bunExecutable(), ['tests/fixtures/build-lumen-controls.ts'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 12 * 1024 * 1024,
  })
  bundle = bundleSchema.parse(JSON.parse(value))
  return bundle
}

export async function mountLumenControlsFixture(page: Page, options: LumenControlsFixtureOptions = {}): Promise<void> {
  const artifact = await readBundle()
  const theme = options.theme ?? 'dark'
  const size = options.size ?? 'm'
  const locale = options.locale ?? 'en-US'
  await page.setContent(`<!doctype html><html lang="${locale.startsWith('zh') ? 'zh-CN' : 'en-US'}"
    data-lumen-mode="${theme}" data-lumen-control-size="${size}"
    data-lumen-text-size="${size}" data-lumen-corner-size="${size}" data-lumen-shape="rounded">
    <head><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
    <body><div id="fixture-root"></div></body></html>`)
  await page.addStyleTag({ content: `${artifact.css}\n${options.styles ?? ''}` })
  await page.addScriptTag({ content: artifact.code })
}
