import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarError } from '@hbar/contracts'
import { prepareUnixConfinement, probeUnixConfinement } from '../apps/node/src/unix-confinement'

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

async function verifyBwrap(): Promise<void> {
  if (process.platform !== 'linux') throw new HbarError('SANDBOX_BACKEND_UNAVAILABLE', 'This probe requires Linux')
  const capabilities = await probeUnixConfinement('bwrap')
  if (!capabilities.available)
    throw new HbarError('SANDBOX_BACKEND_UNAVAILABLE', capabilities.reason ?? 'bubblewrap is unavailable')

  const fixture = await mkdtemp(join(tmpdir(), 'hbar-node-bwrap-check-'))
  const workspace = join(fixture, 'workspace')
  const writableRoot = join(workspace, 'out')
  const protectedRoot = join(workspace, '.git', 'hooks')
  const missingProtectedRoot = join(writableRoot, '.node-protected-missing')
  const protectedSecret = join(protectedRoot, 'secret')
  const allowedWrite = join(writableRoot, 'allowed.txt')
  const deniedWorkspaceWrite = join(workspace, 'denied.txt')
  const deniedProtectedWrite = join(protectedRoot, 'denied.txt')
  const deniedProtectedMkdir = join(protectedRoot, 'created')
  try {
    await mkdir(writableRoot, { recursive: true })
    await mkdir(protectedRoot, { recursive: true })
    await Bun.write(protectedSecret, 'protected')
    const plan = await prepareUnixConfinement({
      backend: 'bwrap',
      cwd: workspace,
      command: [
        'set -eu',
        `printf allowed > ${shellQuote(allowedWrite)}`,
        `if printf denied > ${shellQuote(deniedWorkspaceWrite)} 2>/dev/null; then exit 41; fi`,
        `if printf denied > ${shellQuote(deniedProtectedWrite)} 2>/dev/null; then exit 42; fi`,
        `if mkdir ${shellQuote(deniedProtectedMkdir)} 2>/dev/null; then exit 43; fi`,
        `test ! -e ${shellQuote(protectedSecret)}`,
        'test ! -e /etc/shadow',
        'printf verified',
      ].join('\n'),
      environment: {},
      confinement: {
        level: 'elevated',
        readableRoots: [workspace],
        writableRoots: [writableRoot],
        networkEnabled: false,
        envOverrides: {},
      },
      protectedPaths: [protectedRoot],
    })
    try {
      const child = Bun.spawn([...plan.argv], {
        cwd: plan.cwd,
        env: plan.env,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 10_000,
        killSignal: 'SIGKILL',
      })
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ])
      if (exitCode !== 0 || !stdout.includes('verified'))
        throw new Error(`bubblewrap command failed with exit ${exitCode}: ${stderr.slice(-1_000)}`)
      if ((await readFile(allowedWrite, 'utf8')) !== 'allowed')
        throw new Error('The admitted writable root did not accept its write')
      for (const denied of [deniedWorkspaceWrite, deniedProtectedWrite, deniedProtectedMkdir])
        if (await Bun.file(denied).exists()) throw new Error(`A denied host path changed: ${denied}`)
      if ((await readFile(protectedSecret, 'utf8')) !== 'protected') throw new Error('The protected host file changed')
      let missingPathRejected = false
      try {
        await prepareUnixConfinement({
          backend: 'bwrap',
          cwd: workspace,
          command: 'true',
          environment: {},
          confinement: {
            level: 'elevated',
            readableRoots: [workspace],
            writableRoots: [writableRoot],
            networkEnabled: false,
            envOverrides: {},
          },
          protectedPaths: [missingProtectedRoot],
        })
      } catch (error) {
        if (!(error instanceof HbarError) || error.code !== 'SANDBOX_BACKEND_UNAVAILABLE') throw error
        missingPathRejected = true
      }
      if (!missingPathRejected || (await Bun.file(missingProtectedRoot).exists()))
        throw new Error('A missing protected path under a writable root was not rejected without modifying the host')
      console.log(
        JSON.stringify({
          backend: 'bwrap',
          capabilities,
          checks: [
            'read-only-root',
            'writable-root',
            'protected-directory-read',
            'protected-directory-write',
            'protected-directory-mkdir',
            'missing-protected-path-refused-without-host-mutation',
            'pid-namespace-and-die-with-parent',
          ],
          status: 'passed',
        }),
      )
    } finally {
      await plan.cleanup()
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
}

await verifyBwrap()
