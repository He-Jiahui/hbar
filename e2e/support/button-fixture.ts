import type { Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { z } from 'zod'

const bundleSchema = z.object({ code: z.string().min(1), css: z.string().min(1) })
let bundle: z.infer<typeof bundleSchema> | undefined

export async function mountButtonFixture(
  page: Page,
  options: { theme: 'light' | 'dark'; size?: 's' | 'm' | 'l'; styles: string },
): Promise<void> {
  if (!bundle) {
    const executable =
      process.platform === 'win32'
        ? (process.env.PATH ?? '')
            .split(delimiter)
            .flatMap((directory) => [join(directory, 'bun.exe'), join(directory, 'node_modules/bun/bin/bun.exe')])
            .find(existsSync)
        : 'bun'
    if (!executable) throw new Error('Bun is unavailable for the browser fixture build')
    bundle = bundleSchema.parse(
      JSON.parse(
        execFileSync(executable, ['tests/fixtures/build-button-primitives.ts'], {
          cwd: process.cwd(),
          encoding: 'utf8',
          timeout: 30_000,
          maxBuffer: 8 * 1024 * 1024,
        }),
      ),
    )
  }
  const size = options.size ?? 'm'
  await page.setContent(`<!doctype html><html lang="en"
    data-hbar-app-ui-theme="${options.theme}" data-hbar-app-ui-control-size="${size}"
    data-hbar-app-ui-text-size="${size}" data-hbar-app-ui-corner-size="${size}"
    data-lumen-mode="${options.theme}" data-lumen-control-size="${size}"
    data-lumen-text-size="${size}" data-lumen-corner-size="${size}" data-lumen-shape="rounded">
    <head><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
    <body><div id="fixture-root"></div></body></html>`)
  await page.addStyleTag({ content: `${bundle.css}\n${options.styles}` })
  await page.addScriptTag({ content: bundle.code })
}
