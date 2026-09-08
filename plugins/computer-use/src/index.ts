import { z } from 'zod'
import {
  HbarError,
  computerActionSchema,
  computerScreenSchema,
  computerUseConfigSchema,
} from '@hbar/contracts'
import type { ComputerScreen } from '@hbar/contracts'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { ComputerUseService, HbarAPI, ToolDefinition } from '@hbar/plugin-sdk'

const MAX_TEXT = 16_000
const MAX_SCREENSHOT = 2_000_000

export const computerConfigSchema = computerUseConfigSchema.extend({
  timeoutMs: z.number().int().positive().max(120_000).default(30_000),
  maxScreenshotBytes: z.number().int().positive().max(MAX_SCREENSHOT).default(MAX_SCREENSHOT),
})
export type ComputerConfig = z.infer<typeof computerConfigSchema>

export interface ComputerBackend {
  available(): boolean | Promise<boolean>
  isLocked?(signal: AbortSignal): boolean | Promise<boolean>
  screenshot(appId: string | undefined, signal: AbortSignal): Promise<ComputerScreen>
  click(x: number, y: number, appId: string | undefined, signal: AbortSignal): Promise<void>
  doubleClick(x: number, y: number, appId: string | undefined, signal: AbortSignal): Promise<void>
  type(text: string, appId: string | undefined, signal: AbortSignal): Promise<void>
  key(key: string, appId: string | undefined, signal: AbortSignal): Promise<void>
  scroll(deltaX: number, deltaY: number, appId: string | undefined, signal: AbortSignal): Promise<void>
  move(x: number, y: number, appId: string | undefined, signal: AbortSignal): Promise<void>
  launch(appId: string, signal: AbortSignal): Promise<void>
  dispose?(): Promise<void> | void
}

function unavailable(): never {
  throw new HbarError('COMPUTER_BACKEND_UNAVAILABLE', 'Computer use requires a supported desktop backend')
}

function encoded(script: string) {
  return Buffer.from(script, 'utf16le').toString('base64')
}

async function runPowerShell(script: string, values: Record<string, string>, signal: AbortSignal, timeoutMs: number, maxOutputBytes: number) {
  if (process.platform !== 'win32') throw new HbarError('COMPUTER_UNSUPPORTED_PLATFORM', 'Native computer use is only available on Windows')
  signal.throwIfAborted()
  const env: Record<string, string> = {}
  for (const key of ['PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP']) {
    const value = process.env[key]
    if (value !== undefined) env[key] = value
  }
  for (const [key, value] of Object.entries(values)) env[`HBAR_${key}`] = value
  const child = Bun.spawn(['powershell.exe', '-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded(script)], {
    env,
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
    windowsHide: true,
  })
  let terminating: Promise<void> | undefined
  let timedOut = false
  const terminate = () =>
    (terminating ??= (async () => {
      const killer = Bun.spawn(['taskkill.exe', '/PID', String(child.pid), '/T', '/F'], {
        stdout: 'ignore',
        stderr: 'ignore',
        windowsHide: true,
      })
      await killer.exited
    })())
  const onAbort = () => void terminate().catch(() => {})
  signal.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => {
    timedOut = true
    onAbort()
  }, timeoutMs)
  try {
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    if (terminating) await terminating
    signal.throwIfAborted()
    if (timedOut) throw new HbarError('COMPUTER_TIMEOUT', `Computer command exceeded ${timeoutMs}ms`)
    if (code !== 0) throw new HbarError('COMPUTER_ACTION_FAILED', stderr.trim() || stdout.trim() || `PowerShell exited with ${code}`)
    if (stdout.length > maxOutputBytes) throw new HbarError('COMPUTER_OUTPUT_LIMIT', 'Computer backend output exceeded its limit')
    return stdout.trim()
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', onAbort)
  }
}

const mouseScript = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class HbarMouse {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
}
'@
$x = [int]$env:HBAR_X
$y = [int]$env:HBAR_Y
[HbarMouse]::SetCursorPos($x, $y) | Out-Null
if ($env:HBAR_ACTION -eq 'click') { [HbarMouse]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero); [HbarMouse]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero) }
if ($env:HBAR_ACTION -eq 'double_click') { 1..2 | ForEach-Object { [HbarMouse]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero); [HbarMouse]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 40 } }
if ($env:HBAR_ACTION -eq 'scroll') { [HbarMouse]::mouse_event(0x0800, 0, 0, [int]$env:HBAR_DY, [UIntPtr]::Zero) }
`

const screenshotScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$stream = New-Object System.IO.MemoryStream
$bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
$payload = @{ width = $bounds.Width; height = $bounds.Height; data = [Convert]::ToBase64String($stream.ToArray()) }
$payload | ConvertTo-Json -Compress
$graphics.Dispose(); $bitmap.Dispose(); $stream.Dispose()
`

const textScript = `
Add-Type -AssemblyName System.Windows.Forms
function Escape-SendKeys([string]$value) {
  $value.Replace('\\','{\\}').Replace('+','{+}').Replace('^','{^}').Replace('%','{%}').Replace('~','{~}').Replace('(','{(}').Replace(')','{)}').Replace('{','{{}').Replace('}','{}}').Replace('[','{[}').Replace(']','{]}')
}
[System.Windows.Forms.SendKeys]::SendWait((Escape-SendKeys $env:HBAR_VALUE))
`

const keyScript = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait($env:HBAR_VALUE)
`

const lockScript = `
$locked = Get-Process -Name LogonUI -ErrorAction SilentlyContinue
if ($locked) { 'true' } else { 'false' }
`

const keyNames: Record<string, string> = {
  Enter: '{ENTER}',
  Return: '{ENTER}',
  Tab: '{TAB}',
  Escape: '{ESC}',
  Esc: '{ESC}',
  Backspace: '{BACKSPACE}',
  Delete: '{DELETE}',
  Insert: '{INSERT}',
  Home: '{HOME}',
  End: '{END}',
  PageUp: '{PGUP}',
  PageDown: '{PGDN}',
  ArrowUp: '{UP}',
  ArrowDown: '{DOWN}',
  ArrowLeft: '{LEFT}',
  ArrowRight: '{RIGHT}',
  F1: '{F1}',
  F2: '{F2}',
  F3: '{F3}',
  F4: '{F4}',
  F5: '{F5}',
  F6: '{F6}',
  F7: '{F7}',
  F8: '{F8}',
  F9: '{F9}',
  F10: '{F10}',
  F11: '{F11}',
  F12: '{F12}',
}

function sendKeysValue(value: string) {
  const parts = value.split('+').map((part) => part.trim()).filter(Boolean)
  if (!parts.length || parts.length > 5) throw new HbarError('COMPUTER_INVALID_KEY', 'Invalid key or key chord')
  const base = keyNames[parts.at(-1)!] ?? parts.at(-1)!
  if (!/^(?:\{[A-Z0-9]+\}|[ -~])$/.test(base)) throw new HbarError('COMPUTER_INVALID_KEY', 'Invalid key or key chord')
  const modifiers = parts.slice(0, -1).map((part) => {
    if (part === 'Ctrl' || part === 'Control') return '^'
    if (part === 'Alt' || part === 'Option') return '%'
    if (part === 'Shift') return '+'
    return null
  })
  if (modifiers.some((value) => value === null)) throw new HbarError('COMPUTER_INVALID_KEY', 'Invalid key modifier')
  return `${modifiers.join('')}${base}`
}

export class WindowsComputerBackend implements ComputerBackend {
  constructor(private readonly timeoutMs = 30_000, private readonly maxScreenshotBytes = MAX_SCREENSHOT) {}
  available() { return process.platform === 'win32' }
  async isLocked(signal: AbortSignal) {
    const raw = await runPowerShell(lockScript, {}, signal, this.timeoutMs, 32)
    return raw.trim().toLocaleLowerCase() === 'true'
  }
  async screenshot(_appId: string | undefined, signal: AbortSignal) {
    const raw = await runPowerShell(screenshotScript, {}, signal, this.timeoutMs, this.maxScreenshotBytes)
    let value: unknown
    try { value = JSON.parse(raw) } catch { throw new HbarError('COMPUTER_ACTION_FAILED', 'Windows screenshot backend returned invalid data') }
    if (!value || typeof value !== 'object') throw new HbarError('COMPUTER_ACTION_FAILED', 'Windows screenshot backend returned invalid data')
    const payload = value as { width?: unknown; height?: unknown; data?: unknown }
    return computerScreenSchema.parse({ width: payload.width, height: payload.height, mime: 'image/png', data: payload.data })
  }
  async click(x: number, y: number, _appId: string | undefined, signal: AbortSignal) {
    await runPowerShell(mouseScript, { X: String(x), Y: String(y), ACTION: 'click' }, signal, this.timeoutMs, 2_000)
  }
  async doubleClick(x: number, y: number, _appId: string | undefined, signal: AbortSignal) {
    await runPowerShell(mouseScript, { X: String(x), Y: String(y), ACTION: 'double_click' }, signal, this.timeoutMs, 2_000)
  }
  async type(text: string, _appId: string | undefined, signal: AbortSignal) {
    await runPowerShell(textScript, { VALUE: text }, signal, this.timeoutMs, 2_000)
  }
  async key(key: string, _appId: string | undefined, signal: AbortSignal) {
    await runPowerShell(keyScript, { VALUE: sendKeysValue(key) }, signal, this.timeoutMs, 2_000)
  }
  async scroll(deltaX: number, deltaY: number, _appId: string | undefined, signal: AbortSignal) {
    if (deltaX !== 0) throw new HbarError('COMPUTER_UNSUPPORTED_ACTION', 'Native Windows backend only supports vertical scrolling')
    await runPowerShell(mouseScript, { X: '0', Y: '0', DY: String(deltaY), ACTION: 'scroll' }, signal, this.timeoutMs, 2_000)
  }
  async move(x: number, y: number, _appId: string | undefined, signal: AbortSignal) {
    await runPowerShell(mouseScript, { X: String(x), Y: String(y), ACTION: 'move' }, signal, this.timeoutMs, 2_000)
  }
  async launch(appId: string, signal: AbortSignal) {
    if (!/^[A-Za-z0-9._-]{1,1000}$/.test(appId)) throw new HbarError('COMPUTER_INVALID_APP', 'Only an approved application identifier may be launched')
    await runPowerShell('if ($env:HBAR_APP -match \'\\.exe$\') { Start-Process -FilePath $env:HBAR_APP } else { Start-Process -FilePath ("shell:AppsFolder\\" + $env:HBAR_APP) }', { APP: appId }, signal, this.timeoutMs, 2_000)
  }
}

export class UnavailableComputerBackend implements ComputerBackend {
  available() { return false }
  screenshot() { return unavailable() }
  click() { return unavailable() }
  doubleClick() { return unavailable() }
  type() { return unavailable() }
  key() { return unavailable() }
  scroll() { return unavailable() }
  move() { return unavailable() }
  launch() { return unavailable() }
}

let backendFactory: (() => ComputerBackend) | undefined
export function setComputerBackendFactory(factory: () => ComputerBackend) {
  backendFactory = factory
}

function requirementFor(config: ComputerConfig, appId: string | undefined) {
  if (!appId) return config.default_app_access
  if (process.platform === 'win32') {
    const mapped = config.windows.aumids[appId]
    if (mapped) return mapped
    const exe = config.windows.exes.find((entry) => entry.binary_name === appId || `${entry.publisher_name}/${entry.product_name}` === appId)
    if (exe) return exe.access
  }
  if (process.platform === 'darwin') return config.macos.bundle_ids[appId] ?? config.default_app_access
  return config.default_app_access
}

export class ComputerRuntime implements ComputerUseService {
  private activeApps = new Map<string, string | null>()
  private readonly backend: ComputerBackend
  constructor(
    private readonly api: HbarAPI,
    private readonly config: ComputerConfig,
    backend?: ComputerBackend,
  ) {
    this.backend = backend ?? backendFactory?.() ?? (process.platform === 'win32' ? new WindowsComputerBackend(config.timeoutMs, config.maxScreenshotBytes) : new UnavailableComputerBackend())
  }

  private async bounded<T>(parent: AbortSignal, operation: (signal: AbortSignal) => Promise<T>) {
    const controller = new AbortController()
    let rejectTimeout: ((reason?: unknown) => void) | undefined
    let rejectAbort: ((reason?: unknown) => void) | undefined
    const timeoutError = new HbarError('COMPUTER_TIMEOUT', 'Computer operation timed out')
    const timeout = new Promise<never>((_, reject) => {
      rejectTimeout = reject
    })
    const aborted = new Promise<never>((_, reject) => {
      rejectAbort = reject
    })
    const onAbort = () => {
      const reason: unknown = parent.reason ?? new HbarError('COMPUTER_ABORTED', 'Computer operation was cancelled')
      controller.abort(reason)
      rejectAbort?.(reason)
    }
    const timer = setTimeout(() => {
      controller.abort(timeoutError)
      rejectTimeout?.(timeoutError)
    }, this.config.timeoutMs)
    parent.addEventListener('abort', onAbort, { once: true })
    if (parent.aborted) onAbort()
    try {
      return await Promise.race([Promise.resolve().then(() => operation(controller.signal)), timeout, aborted])
    } finally {
      clearTimeout(timer)
      parent.removeEventListener('abort', onAbort)
    }
  }

  private async session(sessionId: string) { await this.api.sessions.get(sessionId) }
  private async assertUnlocked(signal: AbortSignal) {
    if (this.config.allow_locked_computer_use || !this.backend.isLocked) return
    if (await this.bounded(signal, (boundedSignal) => Promise.resolve(this.backend.isLocked!(boundedSignal))))
      throw new HbarError('COMPUTER_LOCKED', 'Computer use is disabled while the workstation is locked')
  }
  authorize(appId?: string) {
    const requirement = requirementFor(this.config, appId)
    if (requirement === 'deny') throw new HbarError('COMPUTER_APP_DENIED', `Computer use is denied for ${appId ?? 'the active desktop'}`)
    if (appId && !/^[A-Za-z0-9._:/-]{1,1000}$/.test(appId)) throw new HbarError('COMPUTER_INVALID_APP', 'Invalid application identifier')
    return requirement
  }
  private mark(sessionId: string, appId: string | undefined) {
    this.activeApps.set(sessionId, appId ?? null)
    this.api.notify({ method: 'computer.changed', params: { sessionId } })
    this.api.changed('computer')
  }
  async status(sessionId: string, signal = new AbortController().signal) {
    await this.session(sessionId)
    return {
      available: await this.bounded(signal, () => Promise.resolve(this.backend.available())),
      platform: process.platform,
      appId: this.activeApps.get(sessionId) ?? null,
    }
  }
  async screenshot(sessionId: string, appId?: string, signal = new AbortController().signal) {
    await this.session(sessionId); this.authorize(appId); await this.assertUnlocked(signal)
    const screen = computerScreenSchema.parse(await this.bounded(signal, (boundedSignal) => this.backend.screenshot(appId, boundedSignal)))
    if (Buffer.byteLength(screen.data, 'base64') > this.config.maxScreenshotBytes) throw new HbarError('COMPUTER_SCREENSHOT_LIMIT', 'Computer screenshot exceeds the configured limit')
    this.mark(sessionId, appId)
    return screen
  }
  private async action(
    sessionId: string,
    action: string,
    appId: string | undefined,
    signal: AbortSignal,
    operation: (boundedSignal: AbortSignal) => Promise<void>,
  ) {
    await this.session(sessionId); this.authorize(appId); await this.assertUnlocked(signal); await this.bounded(signal, operation); this.mark(sessionId, appId)
    return computerActionSchema.parse({ action, accepted: true })
  }
  async click(sessionId: string, x: number, y: number, appId?: string, signal = new AbortController().signal) { return this.action(sessionId, 'click', appId, signal, (boundedSignal) => this.backend.click(x, y, appId, boundedSignal)) }
  async doubleClick(sessionId: string, x: number, y: number, appId?: string, signal = new AbortController().signal) { return this.action(sessionId, 'double_click', appId, signal, (boundedSignal) => this.backend.doubleClick(x, y, appId, boundedSignal)) }
  async type(sessionId: string, text: string, appId?: string, signal = new AbortController().signal) { if (text.length > MAX_TEXT) throw new HbarError('COMPUTER_TEXT_LIMIT', 'Computer text input is too long'); return this.action(sessionId, 'type', appId, signal, (boundedSignal) => this.backend.type(text, appId, boundedSignal)) }
  async key(sessionId: string, key: string, appId?: string, signal = new AbortController().signal) { return this.action(sessionId, 'key', appId, signal, (boundedSignal) => this.backend.key(key, appId, boundedSignal)) }
  async scroll(sessionId: string, deltaX: number, deltaY: number, appId?: string, signal = new AbortController().signal) { return this.action(sessionId, 'scroll', appId, signal, (boundedSignal) => this.backend.scroll(deltaX, deltaY, appId, boundedSignal)) }
  async move(sessionId: string, x: number, y: number, appId?: string, signal = new AbortController().signal) { return this.action(sessionId, 'move', appId, signal, (boundedSignal) => this.backend.move(x, y, appId, boundedSignal)) }
  async wait(sessionId: string, milliseconds: number, appId?: string, signal = new AbortController().signal) {
    await this.session(sessionId); this.authorize(appId); await this.assertUnlocked(signal)
    await this.bounded(signal, (boundedSignal) => new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, milliseconds)
      const abort = () => {
        clearTimeout(timer)
        reject(boundedSignal.reason ?? new HbarError('COMPUTER_ABORTED', 'Computer operation was cancelled'))
      }
      boundedSignal.addEventListener('abort', abort, { once: true })
      if (boundedSignal.aborted) abort()
    }))
    this.mark(sessionId, appId)
    return computerActionSchema.parse({ action: 'wait', accepted: true })
  }
  async launch(sessionId: string, appId: string, signal = new AbortController().signal) { return this.action(sessionId, 'launch', appId, signal, (boundedSignal) => this.backend.launch(appId, boundedSignal)) }
  async dispose() {
    await this.backend.dispose?.()
    this.activeApps.clear()
  }
}

const appArgs = z.object({ app_id: z.string().max(1_000).optional() })
const pointArgs = appArgs.extend({ x: z.number().int().min(0).max(10_000), y: z.number().int().min(0).max(10_000) })
function result(value: unknown) { return { text: JSON.stringify(value), details: value } }

export function computerTools(runtime: ComputerRuntime): ToolDefinition[] {
  return [
    { name: 'computer_status', description: 'Report desktop backend availability and active application.', inputSchema: z.object({}), effect: 'read', execute: async (_args, c) => result(await runtime.status(c.session.id, c.signal)) },
    { name: 'computer_screenshot', description: 'Capture the desktop as an image. Requires computer-use approval.', inputSchema: appArgs, effect: 'process', execute: async (args, c) => { const p = appArgs.parse(args); const screen = await runtime.screenshot(c.session.id, p.app_id, c.signal); return { text: `Computer screenshot ${screen.width}x${screen.height}`, content: [{ type: 'image' as const, data: screen.data, mimeType: screen.mime }], details: screen } } },
    { name: 'computer_click', description: 'Click a screen coordinate. Requires computer-use approval.', inputSchema: pointArgs, effect: 'process', execute: async (args, c) => { const p = pointArgs.parse(args); return result(await runtime.click(c.session.id, p.x, p.y, p.app_id, c.signal)) } },
    { name: 'computer_double_click', description: 'Double-click a screen coordinate. Requires computer-use approval.', inputSchema: pointArgs, effect: 'process', execute: async (args, c) => { const p = pointArgs.parse(args); return result(await runtime.doubleClick(c.session.id, p.x, p.y, p.app_id, c.signal)) } },
    { name: 'computer_type', description: 'Type bounded text into the active desktop application. Requires approval.', inputSchema: appArgs.extend({ text: z.string().max(MAX_TEXT) }), effect: 'process', execute: async (args, c) => { const p = appArgs.extend({ text: z.string() }).parse(args); return result(await runtime.type(c.session.id, p.text, p.app_id, c.signal)) } },
    { name: 'computer_key', description: 'Send a key or key chord to the active desktop application. Requires approval.', inputSchema: appArgs.extend({ key: z.string().min(1).max(100) }), effect: 'process', execute: async (args, c) => { const p = appArgs.extend({ key: z.string() }).parse(args); return result(await runtime.key(c.session.id, p.key, p.app_id, c.signal)) } },
    { name: 'computer_scroll', description: 'Scroll the desktop by bounded deltas. Requires approval.', inputSchema: appArgs.extend({ delta_x: z.number().int().min(-10_000).max(10_000).default(0), delta_y: z.number().int().min(-10_000).max(10_000) }), effect: 'process', execute: async (args, c) => { const p = appArgs.extend({ delta_x: z.number().int(), delta_y: z.number().int() }).parse(args); return result(await runtime.scroll(c.session.id, p.delta_x, p.delta_y, p.app_id, c.signal)) } },
    { name: 'computer_move', description: 'Move the pointer to a screen coordinate. Requires approval.', inputSchema: pointArgs, effect: 'process', execute: async (args, c) => { const p = pointArgs.parse(args); return result(await runtime.move(c.session.id, p.x, p.y, p.app_id, c.signal)) } },
    { name: 'computer_wait', description: 'Wait for a bounded interval while preserving cancellation.', inputSchema: appArgs.extend({ milliseconds: z.number().int().min(0).max(60_000) }), effect: 'process', execute: async (args, c) => { const p = appArgs.extend({ milliseconds: z.number().int() }).parse(args); return result(await runtime.wait(c.session.id, p.milliseconds, p.app_id, c.signal)) } },
    { name: 'computer_launch', description: 'Launch an application identifier allowed by the configured app policy.', inputSchema: z.object({ app_id: z.string().min(1).max(1_000) }), effect: 'process', execute: async (args, c) => { const p = z.object({ app_id: z.string() }).parse(args); return result(await runtime.launch(c.session.id, p.app_id, c.signal)) } },
  ]
}

export const computerPlugin = definePlugin({
  manifest: {
    id: 'computer-use.codex',
    packageName: '@hbar/computer-use',
    name: 'Codex computer-use',
    version: '1.0.0',
    apiVersion: '^1.0.0',
    description: 'Policy-governed desktop screenshots and input actions',
    scope: 'host',
    required: false,
    provides: { computer: '1.0.0', 'computer-use': '1.0.0' },
    permissions: ['desktop', 'process'],
  },
  configSchema: computerConfigSchema,
  async apply(ctx, rawConfig) {
    const config = computerConfigSchema.parse(rawConfig)
    const runtime = new ComputerRuntime(ctx.hbar.api, config)
    provide<ComputerUseService>(ctx, 'computer', runtime)
    provide<ComputerUseService>(ctx, 'computer-use', runtime)
    ctx.effect(() => () => { void runtime.dispose() })
    for (const tool of computerTools(runtime)) ctx.hbar.api.tools.register(tool)
  },
})

export default computerPlugin
