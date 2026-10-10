import type { Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { z } from 'zod'

const bundleSchema = z.object({ code: z.string().min(1), css: z.string().min(1) })
const bundles = new Map<string, z.infer<typeof bundleSchema>>()

export interface VisualFixtureOptions {
  theme: 'light' | 'dark'
  size?: 's' | 'm' | 'l'
  glow?: number
  motion?: boolean
  itemCount?: number
  locale?: string
  styles: string
}

export async function mountButtonFixture(page: Page, options: VisualFixtureOptions): Promise<void> {
  await mountVisualFixture(page, options, 'tests/fixtures/button-primitives-browser.tsx')
}

export async function mountControlFixture(page: Page, options: VisualFixtureOptions): Promise<void> {
  await mountVisualFixture(page, options, 'tests/fixtures/control-primitives-browser.tsx')
}

export async function mountSurfaceFixture(page: Page, options: VisualFixtureOptions): Promise<void> {
  await mountVisualFixture(page, options, 'tests/fixtures/surface-light-browser.tsx')
}

export async function mountComponentGalleryFixture(page: Page, options: VisualFixtureOptions): Promise<void> {
  await mountVisualFixture(page, options, 'tests/fixtures/component-gallery-browser.tsx')
}

export async function mountSessionDecisionHistoryFixture(page: Page, options: VisualFixtureOptions): Promise<void> {
  await mountVisualFixture(page, options, 'tests/fixtures/session-decision-history-browser.tsx')
}

async function mountVisualFixture(page: Page, options: VisualFixtureOptions, entry: string): Promise<void> {
  let bundle = bundles.get(entry)
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
        execFileSync(executable, ['tests/fixtures/build-button-primitives.ts', entry], {
          cwd: process.cwd(),
          encoding: 'utf8',
          timeout: 30_000,
          maxBuffer: 8 * 1024 * 1024,
        }),
      ),
    )
    bundles.set(entry, bundle)
  }
  const size = options.size ?? 'm'
  await page.setContent(`<!doctype html><html lang="en"
    data-hbar-app-ui-theme="${options.theme}" data-hbar-app-ui-control-size="${size}"
    data-hbar-app-ui-text-size="${size}" data-hbar-app-ui-corner-size="${size}"
    data-lumen-mode="${options.theme}" data-lumen-control-size="${size}"
    data-lumen-text-size="${size}" data-lumen-corner-size="${size}" data-lumen-shape="rounded"
    data-fixture-glow="${options.glow ?? 65}" data-fixture-motion="${options.motion === false ? 'off' : 'on'}"
    data-fixture-count="${options.itemCount ?? 0}" data-fixture-locale="${options.locale ?? 'en-US'}">
    <head><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
    <body><div id="fixture-root"></div></body></html>`)
  await page.addStyleTag({ content: `${bundle.css}\n${options.styles}` })
  await page.addScriptTag({ content: bundle.code })
}
