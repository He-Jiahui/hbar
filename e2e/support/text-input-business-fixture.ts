import type { Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, extname, isAbsolute, join, relative, resolve } from 'node:path'
import type { LumenControlsFixtureOptions } from './lumen-controls-fixture'

const origin = 'https://text-input-fixture.test'
let built = false

function bunExecutable() {
  if (process.platform !== 'win32') return 'bun'
  const executable = (process.env.PATH ?? '')
    .split(delimiter)
    .flatMap((directory) => [join(directory, 'bun.exe'), join(directory, 'node_modules/bun/bin/bun.exe')])
    .find(existsSync)
  if (!executable) throw new Error('Bun is unavailable for the business input fixture')
  return executable
}

/** Serve the real, split production components from an owned test artifact. */
export async function mountTextInputBusinessFixture(page: Page, options: LumenControlsFixtureOptions) {
  if (!built) {
    execFileSync(bunExecutable(), ['tests/fixtures/build-text-input-business.ts'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 64 * 1024,
    })
    built = true
  }
  const root = resolve('artifacts/text-input-padding/fixture')
  await page.route(`${origin}/**`, async (route) => {
    const path = resolve(root, decodeURIComponent(new URL(route.request().url()).pathname).slice(1))
    const owned = relative(root, path)
    if (!owned || owned.startsWith('..') || isAbsolute(owned) || resolve(root, owned) !== path)
      throw new Error('Fixture request escaped the owned asset directory')
    const contentType =
      extname(path) === '.js' ? 'text/javascript' : extname(path) === '.css' ? 'text/css' : 'application/octet-stream'
    await route.fulfill({ path, contentType, headers: { 'Access-Control-Allow-Origin': '*' } })
  })
  await page.setContent(`<!doctype html><html lang="${options.locale?.startsWith('zh') ? 'zh-CN' : 'en-US'}"
    data-lumen-mode="${options.theme ?? 'dark'}" data-lumen-control-size="${options.size ?? 'm'}"
    data-lumen-text-size="m" data-lumen-corner-size="m" data-lumen-shape="rounded">
    <head><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
    <body><div id="fixture-root"></div></body></html>`)
  await page.addStyleTag({ url: `${origin}/fixture.css` })
  if (options.styles) await page.addStyleTag({ content: options.styles })
  await page.addScriptTag({ url: `${origin}/fixture.js`, type: 'module' })
}
