import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { osConfinementOptionsSchema } from '@hbar/plugin-sdk'

test('confinement contracts reject malformed and undeclared requirements', () => {
  const request = {
    level: 'elevated' as const,
    writableRoots: ['/workspace'],
    readableRoots: [],
    networkEnabled: false,
    envOverrides: {},
  }
  expect(osConfinementOptionsSchema.parse(JSON.parse(JSON.stringify(request)))).toEqual(request)
  expect(osConfinementOptionsSchema.safeParse({ ...request, networkEnabled: 'false' }).success).toBe(false)
  expect(osConfinementOptionsSchema.safeParse({ ...request, fallback: true }).success).toBe(false)
})

for (const platform of ['linux', 'darwin', 'win32'])
  test(`a ${platform} execution refuses unavailable confinement before creating effects`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-confinement-'))
    const source = `
    Object.defineProperty(process, 'platform', { value: ${JSON.stringify(platform)} })
    const { LocalExecution } = await import('@hbar/local-tools')
    const execution = new LocalExecution()
    try {
      const result = await execution.exec(${JSON.stringify(root)}, 'echo bypass > marker.txt', new AbortController().signal, {
        osConfinement: { level: 'elevated', writableRoots: [], readableRoots: [], networkEnabled: false, envOverrides: {} },
      })
      console.log(JSON.stringify(result))
    } finally { execution.dispose() }
  `
    const child = Bun.spawn([process.execPath, '-e', source], {
      cwd: process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
      windowsHide: true,
    })
    try {
      const [text, errors, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ])
      expect(errors).toBe('')
      expect(code).toBe(0)
      expect(JSON.parse(text)).toMatchObject({
        isError: true,
        details: { code: 'SANDBOX_BACKEND_UNAVAILABLE', executionStarted: false },
      })
      expect(await Bun.file(join(root, 'marker.txt')).exists()).toBe(false)
    } finally {
      if (child.exitCode === null) {
        child.kill()
        await child.exited
      }
      await rm(root, { recursive: true, force: true })
    }
  })
