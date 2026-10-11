import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { expect, test } from 'bun:test'
import { Kernel, MemorySecrets } from '@hbar/kernel'

async function removeFixture(root: string): Promise<void> {
  const actual = await realpath(root)
  if (dirname(actual) !== resolve(tmpdir()) || !basename(actual).startsWith('hbar-image-generation-recovery-'))
    throw new Error('Refusing cleanup outside the exact image recovery fixture')
  await rm(actual, { recursive: true, force: true })
}

function deferred(): { readonly promise: Promise<void>; release(): void } {
  let release = (): void => {}
  const promise = new Promise<void>((resolvePromise) => {
    release = resolvePromise
  })
  return { promise, release }
}

test('crash recovery marks the started image effect unknown and never automatically sends it again', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-image-generation-recovery-'))
  const requestStarted = deferred()
  let requests = 0
  const provider = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      requests += 1
      expect(request.headers.get('authorization')).toBe('Bearer fixture-secret-token')
      await request.json()
      requestStarted.release()
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"data":['))
          },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      )
    },
  })
  const child = Bun.spawn(
    [process.execPath, 'tests/fixtures/image-generation-crash-child.ts', root, String(provider.port)],
    { stdout: 'pipe', stderr: 'pipe', windowsHide: true },
  )
  let recovered: Kernel | undefined
  try {
    await Promise.race([
      requestStarted.promise,
      Bun.sleep(10_000).then(() => {
        throw new Error('Child did not start its durable image-generation request')
      }),
    ])
    expect(requests).toBe(1)
    child.kill()
    const exit = await child.exited
    expect(exit).not.toBe(0)

    const secrets = new MemorySecrets()
    await secrets.set('fixture-images', 'fixture-secret-token')
    recovered = await Kernel.create({
      home: join(root, 'data'),
      workspace: root,
      demo: true,
      secrets,
    })
    await recovered.waitForIdle()
    expect(recovered.recovered).toBe(1)
    const session = (await recovered.storage.call('sessions'))[0]
    if (!session) throw new Error('Recovered image fixture session is missing')
    const snapshot = await recovered.snapshot(session.id)
    expect(snapshot.runs[0]?.status).toBe('interrupted')
    const toolResult = snapshot.messages
      .flatMap((message) => message.content)
      .find((block) => block.type === 'tool_result' && block.name === 'image_generate')
    if (!toolResult || toolResult.type !== 'tool_result')
      throw new Error('Recovery snapshot omitted the image tool result')
    expect(toolResult.outcome).toMatchObject({ kind: 'unknown', executionStarted: true })
    const events = await recovered.storage.call('events', session.id, 0)
    expect(events.filter((event) => event.type === 'tool.unknown')).toHaveLength(1)
    await Bun.sleep(50)
    expect(requests).toBe(1)
  } finally {
    if (child.exitCode === null) child.kill()
    if (child.exitCode === null) await child.exited
    await recovered?.close()
    await provider.stop(true)
    await removeFixture(root)
  }
}, 30_000)
