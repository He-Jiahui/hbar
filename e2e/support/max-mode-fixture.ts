import { spawn, type ChildProcess } from 'node:child_process'
import { cp, mkdtemp, realpath, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { existsSync } from 'node:fs'
import { HbarClient } from '@hbar/client'
import { bunExecutable, stopOwnedWebSessionHostChild } from './web-session-host'

const readySchema = z.strictObject({
  url: z.string().url(),
  token: z.string().min(1),
  sessionId: z.string().min(1),
  workspaceId: z.string().min(1),
})
export interface MaxModeFixture {
  readonly ready: z.output<typeof readySchema>
  readonly child: ChildProcess
  readonly client: HbarClient
  close(): Promise<void>
}
async function removeRoot(root: string) {
  const target = await realpath(root)
  if (
    dirname(target).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() ||
    !basename(target).startsWith('hbar-max-ui-')
  )
    throw new Error('Unowned MAX UI fixture')
  await rm(target, { recursive: true, force: true })
}
export async function startMaxModeFixture(): Promise<MaxModeFixture> {
  const root = await mkdtemp(join(tmpdir(), 'hbar-max-ui-'))
  try {
    await cp(resolve(process.env.HBAR_MAX_WEB_ASSETS ?? 'dist/web'), join(root, 'assets'), { recursive: true })
    if (!existsSync(join(root, 'assets', 'index.html'))) throw new Error('MAX fixture assets have no built index.html')
  } catch (error) {
    await removeRoot(root)
    throw error
  }
  const child = spawn(bunExecutable(), ['e2e/support/max-mode-host.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, HBAR_MAX_TEST_ROOT: root },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let client: HbarClient | undefined
  try {
    if (!child.stdout || !child.stderr) throw new Error('MAX fixture requires output pipes')
    const lines = createInterface({ input: child.stdout })
    let timer: ReturnType<typeof setTimeout> | undefined
    let diagnostics = ''
    child.stderr.on('data', (data: unknown) => {
      diagnostics = `${diagnostics}${String(data)}`.slice(-16_384)
    })
    const ready = await new Promise<z.output<typeof readySchema>>((done, reject) => {
      timer = setTimeout(() => reject(new Error(`MAX Host did not start: ${diagnostics}`)), 30_000)
      lines.on('line', (line) => {
        try {
          const parsed = readySchema.safeParse(JSON.parse(line))
          if (parsed.success) done(parsed.data)
        } catch {
          /* Diagnostics are not protocol lines. */
        }
      })
      child.once('error', reject)
      child.once('exit', (code) => reject(new Error(`MAX Host exited ${code}: ${diagnostics}`)))
    }).finally(() => {
      if (timer) clearTimeout(timer)
      lines.close()
    })
    client = new HbarClient(ready.url, ready.token)
    await client.connect()
    return {
      ready,
      child,
      client,
      async close() {
        client?.disconnect()
        await stopOwnedWebSessionHostChild(child)
        await removeRoot(root)
      },
    }
  } catch (error) {
    client?.disconnect()
    await stopOwnedWebSessionHostChild(child)
    await removeRoot(root)
    throw error
  }
}
