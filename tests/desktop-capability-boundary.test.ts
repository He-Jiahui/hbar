import { expect, test } from 'bun:test'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const desktopRoot = fileURLToPath(new URL('../apps/desktop/src-tauri/', import.meta.url))
const capabilitiesRoot = join(desktopRoot, 'capabilities')

type DesktopCapability = {
  identifier: string
  windows?: string[]
  webviews?: string[]
  remote?: { urls?: string[] }
  permissions?: string[]
}

test('native main privileges belong to its WebView, not every child of its window', async () => {
  const capability = JSON.parse(await readFile(join(capabilitiesRoot, 'main.json'), 'utf8')) as DesktopCapability
  expect(capability.identifier).toBe('main')
  expect(capability.webviews).toEqual(['main'])
  expect(capability).not.toHaveProperty('windows')
  expect(capability.remote?.urls).toContain('http://127.0.0.1:*')
  expect(capability.permissions).toContain('core:default')
  expect(capability.permissions).toContain('core:window:allow-show')
  expect(capability.permissions).toContain('core:window:allow-is-visible')
  expect(capability.permissions).toContain('allow-connection-info')
  expect(capability.permissions).toContain('allow-read-ui-zoom')
  expect(capability.permissions).toContain('allow-write-ui-zoom')
  expect(capability.permissions).toContain('core:webview:allow-set-webview-zoom')

  const nativeSource = await readFile(join(desktopRoot, 'src/main.rs'), 'utf8')
  expect(nativeSource).toMatch(/WebviewWindowBuilder::new\(app,\s*"main",\s*WebviewUrl::External\(url\)\)/)
  expect(nativeSource).toMatch(
    /generate_handler!\[\s*connection_info,\s*read_ui_zoom,\s*write_ui_zoom,\s*native_notification_permission,\s*request_native_notification_permission,\s*send_native_notification\s*\]/,
  )
  const buildSource = await readFile(join(desktopRoot, 'build.rs'), 'utf8')
  expect(buildSource).toMatch(
    /AppManifest::new\(\)\.commands\(&\[\s*"connection_info",\s*"read_ui_zoom",\s*"write_ui_zoom",\s*"native_notification_permission",\s*"request_native_notification_permission",\s*"send_native_notification",?\s*\]\)/,
  )
})

test('no desktop capability grants main-window privileges to a future child WebView', async () => {
  const files = (await readdir(capabilitiesRoot)).filter((file) => file.endsWith('.json'))
  expect(files).toContain('main.json')
  for (const file of files) {
    const capability = JSON.parse(await readFile(join(capabilitiesRoot, file), 'utf8')) as DesktopCapability
    expect(capability.windows ?? [], `${file} must target WebView labels instead of a whole window`).toEqual([])
  }
})
