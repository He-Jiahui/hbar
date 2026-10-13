import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LocalExecution } from '@hbar/local-tools'
import { nodeFloorSchema, type NodeExecStart } from '@hbar/contracts/node'
import { nodeExecOutputReadResultSchema } from '@hbar/contracts/node-execution-output'
import { NodeStateStorage } from '@hbar/storage/node-state'
import { WorkspaceNodeProtocol, WorkspaceNodeService, type NodeExecutionBackend } from '@hbar/node-core'

test('NodeService retains output, emits only credited notifications, and finishes with the durable receipt', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-node-output-service-'))
  const workspace = join(root, 'workspace')
  const dataRoot = join(root, 'node')
  await mkdir(join(workspace, '.git', 'hooks'), { recursive: true })
  await mkdir(join(workspace, '.hbar-worktrees'), { recursive: true })
  await mkdir(join(workspace, '.hbar-worktrees'), { recursive: true })
  await mkdir(dataRoot)
  const state = new NodeStateStorage(join(dataRoot, 'node.sqlite'))
  await state.call('ready', {})
  await state.call(
    'floor.set',
    nodeFloorSchema.parse({
      roots: [{ rootId: 'engine', name: 'Engine', path: workspace, access: 'write' }],
      network: true,
      osConfinement: 'off',
    }),
  )
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const backend: NodeExecutionBackend = {
    name: 'bwrap',
    filesystem: true,
    network: true,
    processTree: true,
    async exec(_root, _command, _signal, options) {
      options.onOutput?.('first')
      await held
      options.onOutput?.('second')
      return { text: 'firstsecond', details: { code: 0, truncated: false } }
    },
  }
  const local = new LocalExecution([dataRoot], undefined, undefined, { get: () => [] })
  const node = await WorkspaceNodeService.open('node-a', dataRoot, state, local, backend)
  const protocol = new WorkspaceNodeProtocol(node)
  const chunks: Array<{ operationId: string; streamId: string; seq: number; text: string }> = []
  const exits: Array<{ operationId: string; receipt: { state: string } }> = []
  const offOutput = node.onExecutionOutput((chunk) => chunks.push(chunk))
  const offExit = node.onExecutionExit((event) => exits.push(event))
  const request: NodeExecStart = {
    operationId: 'run:call',
    rootId: 'engine',
    expectedRoot: workspace,
    sessionId: 'session',
    runId: 'run',
    callId: 'call',
    sandbox: null,
    admission: { kind: 'allow' },
    cwd: '.',
    command: 'test',
    timeoutMs: 5_000,
  }
  try {
    expect((await node.start(request)).state).toBe('started')
    const pageDeadline = Date.now() + 5_000
    let firstPage = nodeExecOutputReadResultSchema.parse(
      await protocol.invoke('exec.output.read', { operationId: 'run:call', afterSeq: 0 }, AbortSignal.timeout(5_000)),
    )
    while (firstPage.items.length === 0 && Date.now() < pageDeadline) {
      await Bun.sleep(5)
      firstPage = nodeExecOutputReadResultSchema.parse(
        await protocol.invoke('exec.output.read', { operationId: 'run:call', afterSeq: 0 }, AbortSignal.timeout(5_000)),
      )
    }
    expect(firstPage.items.map((item) => item.text)).toEqual(['first'])
    expect(chunks).toEqual([])
    await protocol.invoke(
      'exec.output.credit',
      {
        operationId: 'run:call',
        streamId: firstPage.streamId,
        throughSeq: firstPage.cursor,
        bytes: 64 * 1024,
      },
      AbortSignal.timeout(5_000),
    )
    release()
    await Bun.sleep(10)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toMatchObject({ streamId: firstPage.streamId, seq: 2, text: 'second' })
    const deadline = Date.now() + 5_000
    let receipt = await node.receipt('run:call')
    while (receipt.state !== 'settled' && Date.now() < deadline) {
      await Bun.sleep(5)
      receipt = await node.receipt('run:call')
    }
    expect(receipt).toMatchObject({ state: 'settled', result: { text: 'firstsecond' } })
    const tail = nodeExecOutputReadResultSchema.parse(
      await protocol.invoke(
        'exec.output.read',
        {
          operationId: 'run:call',
          afterSeq: firstPage.cursor,
        },
        AbortSignal.timeout(5_000),
      ),
    )
    expect(tail).toMatchObject({ terminal: true, reset: false, items: [{ seq: 2, text: 'second' }] })
    await Bun.sleep(10)
    expect(exits).toHaveLength(1)
    expect(exits[0]?.receipt.state).toBe('settled')
  } finally {
    release()
    offOutput()
    offExit()
    await protocol.dispose()
    await node.dispose()
    await state.close()
    await rm(root, { recursive: true, force: true })
  }
})
