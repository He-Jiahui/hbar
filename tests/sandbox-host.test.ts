import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Approval, ContentBlock } from '@hbar/contracts'
import type { SandboxProfileSaveInput } from '@hbar/contracts/sandbox'
import { Kernel, MemorySecrets, SettingsService, createSandboxSettingsValidator } from '@hbar/kernel'
import { encodePath } from '@hbar/schema-core'

const profilePath = [{ kind: 'field' as const, name: 'session.sandboxProfile' }]
const roots: string[] = []
const kernels: Kernel[] = []
afterEach(async () => {
  for (const kernel of kernels.splice(0)) await kernel.close().catch(() => undefined)
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function open(home: string) {
  const workspace = join(dirname(home), 'workspace')
  await mkdir(workspace, { recursive: true })
  const kernel = await Kernel.create({ home, demo: true, workspace, secrets: new MemorySecrets() })
  kernels.push(kernel)
  return kernel
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-sandbox-host-'))
  roots.push(root)
  const home = join(root, 'data')
  const kernel = await open(home)
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id, 'sandbox')
  const approvals: Approval[] = []
  let decide: (approval: Approval) => 'allowed' | 'denied' = () => 'denied'
  kernel.subscribe((event) => {
    if (event.method !== 'session.event' || event.params.type !== 'approval.requested') return
    const approval = event.params.data as Approval
    approvals.push(approval)
    void kernel.resolveApproval(approval.id, decide(approval))
  })
  return {
    root,
    home,
    kernel,
    session,
    workspacePath: join(root, 'workspace'),
    approvals,
    onApproval(next: (approval: Approval) => 'allowed' | 'denied') {
      decide = next
    },
  }
}

function strict(overrides: Partial<SandboxProfileSaveInput> = {}): SandboxProfileSaveInput {
  return {
    id: 'strict',
    expectedRevision: null,
    name: 'Strict',
    description: '',
    extends: ':read-only',
    escalation: 'deny',
    filesystem: { default: null, grants: [{ path: 'src', access: 'write' }] },
    commands: { rules: [{ pattern: 'echo *', decision: 'allow' }] },
    network: { enabled: null },
    tools: { rules: [] },
    ...overrides,
  }
}

async function results(kernel: Kernel, sessionId: string) {
  return (await kernel.snapshot(sessionId)).messages
    .filter((message) => message.role === 'tool')
    .flatMap((message) => message.content)
    .filter((block): block is Extract<ContentBlock, { type: 'tool_result' }> => block.type === 'tool_result')
}

async function select(kernel: Kernel, sessionId: string, value: string) {
  const settings = new SettingsService(kernel.storage, createSandboxSettingsValidator(kernel.sandboxProfiles))
  const scope = { kind: 'session' as const, targetId: sessionId }
  const current = await settings.get(scope)
  return settings.apply({
    schemaVersion: 1,
    scope,
    changes: [{ op: 'set', path: profilePath, value }],
    baselineRevisions: current.revisions,
    actorId: 'device-a',
    idempotencyKey: `select-${sessionId}-${value}`,
  })
}

/**
 * Await a rejection directly. Under Bun's test runner, a pending Kernel promise handed to
 * `expect(...).rejects` can stall while it waits on a Storage Worker reply.
 */
async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('Expected the operation to fail')
}

const write = (path: string, text = path) => `/tool write_file ${JSON.stringify({ path, text })}`
const shell = (command: string) => `/tool shell ${JSON.stringify({ command })}`

test('admission pins a Host snapshot only for sandbox runs and rejects unknown digests', async () => {
  const f = await fixture()
  const sandboxed = await f.kernel.submit(
    f.session.id,
    'pin',
    { text: 'hi', images: [], approval: 'sandbox' },
    'local-fixture',
  )
  expect(sandboxed.input.sandbox).toMatchObject({ profileId: ':workspace-write' })
  expect(sandboxed.input.sandbox?.digest).toMatch(/^[a-f0-9]{64}$/)
  const again = await f.kernel.submit(
    f.session.id,
    'pin-2',
    { text: 'hi', images: [], approval: 'sandbox' },
    'local-fixture',
  )
  expect(again.input.sandbox).toEqual(sandboxed.input.sandbox)
  const asked = await f.kernel.submit(
    f.session.id,
    'strip',
    { text: 'hi', images: [], approval: 'ask', sandbox: sandboxed.input.sandbox! },
    'local-fixture',
  )
  expect(asked.input.sandbox).toBeUndefined()
  expect(
    await failure(
      f.kernel.submit(
        f.session.id,
        'forged',
        {
          text: 'hi',
          images: [],
          approval: 'sandbox',
          sandbox: { profileId: ':workspace-write', digest: 'a'.repeat(64) },
        },
        'local-fixture',
      ),
    ),
  ).toMatchObject({ code: 'SANDBOX_SNAPSHOT_NOT_FOUND' })
  await f.kernel.waitForIdle()
})

test('workspace-write writes in place, asks for protected paths and commands, and honors the decision', async () => {
  const f = await fixture()
  f.onApproval((approval) => (approval.tool === 'shell' ? 'allowed' : 'denied'))
  for (const [key, text] of [
    ['src', write('src/a.txt', 'written')],
    ['git', write('.git/hooks/pre-commit', 'blocked')],
    ['shell', shell('echo sandbox-shell')],
  ] as const)
    await f.kernel.submit(f.session.id, key, { text, images: [], approval: 'sandbox' }, 'local-fixture')
  await f.kernel.waitForIdle()
  expect(await Bun.file(join(f.workspacePath, 'src', 'a.txt')).text()).toBe('written')
  expect(await Bun.file(join(f.workspacePath, '.git', 'hooks', 'pre-commit')).exists()).toBe(false)
  expect(f.approvals.map((approval) => approval.tool)).toEqual(['write_file', 'shell'])
  const outcomes = (await results(f.kernel, f.session.id)).map((block) => [block.name, block.outcome?.kind])
  expect(outcomes).toEqual([
    ['write_file', 'succeeded'],
    ['write_file', 'denied'],
    ['shell', 'succeeded'],
  ])
})

test('a strict profile denies outside its grants without asking and admits allowed commands', async () => {
  const f = await fixture()
  await f.kernel.sandboxProfiles.save(strict(), { actorId: 'device-a', idempotencyKey: 'strict-1' })
  await select(f.kernel, f.session.id, 'strict')
  for (const [key, text] of [
    ['inside', write('src/ok.txt', 'ok')],
    ['outside', write('README.md', 'no')],
    ['echo', shell('echo strict-ok')],
    ['other', shell('whoami')],
  ] as const)
    await f.kernel.submit(f.session.id, key, { text, images: [], approval: 'sandbox' }, 'local-fixture')
  await f.kernel.waitForIdle()
  expect(f.approvals).toHaveLength(0)
  expect(await Bun.file(join(f.workspacePath, 'src', 'ok.txt')).text()).toBe('ok')
  expect(await Bun.file(join(f.workspacePath, 'README.md')).exists()).toBe(false)
  const blocks = await results(f.kernel, f.session.id)
  expect(blocks.map((block) => block.outcome?.kind)).toEqual(['succeeded', 'denied', 'succeeded', 'denied'])
  expect(blocks[1]?.text).toContain('Denied by sandbox profile strict')
  expect(blocks[1]?.text).toContain('README.md')
  expect(blocks[2]?.text).toContain('strict-ok')
  expect(blocks[3]?.text).toContain('matches no command rule')
})

test('sandboxed commands receive the profile environment; other modes do not', async () => {
  const f = await fixture()
  await f.kernel.sandboxProfiles.save(strict({ environment: { set: { HBAR_SANDBOX_PROBE: 'sandbox-env' } } }), {
    actorId: 'device-a',
    idempotencyKey: 'strict-env',
  })
  await select(f.kernel, f.session.id, 'strict')
  const probe =
    process.platform === 'win32' ? 'echo "probe=$env:HBAR_SANDBOX_PROBE"' : 'echo "probe=$HBAR_SANDBOX_PROBE"'
  await f.kernel.submit(
    f.session.id,
    'sandboxed',
    { text: shell(probe), images: [], approval: 'sandbox' },
    'local-fixture',
  )
  await f.kernel.submit(f.session.id, 'allowed', { text: shell(probe), images: [], approval: 'allow' }, 'local-fixture')
  await f.kernel.waitForIdle()
  const [sandboxed, allowed] = await results(f.kernel, f.session.id)
  expect(sandboxed?.outcome?.kind).toBe('succeeded')
  expect(sandboxed?.text).toContain('probe=sandbox-env')
  expect(allowed?.outcome?.kind).toBe('succeeded')
  expect(allowed?.text).not.toContain('sandbox-env')
})

test('a Run keeps the rules it was admitted with across profile edits and restarts', async () => {
  const f = await fixture()
  const saved = await f.kernel.sandboxProfiles.save(strict(), { actorId: 'device-a', idempotencyKey: 'strict-1' })
  await select(f.kernel, f.session.id, 'strict')
  const pinned = await f.kernel.submit(
    f.session.id,
    'pin',
    { text: 'hi', images: [], approval: 'sandbox' },
    'local-fixture',
  )
  await f.kernel.waitForIdle()
  await f.kernel.sandboxProfiles.save(
    strict({ expectedRevision: saved.revision, filesystem: { default: 'write', grants: [] } }),
    { actorId: 'device-a', idempotencyKey: 'strict-2' },
  )
  await f.kernel.close()
  const kernel = await open(f.home)
  const ref = pinned.input.sandbox!
  await kernel.submit(
    f.session.id,
    'old-rules',
    { text: write('README.md', 'old'), images: [], approval: 'sandbox', sandbox: ref },
    'local-fixture',
  )
  await kernel.submit(
    f.session.id,
    'new-rules',
    { text: write('NOTES.md', 'new'), images: [], approval: 'sandbox' },
    'local-fixture',
  )
  await kernel.waitForIdle()
  expect(await Bun.file(join(f.workspacePath, 'README.md')).exists()).toBe(false)
  expect(await Bun.file(join(f.workspacePath, 'NOTES.md')).text()).toBe('new')
})

test('symlinked paths are checked at their real location', async () => {
  const f = await fixture()
  await mkdir(join(f.workspacePath, '.git'), { recursive: true })
  await symlink(
    join(f.workspacePath, '.git'),
    join(f.workspacePath, 'alias'),
    process.platform === 'win32' ? 'junction' : 'dir',
  )
  await f.kernel.submit(
    f.session.id,
    'alias',
    { text: write('alias/config', 'escaped'), images: [], approval: 'sandbox' },
    'local-fixture',
  )
  await f.kernel.waitForIdle()
  expect(f.approvals.map((approval) => approval.tool)).toEqual(['write_file'])
  expect(await Bun.file(join(f.workspacePath, '.git', 'config')).exists()).toBe(false)
})

test('settings reject unknown profiles and a deleted selection fails admission instead of widening', async () => {
  const f = await fixture()
  expect(await failure(select(f.kernel, f.session.id, 'missing'))).toMatchObject({ code: 'SANDBOX_PROFILE_NOT_FOUND' })
  const saved = await f.kernel.sandboxProfiles.save(strict(), { actorId: 'device-a', idempotencyKey: 'strict-1' })
  const receipt = await select(f.kernel, f.session.id, 'strict')
  expect(receipt.resolution.reports[encodePath(profilePath)]?.effectiveValue).toBe('strict')
  await f.kernel.sandboxProfiles.delete(
    { id: 'strict', expectedRevision: saved.revision },
    { actorId: 'device-a', idempotencyKey: 'strict-delete' },
  )
  expect(
    await failure(
      f.kernel.submit(f.session.id, 'gone', { text: 'hi', images: [], approval: 'sandbox' }, 'local-fixture'),
    ),
  ).toMatchObject({ code: 'SANDBOX_PROFILE_NOT_FOUND' })
})
