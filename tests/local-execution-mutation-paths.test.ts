import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { LocalExecution } from '@hbar/local-tools'

function latch() {
  let release = () => {}
  const promise = new Promise<void>((resolveLatch) => {
    release = resolveLatch
  })
  return { promise, release }
}

async function within<Value>(operation: Promise<Value>, label: string): Promise<Value> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Did not settle: ${label}`)), 2_000)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function withAliasFixture(
  operation: (root: string, local: LocalExecution) => Promise<void>,
  createExecution: () => LocalExecution = () => new LocalExecution(),
) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-mutation-paths-'))
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-mutation-paths-'))
    throw new Error('Refusing cleanup outside the exact owned mutation-path fixture')
  const local = createExecution()
  try {
    await mkdir(join(root, 'real'))
    await symlink(join(root, 'real'), join(root, 'alias'), process.platform === 'win32' ? 'junction' : 'dir')
    await operation(root, local)
  } finally {
    local.dispose()
    await rm(target, { recursive: true, force: true })
  }
}

test('directory aliases to one physical file share compare-and-write exclusion', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-alias-cas-'))
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-alias-cas-'))
    throw new Error('Refusing cleanup outside the exact owned alias CAS fixture')
  let release = () => {}
  let timer: ReturnType<typeof setTimeout> | undefined
  let reads = 0
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  class ReadGatedExecution extends LocalExecution {
    protected override async readBytesLocal(workspace: string, path: string) {
      const text = await super.readBytesLocal(workspace, path)
      reads++
      // Existing alias keys admit both reads. A future canonical lock admits
      // only the first; the bounded fallback releases that first writer.
      timer ??= setTimeout(release, 1_000)
      if (reads === 2) release()
      await gate
      return text
    }
  }
  const local = new ReadGatedExecution()
  try {
    await mkdir(join(root, 'real'))
    await symlink(join(root, 'real'), join(root, 'alias'), process.platform === 'win32' ? 'junction' : 'dir')
    await Bun.write(join(root, 'real', 'claim.txt'), 'unclaimed')
    const expectedRevision = createHash('sha256').update('unclaimed').digest('hex')
    const settled = await Promise.allSettled(
      ['real/claim.txt', 'alias/claim.txt'].map((path, index) =>
        local.write(root, path, `writer-${index}`, { expectedRevision }),
      ),
    )
    expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(settled.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(settled.find((result) => result.status === 'rejected')).toMatchObject({ reason: { code: 'FILE_CONFLICT' } })
    expect(await readFile(join(root, 'real', 'claim.txt'), 'utf8')).toMatch(/^writer-[01]$/)
  } finally {
    if (timer) clearTimeout(timer)
    release()
    local.dispose()
    await rm(target, { recursive: true, force: true })
  }
})

test('new nested targets use their nearest existing canonical parent for alias CAS', async () => {
  const gate = latch()
  let timer: ReturnType<typeof setTimeout> | undefined
  let reads = 0
  let missingReads = 0
  const arrive = async () => {
    reads++
    timer ??= setTimeout(gate.release, 1_000)
    if (reads === 2) gate.release()
    await gate.promise
  }
  class MissingReadGatedExecution extends LocalExecution {
    protected override async readBytesLocal(workspace: string, path: string) {
      let text: Awaited<ReturnType<LocalExecution['readBytes']>>
      try {
        text = await super.readBytesLocal(workspace, path)
      } catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
        missingReads++
        await arrive()
        throw error
      }
      await arrive()
      return text
    }
  }
  try {
    await withAliasFixture(
      async (root, local) => {
        const expectedRevision = createHash('sha256').update('').digest('hex')
        const paths = ['real/added/deep/claim.txt', 'alias/added/deep/claim.txt']
        const settled = await Promise.allSettled(
          paths.map((path, index) => local.write(root, path, `creator-${index}`, { expectedRevision })),
        )
        expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
        expect(settled.filter((result) => result.status === 'rejected')).toHaveLength(1)
        expect(settled.find((result) => result.status === 'rejected')).toMatchObject({
          reason: { code: 'FILE_CONFLICT' },
        })
        expect(missingReads).toBe(1)
        expect(await readFile(join(root, 'real', 'added', 'deep', 'claim.txt'), 'utf8')).toMatch(/^creator-[01]$/)
        const winner = settled.find((result) => result.status === 'fulfilled')
        expect(winner?.status === 'fulfilled' ? winner.value.created : undefined).toBe(true)
      },
      () => new MissingReadGatedExecution(),
    )
  } finally {
    if (timer) clearTimeout(timer)
    gate.release()
  }
})

test('lexical dot segments and Windows case aliases keep their displayed receipt path', async () => {
  await withAliasFixture(async (root, local) => {
    await Bun.write(join(root, 'real', 'claim.txt'), 'before')
    const alias = process.platform === 'win32' ? 'ALIAS' : 'alias'
    const receipt = await local.write(root, `${alias}/./unused/../claim.txt`, 'after')
    expect(receipt.path).toBe(`${alias}/claim.txt`)
    expect(receipt.before).toBe('before')
    expect(receipt.after).toBe('after')
    expect(receipt.created).toBe(false)
    expect(await readFile(join(root, 'real', 'claim.txt'), 'utf8')).toBe('after')
  })
})

test('Windows case variants of a junction and final basename share alias CAS', async () => {
  if (process.platform !== 'win32') return
  const gate = latch()
  let timer: ReturnType<typeof setTimeout> | undefined
  let reads = 0
  class CaseReadGatedExecution extends LocalExecution {
    protected override async readBytesLocal(workspace: string, path: string) {
      const text = await super.readBytesLocal(workspace, path)
      reads++
      timer ??= setTimeout(gate.release, 1_000)
      if (reads === 2) gate.release()
      await gate.promise
      return text
    }
  }
  try {
    await withAliasFixture(
      async (root, local) => {
        await Bun.write(join(root, 'real', 'claim.txt'), 'unclaimed')
        const expectedRevision = createHash('sha256').update('unclaimed').digest('hex')
        const settled = await Promise.allSettled(
          ['real/claim.txt', 'ALIAS/CLAIM.TXT'].map((path, index) =>
            local.write(root, path, `writer-${index}`, { expectedRevision }),
          ),
        )
        expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
        expect(settled.find((result) => result.status === 'rejected')).toMatchObject({
          reason: { code: 'FILE_CONFLICT' },
        })
        expect(await readFile(join(root, 'real', 'claim.txt'), 'utf8')).toMatch(/^writer-[01]$/)
      },
      () => new CaseReadGatedExecution(),
    )
  } finally {
    if (timer) clearTimeout(timer)
    gate.release()
  }
})

test('one held file mutation does not block another physical file in the same directory', async () => {
  const entered = latch()
  const release = latch()
  let pending: Promise<unknown> | undefined
  let freePending: Promise<unknown> | undefined
  class HeldReadExecution extends LocalExecution {
    protected override async readBytesLocal(workspace: string, path: string) {
      const text = await super.readBytesLocal(workspace, path)
      if (path === 'alias/held.txt') {
        entered.release()
        await release.promise
      }
      return text
    }
  }
  await withAliasFixture(
    async (root, local) => {
      await Bun.write(join(root, 'real', 'held.txt'), 'held baseline')
      await Bun.write(join(root, 'real', 'free.txt'), 'free baseline')
      try {
        pending = local.write(root, 'alias/held.txt', 'held final')
        await within(entered.promise, 'first file read')
        const freeWrite = local.write(root, 'real/free.txt', 'free final')
        freePending = freeWrite
        const free = await within(freeWrite, 'unrelated file write')
        expect(free.before).toBe('free baseline')
        expect(await readFile(join(root, 'real', 'held.txt'), 'utf8')).toBe('held baseline')
        expect(await readFile(join(root, 'real', 'free.txt'), 'utf8')).toBe('free final')
        release.release()
        await within(pending, 'released file write')
      } finally {
        release.release()
        await Promise.allSettled([...(pending ? [pending] : []), ...(freePending ? [freePending] : [])])
      }
    },
    () => new HeldReadExecution(),
  )
})

test('oppositely ordered restore batches share alias keys without self-deadlock', async () => {
  await withAliasFixture(async (root, local) => {
    await Bun.write(join(root, 'real', 'a.txt'), 'new a')
    await Bun.write(join(root, 'real', 'b.txt'), 'new b')
    const first = [
      { path: 'real/a.txt', before: 'old a', after: 'new a' },
      { path: 'alias/b.txt', before: 'old b', after: 'new b' },
    ]
    const second = [
      { path: 'real/b.txt', before: 'old b', after: 'new b' },
      { path: 'alias/a.txt', before: 'old a', after: 'new a' },
    ]
    await within(
      Promise.all([
        local.restoreFiles(root, first, new AbortController().signal),
        local.restoreFiles(root, second, new AbortController().signal),
      ]),
      'oppositely ordered restores',
    )
    expect(await readFile(join(root, 'real', 'a.txt'), 'utf8')).toBe('old a')
    expect(await readFile(join(root, 'real', 'b.txt'), 'utf8')).toBe('old b')
  })
})

test('failed writes and aborted restores release the canonical alias mutation key', async () => {
  await withAliasFixture(async (root, local) => {
    await Bun.write(join(root, 'real', 'claim.txt'), 'new')
    await expect(local.write(root, 'alias/claim.txt', 'x'.repeat(2 * 1024 * 1024 + 1))).rejects.toMatchObject({
      code: 'FILE_LIMIT',
    })
    const controller = new AbortController()
    controller.abort(new Error('fixture cancellation'))
    await expect(
      local.restoreFiles(root, [{ path: 'real/claim.txt', before: 'old', after: 'new' }], controller.signal),
    ).rejects.toMatchObject({ message: 'fixture cancellation' })
    const expectedRevision = createHash('sha256').update('new').digest('hex')
    await within(
      local.write(root, 'alias/claim.txt', 'final', { expectedRevision }),
      'write after failure and cancellation',
    )
    expect(await readFile(join(root, 'real', 'claim.txt'), 'utf8')).toBe('final')
  })
})

test('canonical mutation keys preserve workspace escape and protected path admission', async () => {
  await withAliasFixture(async (root) => {
    const workspace = join(root, 'workspace')
    const protectedPath = join(workspace, 'protected')
    const outside = join(root, 'outside')
    await mkdir(protectedPath, { recursive: true })
    await mkdir(outside)
    await Bun.write(join(protectedPath, 'claim.txt'), 'protected')
    await Bun.write(join(outside, 'claim.txt'), 'outside')
    await symlink(protectedPath, join(workspace, 'blocked'), process.platform === 'win32' ? 'junction' : 'dir')
    await symlink(outside, join(workspace, 'escape'), process.platform === 'win32' ? 'junction' : 'dir')
    const local = new LocalExecution([protectedPath])
    try {
      for (const path of ['blocked/claim.txt', 'escape/claim.txt', '../outside/claim.txt'])
        await expect(local.write(workspace, path, 'unexpected')).rejects.toMatchObject({ code: 'PATH_DENIED' })
      expect(await readFile(join(protectedPath, 'claim.txt'), 'utf8')).toBe('protected')
      expect(await readFile(join(outside, 'claim.txt'), 'utf8')).toBe('outside')
    } finally {
      local.dispose()
    }
  })
})
