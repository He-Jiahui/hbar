import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve, relative } from 'node:path'
import { createPathLayout } from '@hbar/storage'
import { MemorySecrets } from '@hbar/kernel/secrets'
import { HbarClient } from '@hbar/client'
import { ProcessHostRuntime } from '../apps/host/src/process-host-runtime'
import { startServer } from '../apps/host/src/server'
import { strict as assert } from 'node:assert'
const root = await mkdtemp(join(process.cwd(), 'artifacts', 'terminal-runtime-'))
const runtime = await ProcessHostRuntime.create({
  layout: createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json')),
  sourceRoot: process.cwd(),
  workspace: root,
  demo: true,
  secrets: new MemorySecrets(),
})
const host = await startServer(runtime.kernel, { port: 0, runtime, controller: runtime.controller })
const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
let output = ''
const remove = client.onEvent((event) => {
  if (event.method === 'terminal.output') output += event.params.data
})
async function until(check: () => boolean) {
  const deadline = Date.now() + 30_000
  while (!check()) {
    if (Date.now() >= deadline) throw new Error('Runtime terminal retention condition did not complete')
    await Bun.sleep(50)
  }
}
async function removeOwnedFixture(): Promise<void> {
  const owned = relative(resolve('artifacts'), root)
  if (!owned.startsWith('terminal-runtime-') || owned.startsWith('..')) throw new Error('Invalid terminal fixture root')
  await rm(root, { recursive: true, force: true, maxRetries: 40, retryDelay: 250 })
}
try {
  await client.pair(host.pairing.code, 'Isolated terminal retention probe')
  const workspace = (await runtime.storage.call('workspaces'))[0]!
  const terminal = await client.call('terminal.open', { workspaceId: workspace.id, cols: 120, rows: 40 })
  const token = crypto.randomUUID()
  await client.call('terminal.input', {
    terminalId: terminal.id,
    data:
      process.platform === 'win32'
        ? `$global:hbarRetentionProbe = '${token}'; Write-Output $global:hbarRetentionProbe\r`
        : `HBAR_RETENTION_PROBE='${token}'; printf '%s\\n' "$HBAR_RETENTION_PROBE"\n`,
  })
  await until(() => output.includes(token))
  const before = runtime.snapshot()
  const artifacts = []
  for (const id of ['kernel', 'controller']) {
    const unit = runtime.buildUnits.find((unit) => unit.descriptor.id === id)!
    const source = join(root, `${id}.ts`)
    await writeFile(
      source,
      (await readFile(unit.entrypoint, 'utf8')).replaceAll("'./", "'../../apps/host/src/") +
        '\nexport const terminalProbeRevision = 2\n',
    )
    artifacts.push(await runtime.artifacts.build({ ...unit, entrypoint: source }))
  }
  const reload = runtime.reload(runtime.artifacts.registerSet(artifacts).id, ['kernel', 'controller'])
  await runtime.manager.reconcile()
  await runtime.settled()
  await until(() =>
    runtime
      .snapshot()
      .units.filter((unit) => ['kernel', 'controller'].includes(unit.descriptor.id))
      .every((unit) =>
        unit.generations.some(
          (generation) =>
            generation.role === 'default' && generation.phase === 'serving' && generation.generation === 2,
        ),
      ),
  )
  assert.notEqual(runtime.getReload(reload.operationId).switchedAt, null)
  for (const unit of before.units) {
    const previous = unit.generations.find((generation) => generation.role === 'default')!
    const current = runtime
      .snapshot()
      .units.find((value) => value.descriptor.id === unit.descriptor.id)!
      .generations.find((generation) => generation.role === 'default')!
    if (['kernel', 'controller'].includes(unit.descriptor.id)) assert.equal(current.generation, previous.generation + 1)
    else assert.equal(current.pid, previous.pid)
  }
  assert.ok((await client.call('terminal.list', {})).some((item) => item.id === terminal.id))
  output = ''
  await client.call('terminal.input', {
    terminalId: terminal.id,
    data:
      process.platform === 'win32'
        ? 'Write-Output $global:hbarRetentionProbe\r'
        : 'printf "%s\\n" "$HBAR_RETENTION_PROBE"\n',
  })
  await until(() => output.includes(token))
  assert.equal(runtime.instanceId, before.instanceId)
  assert.equal(client.connectionStatus(), 'connected')
  await client.call('terminal.close', { terminalId: terminal.id })
  await until(() => runtime.getReload(reload.operationId).phase === 'completed')
  console.log('PASS: actual shell variable and terminal identity retained across Kernel and Controller replacement.')
} finally {
  remove()
  client.disconnect()
  await host.close()
  await runtime.close()
  await removeOwnedFixture()
}
