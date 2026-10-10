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
  expect(capability.permissions).toContain('allow-native-notification-delivery-status')
  expect(capability.permissions).toContain('core:webview:allow-set-webview-zoom')

  const nativeSource = await readFile(join(desktopRoot, 'src/main.rs'), 'utf8')
  expect(nativeSource).toMatch(
    /WebviewWindowBuilder::new\(app,\s*"main",\s*WebviewUrl::External\(web_url\)\)/,
  )
  const handlers = nativeSource.match(/generate_handler!\[([\s\S]*?)\]/)?.[1]
  for (const name of [
    'resource_browser::resource_browser',
    'resource_browser::resource_open_system',
    'connection_info',
    'open_tool_window',
    'focus_tool_window',
    'close_tool_window',
    'pick_directory',
    'list_fonts',
    'set_window_effect',
    'read_ui_zoom',
    'write_ui_zoom',
    'native_notification_permission',
    'request_native_notification_permission',
    'send_native_notification',
    'native_notification_delivery_status',
  ])
    expect(handlers, `native invoke handler must register ${name}`).toContain(name)
  const buildSource = await readFile(join(desktopRoot, 'build.rs'), 'utf8')
  const commands = buildSource.match(/AppManifest::new\(\)\.commands\(&\[([\s\S]*?)\]\)/)?.[1]
  for (const name of [
    'connection_info',
    'resource_browser',
    'resource_open_system',
    'open_tool_window',
    'focus_tool_window',
    'close_tool_window',
    'pick_directory',
    'list_fonts',
    'set_window_effect',
    'read_ui_zoom',
    'write_ui_zoom',
    'native_notification_permission',
    'request_native_notification_permission',
    'send_native_notification',
    'native_notification_delivery_status',
  ])
    expect(commands, `generated native permissions must include ${name}`).toContain(`"${name}"`)
})

test('no desktop capability grants main-window privileges to a future child WebView', async () => {
  const files = (await readdir(capabilitiesRoot)).filter((file) => file.endsWith('.json'))
  expect(files).toContain('main.json')
  for (const file of files) {
    const capability = JSON.parse(await readFile(join(capabilitiesRoot, file), 'utf8')) as DesktopCapability
    expect(capability.windows ?? [], `${file} must target WebView labels instead of a whole window`).toEqual([])
  }
})
